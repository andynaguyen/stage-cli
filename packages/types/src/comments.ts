import { z } from "zod";
import { DIFF_SIDE } from "./chapters.ts";

export const COMMENT_ANCHOR = {
	FILE: "file",
	LINE: "line",
} as const;

// A single authored comment. Replies are sibling comments sharing a thread, so a
// comment carries no positional data of its own — the thread owns the anchor.
// Non-strict (like the other wire response schemas) so the server can add fields
// the SPA doesn't yet read without the response failing to parse.
export const CommentSchema = z.object({
	id: z.string(),
	body: z.string(),
	authorId: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type Comment = z.infer<typeof CommentSchema>;

const CommentThreadBaseSchema = z.object({
	id: z.string(),
	filePath: z.string(),
	resolvedAt: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
	comments: z.array(CommentSchema),
});

export const FileCommentThreadSchema = CommentThreadBaseSchema.extend({
	anchor: z.literal(COMMENT_ANCHOR.FILE),
	side: z.null(),
	startLine: z.null(),
	endLine: z.null(),
});
export type FileCommentThread = z.infer<typeof FileCommentThreadSchema>;

export const LineCommentThreadSchema = CommentThreadBaseSchema.extend({
	anchor: z.literal(COMMENT_ANCHOR.LINE),
	side: z.enum(DIFF_SIDE),
	startLine: z.number().int().positive(),
	endLine: z.number().int().positive(),
});
export type LineCommentThread = z.infer<typeof LineCommentThreadSchema>;

// A file- or line-anchored conversation. `comments` is ordered oldest-first;
// the first is the thread's root. `resolvedAt` is null while the thread is open.
export const CommentThreadSchema = z.discriminatedUnion("anchor", [
	FileCommentThreadSchema,
	LineCommentThreadSchema,
]);
export type CommentThread = z.infer<typeof CommentThreadSchema>;

export const CommentThreadsResponseSchema = z.array(CommentThreadSchema);
export type CommentThreadsResponse = z.infer<typeof CommentThreadsResponseSchema>;

const CreateCommentThreadBaseSchema = z.object({
	filePath: z.string().min(1),
	body: z.string().min(1),
});

// Body for creating a thread + its root comment in one request.
export const CreateCommentThreadBodySchema = z
	.discriminatedUnion("anchor", [
		CreateCommentThreadBaseSchema.extend({
			anchor: z.literal(COMMENT_ANCHOR.FILE),
		}),
		CreateCommentThreadBaseSchema.extend({
			anchor: z.literal(COMMENT_ANCHOR.LINE),
			side: z.enum(DIFF_SIDE),
			startLine: z.number().int().positive(),
			endLine: z.number().int().positive(),
		}),
	])
	.superRefine((value, context) => {
		if (value.anchor === COMMENT_ANCHOR.LINE && value.startLine > value.endLine) {
			context.addIssue({
				code: "custom",
				message: "endLine must be greater than or equal to startLine",
				path: ["endLine"],
			});
		}
	});
export type CreateCommentThreadBody = z.infer<typeof CreateCommentThreadBodySchema>;

// Body for adding a reply or editing an existing comment.
export const CommentBodySchema = z.object({
	body: z.string().min(1),
});
export type CommentBody = z.infer<typeof CommentBodySchema>;

// Body for toggling a thread's resolved state.
export const ResolveThreadBodySchema = z.object({
	resolved: z.boolean(),
});
export type ResolveThreadBody = z.infer<typeof ResolveThreadBodySchema>;
