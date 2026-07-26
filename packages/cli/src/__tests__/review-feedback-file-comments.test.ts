import { COMMENT_ANCHOR, type Comment, type FileCommentThread } from "@stagereview/types/comments";
import { describe, expect, it } from "vitest";
import { buildReviewFeedbackExport } from "../review-feedback.js";
import { SCOPE_KIND, type Scope, WORKING_TREE_REF } from "../schema.js";

const WORKING_TREE_SCOPE: Scope = {
	kind: SCOPE_KIND.WORKING_TREE,
	ref: WORKING_TREE_REF.WORK,
	baseSha: "1".repeat(40),
	headSha: "2".repeat(40),
	mergeBaseSha: "1".repeat(40),
};

function makeComment(id: string, body: string, createdAt: string): Comment {
	return {
		id,
		body,
		authorId: "local",
		createdAt,
		updatedAt: "2026-07-25T10:00:00.000Z",
	};
}

function makeFileThread(): FileCommentThread {
	return {
		id: "file-thread",
		filePath: "src/example.ts",
		anchor: COMMENT_ANCHOR.FILE,
		side: null,
		startLine: null,
		endLine: null,
		resolvedAt: null,
		createdAt: "2026-07-25T10:00:00.000Z",
		updatedAt: "2026-07-25T10:00:00.000Z",
		comments: [
			makeComment("root", "Consider splitting this file.", "2026-07-25T10:00:00.000Z"),
			makeComment("reply", "Agreed; the parser can move out.", "2026-07-25T11:00:00.000Z"),
		],
	};
}

describe("file-level review feedback", () => {
	it("includes file comments in Markdown without inventing line annotations", () => {
		const result = buildReviewFeedbackExport(WORKING_TREE_SCOPE, [makeFileThread()]);

		expect(result.feedback).toContain(`## src/example.ts

### File comment

Consider splitting this file.

Agreed; the parser can move out.`);
		expect(result.annotations).toEqual([]);
	});
});
