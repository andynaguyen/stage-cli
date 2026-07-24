import type { EventEmitter } from "node:events";
import type { ReviewFeedbackExport } from "@stagereview/types/review-feedback";
import {
	buildEmptyReviewFeedbackExport,
	type ReviewFeedbackSession,
	serializeReviewFeedback,
} from "./review-feedback.js";

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

	let result: ReviewFeedbackExport;
	try {
		result = await waitForReviewResult(session, dependencies.signals);
	} finally {
		try {
			await dependencies.closeServer();
		} finally {
			dependencies.closeDatabase();
		}
	}

	dependencies.writeStdout(serializeReviewFeedback(result));
}

function waitForReviewResult(
	session: ReviewFeedbackSession,
	signals: EventEmitter,
): Promise<ReviewFeedbackExport> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (result: ReviewFeedbackExport) => {
			if (settled) return;
			settled = true;
			signals.removeListener("SIGINT", onSignal);
			signals.removeListener("SIGTERM", onSignal);
			resolve(result);
		};
		const onSignal = () => finish(buildEmptyReviewFeedbackExport(session.scope));

		signals.once("SIGINT", onSignal);
		signals.once("SIGTERM", onSignal);
		void session.result.then(finish);
	});
}
