import {
	type ReviewExitResponse,
	ReviewExitResponseSchema,
} from "@stagereview/types/review-feedback";
import { useMutation } from "@tanstack/react-query";
import { jsonFetch } from "./use-view-state";

export function useReviewExit() {
	return useMutation<ReviewExitResponse, Error>({
		mutationFn: async () => {
			const raw = await jsonFetch<unknown>("/api/exit", { method: "POST" });
			return ReviewExitResponseSchema.parse(raw);
		},
	});
}
