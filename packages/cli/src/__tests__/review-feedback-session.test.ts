import type { ReviewFeedbackExport } from "@stagereview/types/review-feedback";
import { describe, expect, it } from "vitest";
import { ReviewFeedbackSession, ReviewSessionConflictError } from "../review-feedback.js";
import { SCOPE_KIND, type Scope, WORKING_TREE_REF } from "../schema.js";

const WORKING_TREE_SCOPE: Scope = {
	kind: SCOPE_KIND.WORKING_TREE,
	ref: WORKING_TREE_REF.WORK,
	baseSha: "1".repeat(40),
	headSha: "2".repeat(40),
	mergeBaseSha: "1".repeat(40),
};

function makeResult(feedback: string): ReviewFeedbackExport {
	return {
		gitRef: "working tree",
		approved: false,
		feedback,
		annotations: [],
	};
}

describe("ReviewFeedbackSession", () => {
	it("resolves only after the successful submission is acknowledged", async () => {
		const session = new ReviewFeedbackSession(WORKING_TREE_SCOPE);
		let releaseAcknowledgement = () => {};
		const acknowledgement = new Promise<void>((resolve) => {
			releaseAcknowledgement = resolve;
		});
		let feedbackResolved = false;
		void session.result.then(() => {
			feedbackResolved = true;
		});

		const completion = session.complete(makeResult("feedback"), () => acknowledgement);
		await Promise.resolve();

		expect(feedbackResolved).toBe(false);
		await expect(session.complete(makeResult("conflict"), async () => {})).rejects.toBeInstanceOf(
			ReviewSessionConflictError,
		);

		releaseAcknowledgement();
		await completion;
		await expect(session.result).resolves.toEqual(makeResult("feedback"));
	});

	it("returns to pending when acknowledgement fails", async () => {
		const session = new ReviewFeedbackSession(WORKING_TREE_SCOPE);

		await expect(
			session.complete(makeResult("lost"), async () => {
				throw new Error("response failed");
			}),
		).rejects.toThrow("response failed");

		await session.complete(makeResult("retried"), async () => {});
		await expect(session.result).resolves.toEqual(makeResult("retried"));
	});
});
