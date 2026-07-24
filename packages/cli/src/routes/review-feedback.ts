import { finished } from "node:stream/promises";
import type { ReviewFeedbackResponse } from "@stagereview/types/review-feedback";
import type { StageDb } from "../db/client.js";
import {
	formatReviewFeedback,
	ReviewFeedbackConflictError,
	type ReviewFeedbackSession,
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
				const feedback = formatReviewFeedback(threads);

				try {
					await session.submit(feedback, async () => {
						const responseFinished = finished(res, { cleanup: true });
						writeJson(res, 200, response);
						await responseFinished;
					});
				} catch (error) {
					if (error instanceof ReviewFeedbackConflictError) {
						writeJson(res, 409, { error: error.message });
						return;
					}
					throw error;
				}
			},
		},
	];
}
