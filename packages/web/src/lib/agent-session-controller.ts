import type {
	AgentPermissionDecision,
	AgentSelection,
	AgentSessionCreateRequest,
	AgentStreamEvent,
} from "@stagereview/types/agent";
import {
	abortAgentSession,
	createAgentSession,
	deleteAgentSession,
	respondToAgentPermission,
	streamAgentQuery,
} from "./agent-api";

export interface AgentSessionQuery {
	configuration: AgentSessionCreateRequest;
	question: string;
	selection: AgentSelection | null;
	onEvent: (event: AgentStreamEvent) => void;
}

export class AgentSessionController {
	private sessionId: string | null = null;
	private sessionPromise: Promise<string> | null = null;
	private streamController: AbortController | null = null;
	private sessionGeneration = 0;
	private streaming = false;

	constructor(private readonly runId: string) {}

	get isStreaming(): boolean {
		return this.streaming;
	}

	startQuery(query: AgentSessionQuery): Promise<void> | null {
		if (this.streaming) return null;
		this.streaming = true;
		const controller = new AbortController();
		this.streamController = controller;
		return this.performQuery(query, controller);
	}

	stop(): void {
		this.cancelStream();
		const activeSessionId = this.sessionId;
		if (activeSessionId) {
			void abortAgentSession(this.runId, activeSessionId).catch(() => undefined);
		}
	}

	reset(): void {
		this.cancelStream();
		this.sessionGeneration += 1;
		const activeSessionId = this.sessionId;
		this.sessionId = null;
		this.sessionPromise = null;
		if (activeSessionId) {
			void abortAgentSession(this.runId, activeSessionId)
				.catch(() => undefined)
				.then(() => deleteAgentSession(this.runId, activeSessionId))
				.catch(() => undefined);
		}
	}

	dispose(): void {
		this.cancelStream();
		this.sessionGeneration += 1;
		const activeSessionId = this.sessionId;
		this.sessionId = null;
		this.sessionPromise = null;
		if (activeSessionId) {
			void deleteAgentSession(this.runId, activeSessionId).catch(() => undefined);
		}
	}

	async respondToPermission(
		requestId: string | number,
		decision: AgentPermissionDecision,
	): Promise<boolean> {
		if (!this.sessionId) return false;
		await respondToAgentPermission(this.runId, this.sessionId, requestId, decision);
		return true;
	}

	private async performQuery(query: AgentSessionQuery, controller: AbortController): Promise<void> {
		try {
			const sessionId = await this.ensureSession(query.configuration);
			if (controller.signal.aborted) return;
			await streamAgentQuery(
				this.runId,
				sessionId,
				query.question,
				query.selection,
				(event) => {
					if (!controller.signal.aborted) query.onEvent(event);
				},
				controller.signal,
			);
		} catch (error) {
			if (controller.signal.aborted) return;
			throw error;
		} finally {
			if (this.streamController === controller) {
				this.streamController = null;
				this.streaming = false;
			}
		}
	}

	private async ensureSession(configuration: AgentSessionCreateRequest): Promise<string> {
		if (this.sessionId) return this.sessionId;
		if (this.sessionPromise) return this.sessionPromise;

		const generation = this.sessionGeneration;
		const creation = createAgentSession(this.runId, configuration).then(async (session) => {
			if (this.sessionGeneration !== generation) {
				await deleteAgentSession(this.runId, session.sessionId).catch(() => undefined);
				throw new DOMException("Session creation was superseded", "AbortError");
			}
			this.sessionId = session.sessionId;
			return session.sessionId;
		});
		this.sessionPromise = creation;
		try {
			return await creation;
		} finally {
			if (this.sessionPromise === creation) this.sessionPromise = null;
		}
	}

	private cancelStream(): void {
		this.streamController?.abort();
		this.streamController = null;
		this.streaming = false;
	}
}
