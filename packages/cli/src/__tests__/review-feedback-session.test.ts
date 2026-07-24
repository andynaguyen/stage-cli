import type { ReviewFeedbackExport } from "@stagereview/types/review-feedback";
import { describe, expect, it } from "vitest";
import { ReviewFeedbackSession, ReviewSessionConflictError } from "../review-feedback.js";

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
		const session = new ReviewFeedbackSession("working tree");
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
		const session = new ReviewFeedbackSession("working tree");

		await expect(
			session.complete(makeResult("lost"), async () => {
				throw new Error("response failed");
			}),
		).rejects.toThrow("response failed");

		await session.complete(makeResult("retried"), async () => {});
		await expect(session.result).resolves.toEqual(makeResult("retried"));
	});
});
