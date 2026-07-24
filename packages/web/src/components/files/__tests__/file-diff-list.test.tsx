// @vitest-environment happy-dom

import type { CommentThread } from "@stagereview/types/comments";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createRef, type RefObject, useMemo, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FILE_STATUS } from "@/lib/diff-types";
import { parsePatchToFileDiffs } from "@/lib/parse-diff";
import { FileDiffList, type FileDiffListHandle } from "../file-diff-list";

vi.mock("@/components/chapter/pierre-diff-viewer", () => ({
	PierreDiffViewer: () => <div id="comment-thread-thread-1" tabIndex={-1} />,
}));

afterEach(() => {
	cleanup();
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
		render(<CollapsedFileList listRef={listRef} />);

		listRef.current?.scrollToCommentThread(THREAD);

		await waitFor(() => {
			expect(document.activeElement?.id).toBe("comment-thread-thread-1");
		});
		expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
	});
});
