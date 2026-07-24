import { useMutation } from "@tanstack/react-query";
import { jsonFetch } from "./use-view-state";

export function useReviewFeedback() {
	return useMutation<void, Error>({
		mutationFn: async () => {
			await jsonFetch<unknown>("/api/feedback", {
				method: "POST",
			});
		},
	});
}
