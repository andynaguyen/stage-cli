import {
	type ReviewFeedbackResponse,
	ReviewFeedbackResponseSchema,
} from "@stagereview/types/review-feedback";
import { useMutation } from "@tanstack/react-query";
import { jsonFetch } from "./use-view-state";

export function useReviewFeedback() {
	return useMutation<ReviewFeedbackResponse, Error>({
		mutationFn: async () => {
			const raw = await jsonFetch<unknown>("/api/feedback", {
				method: "POST",
			});
			return ReviewFeedbackResponseSchema.parse(raw);
		},
	});
}
