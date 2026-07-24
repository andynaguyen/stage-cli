import { randomUUID } from "node:crypto";
import type {
	AgentPermissionDecision,
	AgentProviderCapability,
	AgentProviderId,
	AgentQueryRequest,
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
		providerId: AgentProviderId,
		repoRoot: string,
		scope: Scope,
	): Promise<AgentSessionResponse> {
		if (this.disposed) {
			throw new AgentRuntimeError("Ask Agent is shutting down", 503, "runtime_disposed");
		}
		if (this.sessions.size >= MAX_ACTIVE_SESSIONS) {
			throw new AgentRuntimeError("Too many Ask Agent sessions are active", 429, "session_limit");
		}
		const provider = this.providers.get(providerId);
		if (!provider) {
			throw new AgentRuntimeError(
				`Agent provider ${providerId} is not registered`,
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

		const session = await provider.createSession({
			repoRoot,
			instructions: buildAgentInstructions(scope),
		});
		const sessionId = randomUUID();
		this.sessions.set(sessionId, { runId, session });
		return { sessionId, providerId };
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
}
