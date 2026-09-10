// @vitest-environment happy-dom

import { COMMENT_ANCHOR } from "@stagereview/types/comments";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components/ui/sonner";
import { CommentThreadsProvider, useCommentThreadsContext } from "../comment-threads-context";
import { makeWrapper } from "./fixtures";

vi.mock("@/components/ui/sonner", () => ({ toast: { error: vi.fn(), dismiss: vi.fn() } }));

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

function stubFetch(status: number, body: string): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async () => new Response(body, { status, headers: { "Content-Type": "application/json" } }),
		),
	);
}

function ThreadGroups() {
	const { threadsByFile } = useCommentThreadsContext();
	const group = threadsByFile.get("src/example.ts");
	return (
		<output data-testid="thread-groups">
			{group === undefined ? "loading" : `${group.fileThreads.length}:${group.lineThreads.length}`}
		</output>
	);
}

describe("CommentThreadsProvider", () => {
	it("surfaces a failed threads fetch as a toast so it isn't mistaken for no comments", async () => {
		stubFetch(500, "boom");
		const { Wrapper } = makeWrapper();

		render(
			<CommentThreadsProvider runId="run1">
				<span>diff</span>
			</CommentThreadsProvider>,
			{ wrapper: Wrapper },
		);

		await waitFor(() =>
			expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
				"Couldn't load comments",
				expect.objectContaining({ id: "comment-threads-error" }),
			),
		);
	});

	it("does not toast when the fetch succeeds with no comments", async () => {
		stubFetch(200, "[]");
		const { Wrapper } = makeWrapper();

		render(
			<CommentThreadsProvider runId="run1">
				<span>diff</span>
			</CommentThreadsProvider>,
			{ wrapper: Wrapper },
		);

		await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));
		expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
	});

	it("partitions file and line anchors once in the comment data boundary", async () => {
		const shared = {
			filePath: "src/example.ts",
			resolvedAt: null,
			createdAt: "2026-07-26T00:00:00.000Z",
			updatedAt: "2026-07-26T00:00:00.000Z",
			comments: [
				{
					id: "comment-1",
					body: "Review this",
					authorId: "local",
					createdAt: "2026-07-26T00:00:00.000Z",
					updatedAt: "2026-07-26T00:00:00.000Z",
				},
			],
		};
		stubFetch(
			200,
			JSON.stringify([
				{
					...shared,
					id: "file-thread",
					anchor: COMMENT_ANCHOR.FILE,
					side: null,
					startLine: null,
					endLine: null,
				},
				{
					...shared,
					id: "line-thread",
					anchor: COMMENT_ANCHOR.LINE,
					side: "additions",
					startLine: 4,
					endLine: 4,
				},
			]),
		);
		const { Wrapper } = makeWrapper();

		render(
			<CommentThreadsProvider runId="run1">
				<ThreadGroups />
			</CommentThreadsProvider>,
			{ wrapper: Wrapper },
		);

		await waitFor(() => expect(screen.getByTestId("thread-groups").textContent).toBe("1:1"));
	});

	it("dismisses the error toast once a later fetch recovers", async () => {
		let calls = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				calls += 1;
				return calls === 1
					? new Response("boom", { status: 500 })
					: new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
			}),
		);
		const { client, Wrapper } = makeWrapper();

		render(
			<CommentThreadsProvider runId="run1">
				<span>diff</span>
			</CommentThreadsProvider>,
			{ wrapper: Wrapper },
		);

		await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
		// Ignore the no-op dismiss that runs before any error appears.
		vi.mocked(toast.dismiss).mockClear();

		await act(async () => {
			await client.refetchQueries();
		});

		await waitFor(() =>
			expect(vi.mocked(toast.dismiss)).toHaveBeenCalledWith("comment-threads-error"),
		);
	});
});
