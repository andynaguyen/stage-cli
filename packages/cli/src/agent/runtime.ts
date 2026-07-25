import { randomUUID } from "node:crypto";
import type {
	AgentPermissionDecision,
	AgentProviderCapability,
	AgentProviderId,
	AgentQueryRequest,
	AgentSessionCreateRequest,
	AgentSessionResponse,
	AgentStreamEvent,
} from "@stagereview/types/agent";
import type { Scope } from "../schema.js";
import { buildAgentInstructions, buildAgentQuestion } from "./prompt.js";
import type { AgentProvider, AgentRequestId, AgentSession } from "./provider.js";

const MAX_ACTIVE_SESSIONS = 8;

export class AgentRuntimeError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly code: string,
	) {
		super(message);
		this.name = "AgentRuntimeError";
	}
}

interface ManagedSession {
	runId: string;
	session: AgentSession;
}

export class AgentRuntime {
	private readonly providers = new Map<AgentProviderId, AgentProvider>();
	private readonly sessions = new Map<string, ManagedSession>();
	private disposed = false;

	constructor(providers: AgentProvider[]) {
		for (const provider of providers) {
			this.providers.set(provider.id, provider);
		}
	}

	async getCapabilities(): Promise<AgentProviderCapability[]> {
		return Promise.all(Array.from(this.providers.values(), (provider) => provider.getCapability()));
	}

	async createSession(
		runId: string,
		request: AgentSessionCreateRequest,
		repoRoot: string,
		scope: Scope,
	): Promise<AgentSessionResponse> {
		if (this.disposed) {
			throw new AgentRuntimeError("Ask Agent is shutting down", 503, "runtime_disposed");
		}
		if (this.sessions.size >= MAX_ACTIVE_SESSIONS) {
			throw new AgentRuntimeError("Too many Ask Agent sessions are active", 429, "session_limit");
		}
		const provider = this.providers.get(request.providerId);
		if (!provider) {
			throw new AgentRuntimeError(
				`Agent provider ${request.providerId} is not registered`,
				400,
				"provider_unavailable",
			);
		}
		const capability = await provider.getCapability();
		if (capability.status !== "available") {
			throw new AgentRuntimeError(
				capability.detail ?? `${capability.label} is unavailable`,
				503,
				`provider_${capability.status}`,
			);
		}
		this.validateConfiguration(capability, request);

		const session = await provider.createSession({
			repoRoot,
			instructions: buildAgentInstructions(scope),
			...(request.model ? { model: request.model } : {}),
			...(request.reasoningEffort ? { reasoningEffort: request.reasoningEffort } : {}),
			...(request.serviceTier ? { serviceTier: request.serviceTier } : {}),
		});
		const sessionId = randomUUID();
		this.sessions.set(sessionId, { runId, session });
		return { sessionId, providerId: request.providerId };
	}

	query(runId: string, request: AgentQueryRequest): AsyncIterable<AgentStreamEvent> {
		const managed = this.getSession(runId, request.sessionId);
		return managed.session.query(buildAgentQuestion(request));
	}

	async abort(runId: string, sessionId: string): Promise<void> {
		await this.getSession(runId, sessionId).session.abort();
	}

	async respondToPermission(
		runId: string,
		sessionId: string,
		requestId: AgentRequestId,
		decision: AgentPermissionDecision,
	): Promise<void> {
		await this.getSession(runId, sessionId).session.respondToPermission(requestId, decision);
	}

	async disposeSession(runId: string, sessionId: string): Promise<void> {
		const managed = this.getSession(runId, sessionId);
		this.sessions.delete(sessionId);
		await managed.session.dispose();
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		const sessions = Array.from(this.sessions.values());
		this.sessions.clear();
		await Promise.allSettled(sessions.map((managed) => managed.session.dispose()));
	}

	private getSession(runId: string, sessionId: string): ManagedSession {
		const managed = this.sessions.get(sessionId);
		if (!managed || managed.runId !== runId) {
			throw new AgentRuntimeError("Ask Agent session not found", 404, "session_not_found");
		}
		return managed;
	}

	private validateConfiguration(
		capability: AgentProviderCapability,
		request: AgentSessionCreateRequest,
	): void {
		if (!request.model) return;
		const model = capability.models.find((candidate) => candidate.id === request.model);
		if (!model) {
			throw new AgentRuntimeError("The selected agent model is unavailable", 400, "invalid_model");
		}
		if (
			request.reasoningEffort &&
			!model.reasoningEfforts.some((effort) => effort.id === request.reasoningEffort)
		) {
			throw new AgentRuntimeError(
				"The selected reasoning effort is unavailable for this model",
				400,
				"invalid_reasoning_effort",
			);
		}
		if (
			request.serviceTier &&
			!model.serviceTiers.some((tier) => tier.id === request.serviceTier)
		) {
			throw new AgentRuntimeError(
				"The selected service tier is unavailable for this model",
				400,
				"invalid_service_tier",
			);
		}
	}
}
