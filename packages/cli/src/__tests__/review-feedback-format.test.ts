import type { Comment, CommentThread } from "@stagereview/types/comments";
import { describe, expect, it } from "vitest";
import { formatReviewFeedback } from "../review-feedback.js";

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

describe("formatReviewFeedback", () => {
	it("orders anchors and replies while excluding resolved threads", () => {
		const feedback = formatReviewFeedback([
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
				comments: [makeComment({ body: "Keep `markdown` intact." })],
			}),
		]);

		expect(feedback).toBe(`# Stage Review Feedback

## \`src/alpha.ts\` — additions, lines 2–5

Keep \`markdown\` intact.

## \`src/zeta.ts\` — deletions, line 9

First

**Second**

Address each comment above. Inspect the referenced code before changing it,
and explain any comment you believe should not be applied.
`);
	});

	it("fails loudly when there is no usable feedback", () => {
		expect(() => formatReviewFeedback([])).toThrow("empty Stage review feedback");
		expect(() => formatReviewFeedback([makeThread({ comments: [] })])).toThrow("has no comments");
	});
});
