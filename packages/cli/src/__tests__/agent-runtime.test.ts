import {
	AGENT_CAPABILITY_STATUS,
	AGENT_PROVIDER,
	type AgentPermissionDecision,
	type AgentProviderCapability,
	type AgentSessionCreateRequest,
	type AgentStreamEvent,
} from "@stagereview/types/agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	AgentProvider,
	AgentProviderSessionOptions,
	AgentRequestId,
	AgentSession,
} from "../agent/provider.js";
import { AgentRuntime } from "../agent/runtime.js";
import { SCOPE_KIND, type Scope } from "../schema.js";

const RUN_ID = "run-1";
const REPO_ROOT = "/tmp/stage-agent-runtime";
const SESSION_REQUEST: AgentSessionCreateRequest = { providerId: AGENT_PROVIDER.CODEX };
const SCOPE: Scope = {
	kind: SCOPE_KIND.COMMITTED,
	baseSha: "1".repeat(40),
	headSha: "2".repeat(40),
	mergeBaseSha: "1".repeat(40),
};

class RuntimeTestSession implements AgentSession {
	readonly providerId = AGENT_PROVIDER.CODEX;
	disposed = false;

	async *query(): AsyncIterable<AgentStreamEvent> {
		yield { type: "turn_completed", outcome: "completed" };
	}

	abort(): Promise<void> {
		return Promise.resolve();
	}

	respondToPermission(
		_requestId: AgentRequestId,
		_decision: AgentPermissionDecision,
	): Promise<void> {
		return Promise.resolve();
	}

	dispose(): Promise<void> {
		this.disposed = true;
		return Promise.resolve();
	}
}

class RuntimeTestProvider implements AgentProvider {
	readonly id = AGENT_PROVIDER.CODEX;
	readonly sessions: RuntimeTestSession[] = [];
	createSessionGate: Promise<void> = Promise.resolve();

	getCapability(): Promise<AgentProviderCapability> {
		return Promise.resolve({
			providerId: this.id,
			label: "Codex",
			status: AGENT_CAPABILITY_STATUS.AVAILABLE,
			detail: "Test provider",
			models: [],
		});
	}

	async createSession(_options: AgentProviderSessionOptions): Promise<AgentSession> {
		await this.createSessionGate;
		const session = new RuntimeTestSession();
		this.sessions.push(session);
		return session;
	}
}

function createSession(runtime: AgentRuntime) {
	return runtime.createSession(RUN_ID, SESSION_REQUEST, REPO_ROOT, SCOPE);
}

afterEach(() => {
	vi.useRealTimers();
});

describe("AgentRuntime session lifecycle", () => {
	it("disposes abandoned sessions after the idle lease expires", async () => {
		vi.useFakeTimers();
		const provider = new RuntimeTestProvider();
		const runtime = new AgentRuntime([provider], {
			maxActiveSessions: 8,
			sessionIdleTimeoutMs: 1_000,
		});

		const response = await createSession(runtime);
		await vi.advanceTimersByTimeAsync(1_000);

		expect(provider.sessions[0]?.disposed).toBe(true);
		await expect(runtime.abort(RUN_ID, response.sessionId)).rejects.toMatchObject({
			code: "session_not_found",
		});
	});

	it("evicts the least-recently-used idle session when capacity is full", async () => {
		const provider = new RuntimeTestProvider();
		const runtime = new AgentRuntime([provider], {
			maxActiveSessions: 1,
			sessionIdleTimeoutMs: 60_000,
		});

		const first = await createSession(runtime);
		const second = await createSession(runtime);

		expect(provider.sessions[0]?.disposed).toBe(true);
		await expect(runtime.abort(RUN_ID, first.sessionId)).rejects.toMatchObject({
			code: "session_not_found",
		});
		await expect(runtime.abort(RUN_ID, second.sessionId)).resolves.toBeUndefined();
		await runtime.dispose();
	});

	it("reserves capacity before asynchronous provider setup", async () => {
		let releaseCreation = () => {};
		const provider = new RuntimeTestProvider();
		provider.createSessionGate = new Promise<void>((resolve) => {
			releaseCreation = resolve;
		});
		const runtime = new AgentRuntime([provider], {
			maxActiveSessions: 1,
			sessionIdleTimeoutMs: 60_000,
		});

		const firstCreation = createSession(runtime);
		await expect(createSession(runtime)).rejects.toMatchObject({ code: "session_limit" });
		releaseCreation();
		await firstCreation;
		await runtime.dispose();
	});
});
