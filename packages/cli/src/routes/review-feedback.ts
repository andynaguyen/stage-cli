import type { ServerResponse } from "node:http";
import { finished } from "node:stream/promises";
import type { ReviewFeedbackExport } from "@stagereview/types/review-feedback";
import type { StageDb } from "../db/client.js";
import {
	buildReviewFeedbackExport,
	type ReviewFeedbackSession,
	ReviewSessionConflictError,
} from "../review-feedback.js";
import type { Route } from "../server.js";
import { CommentThreadQuery } from "./comment-thread-query.js";
import { writeJson } from "./json.js";
import { enforceSameOrigin } from "./pull-request-shared.js";

export function reviewFeedbackRoutes(
	db: StageDb,
	runId: string,
	session: ReviewFeedbackSession,
): Route[] {
	const comments = new CommentThreadQuery(db);

	return [
		{
			method: "POST",
			pattern: "/api/feedback",
			handler: async (req, res) => {
				if (!enforceSameOrigin(req, res)) return;

				const threads = comments.listUnresolvedForRun(runId);
				if (threads === null) {
					throw new Error(`Active review run ${runId} not found`);
				}
				if (threads.length === 0) {
					writeJson(res, 409, { error: "No unresolved review feedback is available" });
					return;
				}

				const feedback = buildReviewFeedbackExport(session.scope, threads);

				await completeReviewSession(res, session, feedback);
			},
		},
	];
}

async function completeReviewSession(
	res: ServerResponse,
	session: ReviewFeedbackSession,
	result: ReviewFeedbackExport,
): Promise<void> {
	try {
		await session.complete(result, async () => {
			const responseFinished = finished(res, { cleanup: true });
			res.writeHead(204);
			res.end();
			await responseFinished;
		});
	} catch (error) {
		if (error instanceof ReviewSessionConflictError) {
			writeJson(res, 409, { error: error.message });
			return;
		}
		throw error;
	}
}
