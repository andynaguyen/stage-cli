import type { ServerResponse } from "node:http";
import { finished } from "node:stream/promises";
import type {
	ReviewExitResponse,
	ReviewFeedbackExport,
	ReviewFeedbackResponse,
} from "@stagereview/types/review-feedback";
import type { StageDb } from "../db/client.js";
import {
	buildEmptyReviewFeedbackExport,
	buildReviewFeedbackExport,
	type ReviewFeedbackSession,
	ReviewSessionConflictError,
} from "../review-feedback.js";
import type { Route } from "../server.js";
import { CommentThreadQuery } from "./comment-thread-query.js";
import { writeJson } from "./json.js";
import { enforceSameOrigin } from "./pull-request-shared.js";

export function reviewFeedbackRoutes(db: StageDb, session: ReviewFeedbackSession): Route[] {
	const comments = new CommentThreadQuery(db);

	return [
		{
			method: "POST",
			pattern: "/api/runs/:runId/feedback",
			handler: async (req, res, params) => {
				if (!enforceSameOrigin(req, res)) return;

				const threads = comments.listUnresolvedForRun(params.runId);
				if (threads === null) {
					writeJson(res, 404, { error: `Run ${params.runId} not found` });
					return;
				}
				if (threads.length === 0) {
					writeJson(res, 409, { error: "No unresolved review feedback is available" });
					return;
				}

				const response: ReviewFeedbackResponse = {
					threadCount: threads.length,
					commentCount: threads.reduce((count, thread) => count + thread.comments.length, 0),
				};
				const feedback = buildReviewFeedbackExport(session.gitRef, threads);

				await completeReviewSession(res, session, feedback, response);
			},
		},
		{
			method: "POST",
			pattern: "/api/exit",
			handler: async (req, res) => {
				if (!enforceSameOrigin(req, res)) return;

				await completeReviewSession(res, session, buildEmptyReviewFeedbackExport(session.gitRef), {
					closed: true,
				});
			},
		},
	];
}

async function completeReviewSession(
	res: ServerResponse,
	session: ReviewFeedbackSession,
	result: ReviewFeedbackExport,
	response: ReviewFeedbackResponse | ReviewExitResponse,
): Promise<void> {
	try {
		await session.complete(result, async () => {
			const responseFinished = finished(res, { cleanup: true });
			writeJson(res, 200, response);
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
