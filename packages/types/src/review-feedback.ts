import { z } from "zod";

export const REVIEW_ANNOTATION_TYPE = {
	COMMENT: "comment",
} as const;

export const REVIEW_ANNOTATION_SIDE = {
	NEW: "new",
	OLD: "old",
} as const;

export const ReviewFeedbackAnnotationSchema = z.strictObject({
	id: z.string(),
	threadId: z.string(),
	type: z.literal(REVIEW_ANNOTATION_TYPE.COMMENT),
	filePath: z.string(),
	lineStart: z.number().int().positive(),
	lineEnd: z.number().int().positive(),
	side: z.enum(REVIEW_ANNOTATION_SIDE),
	text: z.string(),
	authorId: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type ReviewFeedbackAnnotation = z.infer<typeof ReviewFeedbackAnnotationSchema>;

export const ReviewFeedbackExportSchema = z.strictObject({
	gitRef: z.string(),
	approved: z.boolean(),
	feedback: z.string(),
	annotations: z.array(ReviewFeedbackAnnotationSchema),
});
export type ReviewFeedbackExport = z.infer<typeof ReviewFeedbackExportSchema>;

export const ReviewFeedbackResponseSchema = z.object({
	threadCount: z.number().int().positive(),
	commentCount: z.number().int().positive(),
});
export type ReviewFeedbackResponse = z.infer<typeof ReviewFeedbackResponseSchema>;

export const ReviewExitResponseSchema = z.object({
	closed: z.literal(true),
});
export type ReviewExitResponse = z.infer<typeof ReviewExitResponseSchema>;
