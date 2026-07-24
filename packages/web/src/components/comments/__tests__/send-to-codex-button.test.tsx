// @vitest-environment happy-dom

import type { CommentThread } from "@stagereview/types/comments";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components/ui/sonner";
import { makeWrapper } from "@/lib/__tests__/fixtures";
import { CommentThreadsProvider } from "@/lib/comment-threads-context";
import { SendToCodexButton } from "../send-to-codex-button";

vi.mock("@/components/ui/sonner", () => ({ toast: { error: vi.fn(), dismiss: vi.fn() } }));

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

function makeThread(over: Partial<CommentThread> = {}): CommentThread {
	return {
		id: "thread-1",
		filePath: "src/example.ts",
		side: "additions",
		startLine: 4,
		endLine: 4,
		resolvedAt: null,
		createdAt: "2026-07-24T10:00:00.000Z",
		updatedAt: "2026-07-24T10:00:00.000Z",
		comments: [
			{
				id: "comment-1",
				body: "Please change this",
				authorId: "local",
				createdAt: "2026-07-24T10:00:00.000Z",
				updatedAt: "2026-07-24T10:00:00.000Z",
			},
		],
		...over,
	};
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function renderButton(threads: CommentThread[], submit: () => Promise<Response>) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = input.toString();
			if ((init?.method ?? "GET") === "POST" && url.endsWith("/feedback")) return submit();
			return jsonResponse(threads);
		}),
	);
	const { Wrapper } = makeWrapper();
	return render(
		<CommentThreadsProvider runId="run-1">
			<SendToCodexButton runId="run-1" />
		</CommentThreadsProvider>,
		{ wrapper: Wrapper },
	);
}

describe("SendToCodexButton", () => {
	it("disables the action when no unresolved threads exist", async () => {
		renderButton([makeThread({ resolvedAt: "2026-07-24T11:00:00.000Z" })], async () =>
			jsonResponse({ threadCount: 1, commentCount: 1 }),
		);

		const button = await screen.findByRole("button", {
			name: "Send to Codex · 0 unresolved threads",
		});
		expect(button.hasAttribute("disabled")).toBe(true);
	});

	it("shows the number of unresolved threads", async () => {
		renderButton(
			[
				makeThread(),
				makeThread({ id: "thread-2", filePath: "src/other.ts" }),
				makeThread({ id: "thread-3", resolvedAt: "2026-07-24T11:00:00.000Z" }),
			],
			async () => jsonResponse({ threadCount: 2, commentCount: 2 }),
		);

		const button = await screen.findByRole("button", {
			name: "Send to Codex · 2 unresolved threads",
		});
		expect(button.hasAttribute("disabled")).toBe(false);
	});

	it("prevents repeat submission while sending and after success", async () => {
		let finishSubmission = (_response: Response) => {};
		const pending = new Promise<Response>((resolve) => {
			finishSubmission = resolve;
		});
		renderButton([makeThread()], () => pending);
		const button = await screen.findByRole("button", {
			name: "Send to Codex · 1 unresolved thread",
		});

		fireEvent.click(button);
		await waitFor(() => expect(button.textContent).toContain("Sending…"));
		expect(button.hasAttribute("disabled")).toBe(true);

		finishSubmission(jsonResponse({ threadCount: 1, commentCount: 1 }));
		await waitFor(() => expect(button.textContent).toContain("Sent — closing Stage"));
		expect(button.hasAttribute("disabled")).toBe(true);
		fireEvent.click(button);
		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
	});

	it("shows a recoverable error and allows retry", async () => {
		let submissions = 0;
		renderButton([makeThread()], async () => {
			submissions += 1;
			return submissions === 1
				? jsonResponse({ error: "failed" }, 500)
				: jsonResponse({ threadCount: 1, commentCount: 1 });
		});
		const button = await screen.findByRole("button", {
			name: "Send to Codex · 1 unresolved thread",
		});

		fireEvent.click(button);
		await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1));
		expect(button.hasAttribute("disabled")).toBe(false);

		fireEvent.click(button);
		await waitFor(() => expect(button.textContent).toContain("Sent — closing Stage"));
		expect(submissions).toBe(2);
	});
});
