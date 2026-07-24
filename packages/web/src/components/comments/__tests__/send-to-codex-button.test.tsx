// @vitest-environment happy-dom

import type { CommentThread } from "@stagereview/types/comments";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeWrapper } from "@/lib/__tests__/fixtures";
import { CommentThreadsProvider } from "@/lib/comment-threads-context";
import { SendToCodexButton } from "../send-to-codex-button";

afterEach(() => {
	cleanup();
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

function postCount(): number {
	return vi.mocked(fetch).mock.calls.filter(([, init]) => (init?.method ?? "GET") === "POST")
		.length;
}

function getConfirmationButton(trigger: HTMLElement): HTMLElement {
	const confirm = screen
		.getAllByRole("button", { name: "Send to Codex" })
		.find((button) => button !== trigger);
	if (confirm === undefined) throw new Error("Send confirmation button was not rendered");
	return confirm;
}

describe("SendToCodexButton", () => {
	it("disables the action when no unresolved threads exist", async () => {
		renderButton([makeThread({ resolvedAt: "2026-07-24T11:00:00.000Z" })], async () =>
			jsonResponse({ threadCount: 1, commentCount: 1 }),
		);

		const button = await screen.findByRole("button", { name: "Send to Codex" });
		expect(button.hasAttribute("disabled")).toBe(true);
	});

	it("opens a confirmation with the unresolved count without submitting", async () => {
		renderButton(
			[
				makeThread(),
				makeThread({ id: "thread-2", filePath: "src/other.ts" }),
				makeThread({ id: "thread-3", resolvedAt: "2026-07-24T11:00:00.000Z" }),
			],
			async () => jsonResponse({ threadCount: 2, commentCount: 2 }),
		);

		const button = await screen.findByRole("button", { name: "Send to Codex" });

		fireEvent.click(button);

		expect(await screen.findByText("Send review to Codex")).toBeTruthy();
		expect(screen.getByText("Pending comments")).toBeTruthy();
		expect(screen.getByText("2")).toBeTruthy();
		expect(postCount()).toBe(0);
	});

	it("cancels without submitting", async () => {
		renderButton([makeThread()], async () => jsonResponse({ threadCount: 1, commentCount: 1 }));
		const trigger = await screen.findByRole("button", { name: "Send to Codex" });
		fireEvent.click(trigger);
		await screen.findByText("Send review to Codex");

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		await waitFor(() => expect(screen.queryByText("Send review to Codex")).toBeNull());
		expect(postCount()).toBe(0);
	});

	it("prevents repeat confirmation while sending and after success", async () => {
		let finishSubmission = (_response: Response) => {};
		const pending = new Promise<Response>((resolve) => {
			finishSubmission = resolve;
		});
		renderButton([makeThread()], () => pending);
		const trigger = await screen.findByRole("button", { name: "Send to Codex" });
		fireEvent.click(trigger);
		await screen.findByText("Send review to Codex");
		const confirm = getConfirmationButton(trigger);

		fireEvent.click(confirm);
		await waitFor(() => expect(confirm.textContent).toContain("Sending…"));
		expect(confirm.hasAttribute("disabled")).toBe(true);

		finishSubmission(jsonResponse({ threadCount: 1, commentCount: 1 }));
		await waitFor(() => expect(confirm.textContent).toContain("Sent — closing Stage"));
		expect(confirm.hasAttribute("disabled")).toBe(true);
		fireEvent.click(confirm);
		expect(postCount()).toBe(1);
	});

	it("keeps the confirmation open with a recoverable error and allows retry", async () => {
		let submissions = 0;
		renderButton([makeThread()], async () => {
			submissions += 1;
			return submissions === 1
				? jsonResponse({ error: "failed" }, 500)
				: jsonResponse({ threadCount: 1, commentCount: 1 });
		});
		const trigger = await screen.findByRole("button", { name: "Send to Codex" });
		fireEvent.click(trigger);
		await screen.findByText("Send review to Codex");
		const confirm = getConfirmationButton(trigger);

		fireEvent.click(confirm);
		expect(await screen.findByRole("alert")).toBeTruthy();
		expect(confirm.hasAttribute("disabled")).toBe(false);

		fireEvent.click(confirm);
		await waitFor(() => expect(confirm.textContent).toContain("Sent — closing Stage"));
		expect(submissions).toBe(2);
	});
});
