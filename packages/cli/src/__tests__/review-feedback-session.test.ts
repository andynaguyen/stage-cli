import { describe, expect, it } from "vitest";
import { ReviewFeedbackConflictError, ReviewFeedbackSession } from "../review-feedback.js";

describe("ReviewFeedbackSession", () => {
	it("resolves only after the successful submission is acknowledged", async () => {
		const session = new ReviewFeedbackSession();
		let releaseAcknowledgement = () => {};
		const acknowledgement = new Promise<void>((resolve) => {
			releaseAcknowledgement = resolve;
		});
		let feedbackResolved = false;
		void session.feedback.then(() => {
			feedbackResolved = true;
		});

		const submission = session.submit("feedback", () => acknowledgement);
		await Promise.resolve();

		expect(feedbackResolved).toBe(false);
		await expect(session.submit("conflict", async () => {})).rejects.toBeInstanceOf(
			ReviewFeedbackConflictError,
		);

		releaseAcknowledgement();
		await submission;
		await expect(session.feedback).resolves.toBe("feedback");
	});

	it("returns to pending when acknowledgement fails", async () => {
		const session = new ReviewFeedbackSession();

		await expect(
			session.submit("lost", async () => {
				throw new Error("response failed");
			}),
		).rejects.toThrow("response failed");

		await session.submit("retried", async () => {});
		await expect(session.feedback).resolves.toBe("retried");
	});
});
