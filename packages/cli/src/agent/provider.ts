import type {
	AgentPermissionDecision,
	AgentProviderCapability,
	AgentProviderId,
	AgentStreamEvent,
} from "@stagereview/types/agent";

export type AgentRequestId = string | number;

export interface AgentProviderSessionOptions {
	repoRoot: string;
	instructions: string;
	model?: string;
	reasoningEffort?: string;
	serviceTier?: string;
}

export interface AgentSession {
	readonly providerId: AgentProviderId;
	query(prompt: string): AsyncIterable<AgentStreamEvent>;
	abort(): Promise<void>;
	respondToPermission(requestId: AgentRequestId, decision: AgentPermissionDecision): Promise<void>;
	dispose(): Promise<void>;
}

export interface AgentProvider {
	readonly id: AgentProviderId;
	getCapability(): Promise<AgentProviderCapability>;
	createSession(options: AgentProviderSessionOptions): Promise<AgentSession>;
}
