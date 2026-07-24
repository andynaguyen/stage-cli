import type { Comment, CommentThread } from "@stagereview/types/comments";
import { describe, expect, it } from "vitest";
import {
	buildReviewFeedbackExport,
	formatReviewGitRef,
	serializeReviewFeedback,
} from "../review-feedback.js";

const SHA = {
	BASE: "1".repeat(40),
	HEAD: "2".repeat(40),
} as const;

function makeComment(over: Partial<Comment> = {}): Comment {
	return {
		id: "comment-1",
		body: "Root comment",
		authorId: "local",
		createdAt: "2026-07-24T10:00:00.000Z",
		updatedAt: "2026-07-24T10:00:00.000Z",
		...over,
	};
}

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
		comments: [makeComment()],
		...over,
	};
}

describe("buildReviewFeedbackExport", () => {
	it("emits Plannotator-compatible Markdown and raw annotations", () => {
		const result = buildReviewFeedbackExport("working tree", [
			makeThread({
				id: "deletion",
				filePath: "src/zeta.ts",
				side: "deletions",
				startLine: 9,
				endLine: 9,
				comments: [
					makeComment({ id: "reply", body: "**Second**", createdAt: "2026-07-24T12:00:00Z" }),
					makeComment({ id: "root", body: "First", createdAt: "2026-07-24T11:00:00Z" }),
				],
			}),
			makeThread({
				id: "resolved",
				filePath: "src/hidden.ts",
				resolvedAt: "2026-07-24T13:00:00Z",
				comments: [makeComment({ body: "Do not submit" })],
			}),
			makeThread({
				id: "addition",
				filePath: "src/alpha.ts",
				startLine: 2,
				endLine: 5,
				comments: [makeComment({ id: "alpha", body: "Keep `markdown` intact." })],
			}),
		]);

		expect(result).toEqual({
			gitRef: "working tree",
			approved: false,
			feedback: `# Code Review Feedback

**Diff:** Uncommitted changes

## src/alpha.ts

### Lines 2-5 (new)

Keep \`markdown\` intact.

## src/zeta.ts

### Line 9 (old)

First

**Second**
`,
			annotations: [
				{
					id: "alpha",
					threadId: "addition",
					type: "comment",
					filePath: "src/alpha.ts",
					lineStart: 2,
					lineEnd: 5,
					side: "new",
					text: "Keep `markdown` intact.",
					authorId: "local",
					createdAt: "2026-07-24T10:00:00.000Z",
					updatedAt: "2026-07-24T10:00:00.000Z",
				},
				{
					id: "root",
					threadId: "deletion",
					type: "comment",
					filePath: "src/zeta.ts",
					lineStart: 9,
					lineEnd: 9,
					side: "old",
					text: "First",
					authorId: "local",
					createdAt: "2026-07-24T11:00:00Z",
					updatedAt: "2026-07-24T10:00:00.000Z",
				},
				{
					id: "reply",
					threadId: "deletion",
					type: "comment",
					filePath: "src/zeta.ts",
					lineStart: 9,
					lineEnd: 9,
					side: "old",
					text: "**Second**",
					authorId: "local",
					createdAt: "2026-07-24T12:00:00Z",
					updatedAt: "2026-07-24T10:00:00.000Z",
				},
			],
		});
		expect(serializeReviewFeedback(result)).toBe(`${JSON.stringify(result, null, 2)}\n`);
	});

	it("formats reviewed scopes as stable gitRef labels", () => {
		expect(
			formatReviewGitRef({
				kind: "committed",
				baseSha: SHA.BASE,
				headSha: SHA.HEAD,
				mergeBaseSha: SHA.BASE,
			}),
		).toBe(`${SHA.BASE}..${SHA.HEAD}`);
		expect(
			formatReviewGitRef({
				kind: "workingTree",
				ref: "work",
				baseSha: SHA.BASE,
				headSha: SHA.HEAD,
				mergeBaseSha: SHA.BASE,
			}),
		).toBe("working tree");
		expect(
			formatReviewGitRef({
				kind: "workingTree",
				ref: "staged",
				baseSha: SHA.BASE,
				headSha: SHA.HEAD,
				mergeBaseSha: SHA.BASE,
			}),
		).toBe("--staged");
		expect(
			formatReviewGitRef({
				kind: "workingTree",
				ref: "unstaged",
				baseSha: SHA.BASE,
				headSha: SHA.HEAD,
				mergeBaseSha: SHA.BASE,
			}),
		).toBe("unstaged");
	});

	it("fails loudly when there is no usable feedback", () => {
		expect(() => buildReviewFeedbackExport("working tree", [])).toThrow(
			"empty Stage review feedback",
		);
		expect(() => buildReviewFeedbackExport("working tree", [makeThread({ comments: [] })])).toThrow(
			"has no comments",
		);
	});
});
