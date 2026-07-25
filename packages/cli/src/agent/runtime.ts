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

const DEFAULT_MAX_ACTIVE_SESSIONS = 8;
const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

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
	activeQueries: number;
	idleTimer: NodeJS.Timeout | null;
	lastUsedAt: number;
}

export interface AgentRuntimeOptions {
	maxActiveSessions: number;
	sessionIdleTimeoutMs: number;
}

const DEFAULT_RUNTIME_OPTIONS: AgentRuntimeOptions = {
	maxActiveSessions: DEFAULT_MAX_ACTIVE_SESSIONS,
	sessionIdleTimeoutMs: DEFAULT_SESSION_IDLE_TIMEOUT_MS,
};

export class AgentRuntime {
	private readonly providers = new Map<AgentProviderId, AgentProvider>();
	private readonly sessions = new Map<string, ManagedSession>();
	private pendingSessionCreations = 0;
	private disposed = false;

	constructor(
		providers: AgentProvider[],
		private readonly options: AgentRuntimeOptions = DEFAULT_RUNTIME_OPTIONS,
	) {
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
		const evictedSession = this.reserveSessionSlot();
		try {
			if (evictedSession) await evictedSession.dispose();
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
			if (this.disposed) {
				await session.dispose();
				throw new AgentRuntimeError("Ask Agent is shutting down", 503, "runtime_disposed");
			}
			const sessionId = randomUUID();
			const managed: ManagedSession = {
				runId,
				session,
				activeQueries: 0,
				idleTimer: null,
				lastUsedAt: Date.now(),
			};
			this.sessions.set(sessionId, managed);
			this.scheduleIdleDisposal(sessionId, managed);
			return { sessionId, providerId: request.providerId };
		} finally {
			this.pendingSessionCreations -= 1;
		}
	}

	query(runId: string, request: AgentQueryRequest): AsyncIterable<AgentStreamEvent> {
		const managed = this.getSession(runId, request.sessionId);
		return this.runQuery(request.sessionId, managed, buildAgentQuestion(request));
	}

	async abort(runId: string, sessionId: string): Promise<void> {
		const managed = this.getSession(runId, sessionId);
		await managed.session.abort();
		this.touchSession(sessionId, managed);
	}

	async respondToPermission(
		runId: string,
		sessionId: string,
		requestId: AgentRequestId,
		decision: AgentPermissionDecision,
	): Promise<void> {
		const managed = this.getSession(runId, sessionId);
		await managed.session.respondToPermission(requestId, decision);
		this.touchSession(sessionId, managed);
	}

	async disposeSession(runId: string, sessionId: string): Promise<void> {
		const managed = this.getSession(runId, sessionId);
		this.sessions.delete(sessionId);
		this.clearIdleTimer(managed);
		await managed.session.dispose();
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		const sessions = Array.from(this.sessions.values());
		this.sessions.clear();
		for (const managed of sessions) this.clearIdleTimer(managed);
		await Promise.allSettled(sessions.map((managed) => managed.session.dispose()));
	}

	private reserveSessionSlot(): AgentSession | null {
		const occupiedSlots = this.sessions.size + this.pendingSessionCreations;
		let evictedSession: AgentSession | null = null;
		if (occupiedSlots >= this.options.maxActiveSessions) {
			const idleSessions = Array.from(this.sessions.entries())
				.filter(([, managed]) => managed.activeQueries === 0)
				.sort((left, right) => left[1].lastUsedAt - right[1].lastUsedAt);
			const oldest = idleSessions[0];
			if (!oldest) {
				throw new AgentRuntimeError("Too many Ask Agent sessions are active", 429, "session_limit");
			}
			const [sessionId, managed] = oldest;
			this.sessions.delete(sessionId);
			this.clearIdleTimer(managed);
			evictedSession = managed.session;
		}
		this.pendingSessionCreations += 1;
		return evictedSession;
	}

	private async *runQuery(
		sessionId: string,
		managed: ManagedSession,
		prompt: string,
	): AsyncIterable<AgentStreamEvent> {
		managed.activeQueries += 1;
		this.clearIdleTimer(managed);
		try {
			for await (const event of managed.session.query(prompt)) yield event;
		} finally {
			managed.activeQueries -= 1;
			this.touchSession(sessionId, managed);
		}
	}

	private touchSession(sessionId: string, managed: ManagedSession): void {
		if (this.sessions.get(sessionId) !== managed) return;
		managed.lastUsedAt = Date.now();
		if (managed.activeQueries === 0) this.scheduleIdleDisposal(sessionId, managed);
	}

	private scheduleIdleDisposal(sessionId: string, managed: ManagedSession): void {
		this.clearIdleTimer(managed);
		managed.idleTimer = setTimeout(() => {
			if (this.sessions.get(sessionId) !== managed || managed.activeQueries > 0) return;
			this.sessions.delete(sessionId);
			managed.idleTimer = null;
			void managed.session.dispose().catch(() => undefined);
		}, this.options.sessionIdleTimeoutMs);
		managed.idleTimer.unref();
	}

	private clearIdleTimer(managed: ManagedSession): void {
		if (!managed.idleTimer) return;
		clearTimeout(managed.idleTimer);
		managed.idleTimer = null;
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
