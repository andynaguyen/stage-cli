// @vitest-environment happy-dom

import { COMMENT_ANCHOR, type CommentThread } from "@stagereview/types/comments";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, type RefObject, useMemo, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeWrapper } from "@/lib/__tests__/fixtures";
import { CommentThreadsProvider } from "@/lib/comment-threads-context";
import { FILE_STATUS } from "@/lib/diff-types";
import { parsePatchToFileDiffs } from "@/lib/parse-diff";
import { FileDiffList, type FileDiffListHandle } from "../file-diff-list";

vi.mock("@/components/chapter/pierre-diff-viewer", () => ({
	PierreDiffViewer: () => <div id="comment-thread-thread-1" tabIndex={-1} />,
}));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const PATCH = `diff --git a/src/example.ts b/src/example.ts
index 1111111..2222222 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -1 +1 @@
-old
+new
`;

const THREAD: CommentThread = {
	id: "thread-1",
	filePath: "src/example.ts",
	anchor: COMMENT_ANCHOR.LINE,
	side: "additions",
	startLine: 1,
	endLine: 1,
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
};

function CollapsedFileList({ listRef }: { listRef: RefObject<FileDiffListHandle | null> }) {
	const [collapsedFiles, setCollapsedFiles] = useState<ReadonlySet<string>>(
		new Set([THREAD.filePath]),
	);
	const diff = parsePatchToFileDiffs(PATCH)[0];
	if (!diff) throw new Error("Test patch must contain one file");

	const collapseState = useMemo(
		() => ({
			collapsedFiles,
			toggleFileCollapsed: (filePath: string) => {
				setCollapsedFiles((current) => {
					const next = new Set(current);
					if (next.has(filePath)) next.delete(filePath);
					else next.add(filePath);
					return next;
				});
			},
			collapseAllFiles: () => setCollapsedFiles(new Set([THREAD.filePath])),
			expandAllFiles: () => setCollapsedFiles(new Set()),
		}),
		[collapsedFiles],
	);

	return (
		<FileDiffList
			ref={listRef}
			entries={[
				{
					file: {
						path: THREAD.filePath,
						filename: "example.ts",
						status: FILE_STATUS.MODIFIED,
						additions: 1,
						deletions: 1,
						hunks: [],
					},
					diff,
				},
			]}
			emptyMessage="No files"
			collapseState={collapseState}
		/>
	);
}

describe("FileDiffList comment navigation", () => {
	it("expands a collapsed file, scrolls to the thread, and focuses it", async () => {
		const scrollIntoView = vi.fn();
		Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
			configurable: true,
			value: scrollIntoView,
		});
		const listRef = createRef<FileDiffListHandle>();
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(JSON.stringify([THREAD]), {
						headers: { "Content-Type": "application/json" },
					}),
			),
		);
		const { Wrapper } = makeWrapper();
		render(
			<CommentThreadsProvider runId="run-1">
				<CollapsedFileList listRef={listRef} />
			</CommentThreadsProvider>,
			{ wrapper: Wrapper },
		);

		listRef.current?.scrollToCommentThread(THREAD);

		await waitFor(() => {
			expect(document.activeElement?.id).toBe("comment-thread-thread-1");
		});
		expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
	});

	it("opens a file composer and submits a file-level anchor", async () => {
		const requestBodies: unknown[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				if (init?.method === "POST") {
					requestBodies.push(JSON.parse(String(init.body)));
					return new Response("{}", {
						status: 201,
						headers: { "Content-Type": "application/json" },
					});
				}
				return new Response("[]", {
					headers: { "Content-Type": "application/json" },
				});
			}),
		);
		const { Wrapper } = makeWrapper();
		render(
			<CommentThreadsProvider runId="run-1">
				<CollapsedFileList listRef={createRef<FileDiffListHandle>()} />
			</CommentThreadsProvider>,
			{ wrapper: Wrapper },
		);

		fireEvent.click(screen.getByRole("button", { name: "Comment on this file" }));
		const textarea = await screen.findByPlaceholderText("Leave a comment on this file…");
		fireEvent.change(textarea, { target: { value: "Consider splitting this file." } });
		fireEvent.click(screen.getByRole("button", { name: "Comment" }));

		await waitFor(() => {
			expect(requestBodies).toEqual([
				{
					anchor: COMMENT_ANCHOR.FILE,
					filePath: THREAD.filePath,
					body: "Consider splitting this file.",
				},
			]);
		});
	});
});
