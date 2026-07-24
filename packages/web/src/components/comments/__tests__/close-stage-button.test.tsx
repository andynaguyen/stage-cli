// @vitest-environment happy-dom

import type { CommentThread } from "@stagereview/types/comments";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeWrapper } from "@/lib/__tests__/fixtures";
import { CommentThreadsProvider } from "@/lib/comment-threads-context";
import { CloseStageButton } from "../close-stage-button";

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

function renderButton(threads: CommentThread[], close: () => Promise<Response>) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = input.toString();
			if ((init?.method ?? "GET") === "POST" && url.endsWith("/api/exit")) return close();
			return jsonResponse(threads);
		}),
	);
	const { Wrapper } = makeWrapper();
	return render(
		<CommentThreadsProvider runId="run-1">
			<CloseStageButton />
		</CommentThreadsProvider>,
		{ wrapper: Wrapper },
	);
}

function postCount(): number {
	return vi.mocked(fetch).mock.calls.filter(([, init]) => (init?.method ?? "GET") === "POST")
		.length;
}

describe("CloseStageButton", () => {
	it("shows unsent comments without closing immediately", async () => {
		renderButton(
			[makeThread(), makeThread({ id: "resolved", resolvedAt: "2026-07-24T11:00:00Z" })],
			async () => jsonResponse({ closed: true }),
		);
		const trigger = await screen.findByRole("button", { name: "Close" });

		fireEvent.click(trigger);

		expect(await screen.findByText("Close Stage?")).toBeTruthy();
		expect(screen.getByText("Unsent comments")).toBeTruthy();
		expect(screen.getByText("1")).toBeTruthy();
		expect(postCount()).toBe(0);
	});

	it("cancels without closing", async () => {
		renderButton([], async () => jsonResponse({ closed: true }));
		fireEvent.click(await screen.findByRole("button", { name: "Close" }));
		await screen.findByText("Close Stage?");

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		await waitFor(() => expect(screen.queryByText("Close Stage?")).toBeNull());
		expect(postCount()).toBe(0);
	});

	it("locks the confirmation while closing and after success", async () => {
		let finishExit = (_response: Response) => {};
		const pending = new Promise<Response>((resolve) => {
			finishExit = resolve;
		});
		renderButton([], () => pending);
		fireEvent.click(await screen.findByRole("button", { name: "Close" }));
		const confirm = await screen.findByRole("button", { name: "Close Stage" });

		fireEvent.click(confirm);
		await waitFor(() => expect(confirm.textContent).toContain("Closing…"));
		expect(confirm.hasAttribute("disabled")).toBe(true);

		finishExit(jsonResponse({ closed: true }));
		await waitFor(() => expect(confirm.textContent).toContain("Stage closed"));
		expect(confirm.hasAttribute("disabled")).toBe(true);
		expect(postCount()).toBe(1);
	});

	it("keeps the confirmation open after an error and allows retry", async () => {
		let exits = 0;
		renderButton([], async () => {
			exits += 1;
			return exits === 1 ? jsonResponse({ error: "failed" }, 500) : jsonResponse({ closed: true });
		});
		fireEvent.click(await screen.findByRole("button", { name: "Close" }));
		const confirm = await screen.findByRole("button", { name: "Close Stage" });

		fireEvent.click(confirm);
		expect(await screen.findByRole("alert")).toBeTruthy();
		expect(confirm.hasAttribute("disabled")).toBe(false);

		fireEvent.click(confirm);
		await waitFor(() => expect(confirm.textContent).toContain("Stage closed"));
		expect(exits).toBe(2);
	});
});
