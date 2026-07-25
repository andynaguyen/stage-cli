import {
	AGENT_PERMISSION_DECISION,
	AGENT_PROVIDER,
	AGENT_TURN_OUTCOME,
	type AgentPermissionDecision,
	type AgentStreamEvent,
} from "@stagereview/types/agent";
import { AsyncEventQueue } from "../async-event-queue.js";
import type { AgentProviderSessionOptions, AgentRequestId, AgentSession } from "../provider.js";
import { CodexAppServerClient } from "./app-server-client.js";
import type { CodexProcessFactory } from "./process.js";
import {
	AgentMessageDeltaNotificationSchema,
	type CodexNotification,
	type CodexRequestId,
	type CodexServerRequest,
	CommandApprovalRequestSchema,
	ErrorNotificationSchema,
	FileChangeApprovalRequestSchema,
	ItemNotificationSchema,
	PermissionsApprovalRequestSchema,
	ThreadStartResponseSchema,
	TurnCompletedNotificationSchema,
	TurnStartResponseSchema,
} from "./protocol.js";

const MAX_ACTIVITY_LABEL_LENGTH = 240;
const MAX_ERROR_OUTPUT_LENGTH = 2000;

interface ActiveTurn {
	queue: AsyncEventQueue<AgentStreamEvent>;
	turnId: string | null;
	startPromise: Promise<void> | null;
	aborted: boolean;
	interruptSent: boolean;
	agentMessagePhases: Map<string, "commentary" | "final_answer" | null>;
}

function truncate(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength - 1)}…`;
}

function commandLabel(command: string): string {
	return truncate(`$ ${command}`, MAX_ACTIVITY_LABEL_LENGTH);
}

export class CodexAgentSession implements AgentSession {
	readonly providerId = AGENT_PROVIDER.CODEX;
	private readonly client: CodexAppServerClient;
	private readonly threadId: string;
	private readonly model: string | undefined;
	private readonly reasoningEffort: string | undefined;
	private readonly serviceTier: string | undefined;
	private readonly removeNotificationListener: () => void;
	private readonly removeServerRequestListener: () => void;
	private readonly removeFatalListener: () => void;
	private readonly pendingApprovals = new Map<CodexRequestId, true>();
	private readonly retiredTurnIds = new Set<string>();
	private active: ActiveTurn | null = null;
	private disposed = false;

	private constructor(
		client: CodexAppServerClient,
		threadId: string,
		options: AgentProviderSessionOptions,
	) {
		this.client = client;
		this.threadId = threadId;
		this.model = options.model;
		this.reasoningEffort = options.reasoningEffort;
		this.serviceTier = options.serviceTier;
		this.removeNotificationListener = client.onNotification((notification) =>
			this.handleNotification(notification),
		);
		this.removeServerRequestListener = client.onServerRequest((request) =>
			this.handleServerRequest(request),
		);
		this.removeFatalListener = client.onFatal((error) => this.handleFatal(error));
	}

	static async create(
		options: AgentProviderSessionOptions,
		processFactory?: CodexProcessFactory,
	): Promise<CodexAgentSession> {
		const client = await CodexAppServerClient.start(processFactory);
		try {
			const raw = await client.request("thread/start", {
				cwd: options.repoRoot,
				developerInstructions: options.instructions,
				ephemeral: true,
				serviceName: "stage",
				threadSource: "stage",
			});
			const response = ThreadStartResponseSchema.parse(raw);
			return new CodexAgentSession(client, response.thread.id, options);
		} catch (error) {
			client.dispose();
			throw error;
		}
	}

	async *query(prompt: string): AsyncIterable<AgentStreamEvent> {
		if (this.disposed) throw new Error("Codex session is closed");
		if (this.active) throw new Error("An Ask Agent turn is already running");

		const state: ActiveTurn = {
			queue: new AsyncEventQueue<AgentStreamEvent>(),
			turnId: null,
			startPromise: null,
			aborted: false,
			interruptSent: false,
			agentMessagePhases: new Map(),
		};
		this.active = state;
		state.startPromise = this.startTurn(state, prompt);

		for await (const event of state.queue) {
			yield event;
		}
	}

	async abort(): Promise<void> {
		const state = this.active;
		if (!state) return;
		this.stopTurn(state, {
			type: "turn_completed",
			outcome: AGENT_TURN_OUTCOME.STOPPED,
		});

		if (state.startPromise) {
			try {
				await state.startPromise;
			} catch {
				// The start failure has already closed the stream.
			}
		}
		await this.interrupt(state);
	}

	async respondToPermission(
		requestId: AgentRequestId,
		decision: AgentPermissionDecision,
	): Promise<void> {
		if (!this.pendingApprovals.has(requestId)) {
			throw new Error("Codex approval request is no longer pending");
		}
		this.pendingApprovals.delete(requestId);
		this.client.respond(requestId, {
			decision: decision === AGENT_PERMISSION_DECISION.ALLOW ? "accept" : "decline",
		});
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		const state = this.active;
		if (state) {
			this.stopTurn(state, {
				type: "turn_completed",
				outcome: AGENT_TURN_OUTCOME.STOPPED,
			});
		}
		this.removeNotificationListener();
		this.removeServerRequestListener();
		this.removeFatalListener();
		this.client.dispose();
	}

	private async startTurn(state: ActiveTurn, prompt: string): Promise<void> {
		try {
			const raw = await this.client.request("turn/start", {
				threadId: this.threadId,
				input: [{ type: "text", text: prompt, text_elements: [] }],
				...(this.model ? { model: this.model } : {}),
				...(this.reasoningEffort ? { effort: this.reasoningEffort } : {}),
				...(this.serviceTier ? { serviceTier: this.serviceTier } : {}),
				sandboxPolicy: {
					type: "readOnly",
					networkAccess: false,
				},
			});
			const response = TurnStartResponseSchema.parse(raw);
			state.turnId = response.turn.id;

			if (state.aborted) {
				this.retiredTurnIds.add(response.turn.id);
				return;
			}
		} catch (error) {
			if (state.aborted || this.active !== state) return;
			this.finishWithError(
				state,
				"provider_error",
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	private handleNotification(notification: CodexNotification): void {
		const state = this.active;
		if (!state || state.aborted) return;

		if (notification.method === "item/agentMessage/delta") {
			const parsed = AgentMessageDeltaNotificationSchema.safeParse(notification.params);
			if (
				parsed.success &&
				this.acceptsTurnMessage(parsed.data.threadId, parsed.data.turnId) &&
				state.agentMessagePhases.get(parsed.data.itemId) !== "commentary"
			) {
				state.queue.push({ type: "text_delta", text: parsed.data.delta });
			}
			return;
		}

		if (notification.method === "item/started" || notification.method === "item/completed") {
			const parsed = ItemNotificationSchema.safeParse(notification.params);
			if (!parsed.success || !this.acceptsTurnMessage(parsed.data.threadId, parsed.data.turnId)) {
				return;
			}
			const { item } = parsed.data;
			if (item.type === "agentMessage") {
				if (notification.method === "item/started") {
					state.agentMessagePhases.set(item.id, item.phase);
				}
				return;
			}
			if (item.type === "fileChange") {
				state.queue.push({
					type: "write_blocked",
					message: "Stage blocked a file change because Ask Agent is read-only.",
				});
				return;
			}

			const completed = notification.method === "item/completed";
			const failed = item.status === "failed" || (item.exitCode !== null && item.exitCode !== 0);
			state.queue.push({
				type: "activity",
				activityId: item.id,
				phase: completed ? "completed" : "started",
				label: commandLabel(item.command),
				detail:
					completed && failed && item.aggregatedOutput
						? truncate(item.aggregatedOutput.trim(), MAX_ERROR_OUTPUT_LENGTH)
						: null,
				exitCode: completed ? (item.exitCode ?? null) : null,
			});
			return;
		}

		if (notification.method === "error") {
			const parsed = ErrorNotificationSchema.safeParse(notification.params);
			if (
				parsed.success &&
				!parsed.data.willRetry &&
				this.acceptsTurnMessage(parsed.data.threadId, parsed.data.turnId)
			) {
				this.finishWithError(
					state,
					"provider_error",
					parsed.data.error.message,
					parsed.data.turnId,
				);
			}
			return;
		}

		if (notification.method === "turn/completed") {
			const parsed = TurnCompletedNotificationSchema.safeParse(notification.params);
			if (!parsed.success || !this.acceptsTurnMessage(parsed.data.threadId, parsed.data.turn.id)) {
				return;
			}
			if (parsed.data.turn.status === "failed") {
				this.finishWithError(
					state,
					"turn_failed",
					parsed.data.turn.error?.message ?? "Codex could not complete the turn",
					parsed.data.turn.id,
				);
				return;
			}
			const outcome =
				parsed.data.turn.status === "interrupted"
					? AGENT_TURN_OUTCOME.STOPPED
					: AGENT_TURN_OUTCOME.COMPLETED;
			this.finish(state, { type: "turn_completed", outcome }, parsed.data.turn.id);
		}
	}

	private handleServerRequest(request: CodexServerRequest): void {
		const state = this.active;
		if (!state || state.aborted) {
			this.rejectServerRequest(request);
			return;
		}

		if (request.method === "item/commandExecution/requestApproval") {
			const parsed = CommandApprovalRequestSchema.safeParse(request.params);
			if (!parsed.success) {
				this.client.respondError(request.id, -32602, "Invalid command approval request");
				return;
			}
			if (!this.acceptsTurnMessage(parsed.data.threadId, parsed.data.turnId)) {
				this.client.respond(request.id, { decision: "decline" });
				return;
			}
			this.pendingApprovals.set(request.id, true);
			const command = parsed.data.command ?? "Run a repository command";
			state.queue.push({
				type: "permission_request",
				requestId: request.id,
				title: commandLabel(command),
				description: parsed.data.reason ?? "Allow this command inside the read-only sandbox?",
			});
			return;
		}

		if (request.method === "item/fileChange/requestApproval") {
			const parsed = FileChangeApprovalRequestSchema.safeParse(request.params);
			this.client.respond(request.id, { decision: "decline" });
			if (parsed.success && this.acceptsTurnMessage(parsed.data.threadId, parsed.data.turnId)) {
				state.queue.push({
					type: "write_blocked",
					message: "Stage declined a requested file change because Ask Agent is read-only.",
				});
			}
			return;
		}

		if (request.method === "item/permissions/requestApproval") {
			const parsed = PermissionsApprovalRequestSchema.safeParse(request.params);
			this.client.respond(request.id, { permissions: {}, scope: "turn" });
			if (parsed.success && this.acceptsTurnMessage(parsed.data.threadId, parsed.data.turnId)) {
				state.queue.push({
					type: "write_blocked",
					message: "Stage declined broader filesystem or network access.",
				});
			}
			return;
		}

		this.client.respondError(request.id, -32601, "Method not supported by Stage Ask Agent");
	}

	private rejectServerRequest(request: CodexServerRequest): void {
		if (
			request.method === "item/commandExecution/requestApproval" ||
			request.method === "item/fileChange/requestApproval"
		) {
			this.client.respond(request.id, { decision: "decline" });
			return;
		}
		if (request.method === "item/permissions/requestApproval") {
			this.client.respond(request.id, { permissions: {}, scope: "turn" });
			return;
		}
		this.client.respondError(request.id, -32601, "Method not supported by Stage Ask Agent");
	}

	private acceptsTurnMessage(threadId: string, turnId: string): boolean {
		return threadId === this.threadId && !this.retiredTurnIds.has(turnId);
	}

	private declinePendingApprovals(): void {
		for (const requestId of this.pendingApprovals.keys()) {
			this.client.respond(requestId, { decision: "decline" });
		}
		this.pendingApprovals.clear();
	}

	private async interrupt(state: ActiveTurn): Promise<void> {
		if (state.interruptSent || state.turnId === null || this.disposed) return;
		state.interruptSent = true;
		try {
			await this.client.request("turn/interrupt", {
				threadId: this.threadId,
				turnId: state.turnId,
			});
		} catch {
			// The local stream is already stopped; process disposal remains the fallback.
		}
	}

	private finish(state: ActiveTurn, terminalEvent: AgentStreamEvent, turnId?: string): void {
		if (this.active !== state) return;
		if (turnId) this.retiredTurnIds.add(turnId);
		this.stopTurn(state, terminalEvent);
	}

	private stopTurn(state: ActiveTurn, terminalEvent: AgentStreamEvent): void {
		if (this.active !== state) return;
		state.aborted = true;
		if (state.turnId) this.retiredTurnIds.add(state.turnId);
		this.declinePendingApprovals();
		state.queue.push(terminalEvent);
		state.queue.close();
		this.active = null;
	}

	private finishWithError(state: ActiveTurn, code: string, message: string, turnId?: string): void {
		state.queue.push({ type: "error", code, message });
		this.finish(
			state,
			{
				type: "turn_completed",
				outcome: AGENT_TURN_OUTCOME.FAILED,
			},
			turnId,
		);
	}

	private handleFatal(error: Error): void {
		const state = this.active;
		if (!state || state.aborted) return;
		this.finishWithError(state, "provider_exited", error.message);
	}
}
