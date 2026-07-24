import type { ReviewFeedbackExport } from "@stagereview/types/review-feedback";
import { describe, expect, it } from "vitest";
import { ReviewFeedbackConflictError, ReviewFeedbackSession } from "../review-feedback.js";

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

		const submission = session.submit(makeResult("feedback"), () => acknowledgement);
		await Promise.resolve();

		expect(feedbackResolved).toBe(false);
		await expect(session.submit(makeResult("conflict"), async () => {})).rejects.toBeInstanceOf(
			ReviewFeedbackConflictError,
		);

		releaseAcknowledgement();
		await submission;
		await expect(session.result).resolves.toEqual(makeResult("feedback"));
	});

	it("returns to pending when acknowledgement fails", async () => {
		const session = new ReviewFeedbackSession("working tree");

		await expect(
			session.submit(makeResult("lost"), async () => {
				throw new Error("response failed");
			}),
		).rejects.toThrow("response failed");

		await session.submit(makeResult("retried"), async () => {});
		await expect(session.result).resolves.toEqual(makeResult("retried"));
	});
});
