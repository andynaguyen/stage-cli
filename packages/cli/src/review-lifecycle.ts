import type { EventEmitter } from "node:events";
import type { ReviewFeedbackSession } from "./review-feedback.js";

const REVIEW_OUTCOME = {
	FEEDBACK: "feedback",
	SIGNAL: "signal",
} as const;

type ReviewOutcome =
	| { kind: typeof REVIEW_OUTCOME.FEEDBACK; feedback: string }
	| { kind: typeof REVIEW_OUTCOME.SIGNAL };

export interface ReviewSessionDependencies {
	url: string;
	signals: EventEmitter;
	openBrowser: (url: string) => Promise<unknown>;
	closeServer: () => Promise<void>;
	closeDatabase: () => void;
	writeStdout: (text: string) => void;
	writeStderr: (text: string) => void;
}

export async function runReviewSession(
	session: ReviewFeedbackSession,
	dependencies: ReviewSessionDependencies,
): Promise<void> {
	dependencies.writeStderr(`Listening on ${dependencies.url}\n`);
	dependencies.writeStderr("Press Ctrl+C to exit without submitting feedback.\n");

	try {
		await dependencies.openBrowser(dependencies.url);
	} catch {
		// The listening URL above lets the user open Stage manually.
	}

	let outcome: ReviewOutcome;
	try {
		outcome = await waitForReviewOutcome(session, dependencies.signals);
	} finally {
		try {
			await dependencies.closeServer();
		} finally {
			dependencies.closeDatabase();
		}
	}

	if (outcome.kind === REVIEW_OUTCOME.FEEDBACK) {
		dependencies.writeStdout(outcome.feedback);
	}
}

function waitForReviewOutcome(
	session: ReviewFeedbackSession,
	signals: EventEmitter,
): Promise<ReviewOutcome> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (outcome: ReviewOutcome) => {
			if (settled) return;
			settled = true;
			signals.removeListener("SIGINT", onSignal);
			signals.removeListener("SIGTERM", onSignal);
			resolve(outcome);
		};
		const onSignal = () => finish({ kind: REVIEW_OUTCOME.SIGNAL });

		signals.once("SIGINT", onSignal);
		signals.once("SIGTERM", onSignal);
		void session.feedback.then((feedback) => {
			finish({ kind: REVIEW_OUTCOME.FEEDBACK, feedback });
		});
	});
}
