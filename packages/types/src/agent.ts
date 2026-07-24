import { z } from "zod";
import { DIFF_SIDE } from "./chapters.ts";

export const AGENT_PROVIDER = {
	CODEX: "codex",
} as const;
export const AgentProviderIdSchema = z.enum(AGENT_PROVIDER);
export type AgentProviderId = z.infer<typeof AgentProviderIdSchema>;

export const AGENT_CAPABILITY_STATUS = {
	AVAILABLE: "available",
	MISSING: "missing",
	UNAUTHENTICATED: "unauthenticated",
	INCOMPATIBLE: "incompatible",
	ERROR: "error",
} as const;
export const AgentCapabilityStatusSchema = z.enum(AGENT_CAPABILITY_STATUS);
export type AgentCapabilityStatus = z.infer<typeof AgentCapabilityStatusSchema>;

export const AgentProviderCapabilitySchema = z.strictObject({
	providerId: AgentProviderIdSchema,
	label: z.string().min(1),
	status: AgentCapabilityStatusSchema,
	detail: z.string().min(1).nullable(),
});
export type AgentProviderCapability = z.infer<typeof AgentProviderCapabilitySchema>;

export const AgentCapabilitiesResponseSchema = z.strictObject({
	providers: z.array(AgentProviderCapabilitySchema),
});
export type AgentCapabilitiesResponse = z.infer<typeof AgentCapabilitiesResponseSchema>;

export const AgentSessionCreateRequestSchema = z.strictObject({
	providerId: AgentProviderIdSchema,
});
export type AgentSessionCreateRequest = z.infer<typeof AgentSessionCreateRequestSchema>;

export const AgentSessionResponseSchema = z.strictObject({
	sessionId: z.uuid(),
	providerId: AgentProviderIdSchema,
});
export type AgentSessionResponse = z.infer<typeof AgentSessionResponseSchema>;

export const AgentSelectionSchema = z
	.strictObject({
		filePath: z.string().min(1).max(4096),
		side: z.enum(DIFF_SIDE),
		startLine: z.number().int().positive(),
		endLine: z.number().int().positive(),
		selectedText: z.string().min(1).max(65_536),
	})
	.refine((selection) => selection.startLine <= selection.endLine, {
		message: "endLine must be greater than or equal to startLine",
		path: ["endLine"],
	});
export type AgentSelection = z.infer<typeof AgentSelectionSchema>;

export const AgentQueryRequestSchema = z.strictObject({
	sessionId: z.uuid(),
	question: z.string().trim().min(1).max(4000),
	selection: AgentSelectionSchema.nullable(),
});
export type AgentQueryRequest = z.infer<typeof AgentQueryRequestSchema>;

export const AgentSessionRequestSchema = z.strictObject({
	sessionId: z.uuid(),
});
export type AgentSessionRequest = z.infer<typeof AgentSessionRequestSchema>;

export const AGENT_PERMISSION_DECISION = {
	ALLOW: "allow",
	DENY: "deny",
} as const;
export const AgentPermissionDecisionSchema = z.enum(AGENT_PERMISSION_DECISION);
export type AgentPermissionDecision = z.infer<typeof AgentPermissionDecisionSchema>;

export const AgentPermissionRequestSchema = z.strictObject({
	sessionId: z.uuid(),
	requestId: z.union([z.string(), z.number()]),
	decision: AgentPermissionDecisionSchema,
});
export type AgentPermissionRequest = z.infer<typeof AgentPermissionRequestSchema>;

export const AGENT_TURN_OUTCOME = {
	COMPLETED: "completed",
	STOPPED: "stopped",
	FAILED: "failed",
} as const;
export const AgentTurnOutcomeSchema = z.enum(AGENT_TURN_OUTCOME);
export type AgentTurnOutcome = z.infer<typeof AgentTurnOutcomeSchema>;

const AgentTextDeltaEventSchema = z.strictObject({
	type: z.literal("text_delta"),
	text: z.string(),
});

const AgentActivityEventSchema = z.strictObject({
	type: z.literal("activity"),
	activityId: z.string().min(1),
	phase: z.enum(["started", "completed"]),
	label: z.string().min(1),
	detail: z.string().nullable(),
	exitCode: z.number().int().nullable(),
});

const AgentPermissionRequestEventSchema = z.strictObject({
	type: z.literal("permission_request"),
	requestId: z.union([z.string(), z.number()]),
	title: z.string().min(1),
	description: z.string().nullable(),
});

const AgentWriteBlockedEventSchema = z.strictObject({
	type: z.literal("write_blocked"),
	message: z.string().min(1),
});

const AgentTurnCompletedEventSchema = z.strictObject({
	type: z.literal("turn_completed"),
	outcome: AgentTurnOutcomeSchema,
});

const AgentErrorEventSchema = z.strictObject({
	type: z.literal("error"),
	code: z.string().min(1),
	message: z.string().min(1),
});

export const AgentStreamEventSchema = z.discriminatedUnion("type", [
	AgentTextDeltaEventSchema,
	AgentActivityEventSchema,
	AgentPermissionRequestEventSchema,
	AgentWriteBlockedEventSchema,
	AgentTurnCompletedEventSchema,
	AgentErrorEventSchema,
]);
export type AgentStreamEvent = z.infer<typeof AgentStreamEventSchema>;
