import { z } from "zod";

export const CodexRequestIdSchema = z.union([z.string(), z.number()]);
export type CodexRequestId = z.infer<typeof CodexRequestIdSchema>;

export const CodexResponseSchema = z.union([
	z.object({
		id: CodexRequestIdSchema,
		result: z.unknown(),
	}),
	z.object({
		id: CodexRequestIdSchema,
		error: z.object({
			code: z.number(),
			message: z.string(),
		}),
	}),
]);
export type CodexResponse = z.infer<typeof CodexResponseSchema>;

export const CodexServerRequestSchema = z.object({
	method: z.string(),
	id: CodexRequestIdSchema,
	params: z.unknown(),
});
export type CodexServerRequest = z.infer<typeof CodexServerRequestSchema>;

export const CodexNotificationSchema = z.object({
	method: z.string(),
	params: z.unknown(),
});
export type CodexNotification = z.infer<typeof CodexNotificationSchema>;

export const ThreadStartResponseSchema = z.object({
	thread: z.object({
		id: z.string().min(1),
	}),
});

export const TurnStartResponseSchema = z.object({
	turn: z.object({
		id: z.string().min(1),
	}),
});

const ReasoningEffortOptionSchema = z.object({
	reasoningEffort: z.string().min(1),
	description: z.string(),
});

const ModelServiceTierSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string(),
});

const ModelSchema = z.object({
	id: z.string().min(1),
	displayName: z.string().min(1),
	description: z.string(),
	hidden: z.boolean(),
	supportedReasoningEfforts: z.array(ReasoningEffortOptionSchema),
	defaultReasoningEffort: z.string().min(1),
	serviceTiers: z.array(ModelServiceTierSchema),
	defaultServiceTier: z.string().min(1).nullable(),
	isDefault: z.boolean(),
});

export const ModelListResponseSchema = z.object({
	data: z.array(ModelSchema),
	nextCursor: z.string().min(1).nullable(),
});

export const AgentMessageDeltaNotificationSchema = z.object({
	threadId: z.string(),
	turnId: z.string(),
	itemId: z.string(),
	delta: z.string(),
});

const CommandExecutionItemSchema = z.object({
	type: z.literal("commandExecution"),
	id: z.string(),
	command: z.string(),
	status: z.enum(["inProgress", "completed", "failed", "declined"]),
	aggregatedOutput: z.string().nullable().optional(),
	exitCode: z.number().int().nullable().optional(),
});

const FileChangeItemSchema = z.object({
	type: z.literal("fileChange"),
	id: z.string(),
});

const AgentMessageItemSchema = z.object({
	type: z.literal("agentMessage"),
	id: z.string(),
	phase: z.enum(["commentary", "final_answer"]).nullable(),
});

export const ItemNotificationSchema = z.object({
	threadId: z.string(),
	turnId: z.string(),
	item: z.union([CommandExecutionItemSchema, FileChangeItemSchema, AgentMessageItemSchema]),
});

export const TurnCompletedNotificationSchema = z.object({
	threadId: z.string(),
	turn: z.object({
		id: z.string(),
		status: z.enum(["completed", "interrupted", "failed", "inProgress"]),
		error: z
			.object({
				message: z.string(),
			})
			.nullable(),
	}),
});

export const ErrorNotificationSchema = z.object({
	threadId: z.string(),
	turnId: z.string(),
	willRetry: z.boolean(),
	error: z.object({
		message: z.string(),
	}),
});

export const CommandApprovalRequestSchema = z.object({
	threadId: z.string(),
	turnId: z.string(),
	itemId: z.string(),
	reason: z.string().nullable().optional(),
	command: z.string().nullable().optional(),
	cwd: z.string().nullable().optional(),
});

export const FileChangeApprovalRequestSchema = z.object({
	threadId: z.string(),
	turnId: z.string(),
	itemId: z.string(),
	reason: z.string().nullable().optional(),
});

export const PermissionsApprovalRequestSchema = z.object({
	threadId: z.string(),
	turnId: z.string(),
	itemId: z.string(),
	reason: z.string().nullable(),
});
