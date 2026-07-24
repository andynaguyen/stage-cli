import { z } from "zod";

export const ReviewFeedbackResponseSchema = z.object({
	threadCount: z.number().int().positive(),
	commentCount: z.number().int().positive(),
});
export type ReviewFeedbackResponse = z.infer<typeof ReviewFeedbackResponseSchema>;
