import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	AGENT_CAPABILITY_STATUS,
	AGENT_PERMISSION_DECISION,
	AGENT_PROVIDER,
	type AgentPermissionDecision,
	type AgentProviderCapability,
	AgentSessionResponseSchema,
	type AgentStreamEvent,
} from "@stagereview/types/agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
	AgentProvider,
	AgentProviderSessionOptions,
	AgentRequestId,
	AgentSession,
} from "../agent/provider.js";
import { AgentRuntime } from "../agent/runtime.js";
import { closeDb, getDb } from "../db/client.js";
import { agentRoutes } from "../routes/agent.js";
import { insertChaptersFile } from "../runs/import-chapters.js";
import { LOOPBACK_HOST, type ServerHandle, startServer } from "../server.js";
import { makeFixture, makeRepoContext } from "./fixtures.js";

class FakeAgentSession implements AgentSession {
	readonly providerId = AGENT_PROVIDER.CODEX;
	lastPrompt = "";
	aborted = false;
	disposed = false;

	async *query(prompt: string): AsyncIterable<AgentStreamEvent> {
		this.lastPrompt = prompt;
		yield { type: "text_delta", text: "The selected branch guards missing tokens." };
		yield { type: "turn_completed", outcome: "completed" };
	}

	async abort(): Promise<void> {
		this.aborted = true;
	}

	async respondToPermission(
		_requestId: AgentRequestId,
		_decision: AgentPermissionDecision,
	): Promise<void> {}

	async dispose(): Promise<void> {
		this.disposed = true;
	}
}

class FakeAgentProvider implements AgentProvider {
	readonly id = AGENT_PROVIDER.CODEX;
	readonly session = new FakeAgentSession();
	lastOptions: AgentProviderSessionOptions | null = null;

	async getCapability(): Promise<AgentProviderCapability> {
		return {
			providerId: this.id,
			label: "Codex",
			status: AGENT_CAPABILITY_STATUS.AVAILABLE,
			detail: "Test provider",
			models: [
				{
					id: "test-model",
					label: "Test model",
					description: "Test catalog model",
					isDefault: true,
					reasoningEfforts: [{ id: "high", label: "High", description: "More reasoning" }],
					defaultReasoningEffort: "high",
					serviceTiers: [
						{
							id: "priority",
							label: "Fast",
							description: "Lower latency",
							kind: "fast",
						},
					],
					defaultServiceTier: null,
				},
			],
		};
	}

	async createSession(options: AgentProviderSessionOptions): Promise<AgentSession> {
		this.lastOptions = options;
		return this.session;
	}
}

let tmpDir: string;
let dbPath: string;
let webDist: string;
let handle: ServerHandle | undefined;
let provider: FakeAgentProvider;
let runId: string;

beforeEach(async () => {
	tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stage-cli-agent-"));
	dbPath = path.join(tmpDir, "db.sqlite");
	webDist = path.join(tmpDir, "web-dist");
	await fs.mkdir(webDist);
	await fs.writeFile(path.join(webDist, "index.html"), "<html></html>");
	closeDb();
	const db = getDb({ dbPath });
	runId = insertChaptersFile(db, makeFixture(), makeRepoContext()).runId;
	provider = new FakeAgentProvider();
	handle = await startServer({
		webDistPath: webDist,
		routes: agentRoutes(db, new AgentRuntime([provider])),
	});
});

afterEach(async () => {
	if (handle) await handle.close();
	handle = undefined;
	closeDb();
	await fs.rm(tmpDir, { recursive: true, force: true });
});

function api(pathname: string, init?: RequestInit): Promise<Response> {
	return fetch(`http://${LOOPBACK_HOST}:${handle?.port}${pathname}`, init);
}

async function createSession(): Promise<string> {
	const response = await api(`/api/runs/${runId}/agent/sessions`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ providerId: AGENT_PROVIDER.CODEX }),
	});
	expect(response.status).toBe(201);
	return AgentSessionResponseSchema.parse(await response.json()).sessionId;
}

describe("Ask Agent routes", () => {
	it("enforces same-origin before creating a provider session", async () => {
		const response = await api(`/api/runs/${runId}/agent/sessions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: "http://evil.example",
			},
			body: JSON.stringify({ providerId: AGENT_PROVIDER.CODEX }),
		});

		expect(response.status).toBe(403);
	});

	it("streams a selected-code question through the run-bound session", async () => {
		const sessionId = await createSession();
		const response = await api(`/api/runs/${runId}/agent/query`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId,
				question: "Why is this here?",
				selection: {
					filePath: "src/auth.ts",
					side: "additions",
					startLine: 12,
					endLine: 12,
					selectedText: "if (!token) return;",
				},
			}),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/event-stream");
		expect(await response.text()).toContain("The selected branch guards missing tokens.");
		expect(provider.session.lastPrompt).toContain("file: src/auth.ts");
		expect(provider.session.lastPrompt).toContain("if (!token) return;");
	});

	it("validates and forwards provider-neutral model settings", async () => {
		const response = await api(`/api/runs/${runId}/agent/sessions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				providerId: AGENT_PROVIDER.CODEX,
				model: "test-model",
				reasoningEffort: "high",
				serviceTier: "priority",
			}),
		});

		expect(response.status).toBe(201);
		expect(provider.lastOptions).toMatchObject({
			model: "test-model",
			reasoningEffort: "high",
			serviceTier: "priority",
		});
	});

	it("rejects model settings outside the discovered catalog", async () => {
		const response = await api(`/api/runs/${runId}/agent/sessions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				providerId: AGENT_PROVIDER.CODEX,
				model: "test-model",
				reasoningEffort: "unsupported",
			}),
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ code: "invalid_reasoning_effort" });
	});

	it("disposes the provider session through its run-scoped endpoint", async () => {
		const sessionId = await createSession();
		const response = await api(`/api/runs/${runId}/agent/sessions/${sessionId}`, {
			method: "DELETE",
		});

		expect(response.status).toBe(200);
		expect(provider.session.disposed).toBe(true);
	});

	it("accepts explicit permission decisions", async () => {
		const sessionId = await createSession();
		const response = await api(`/api/runs/${runId}/agent/permission`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId,
				requestId: 8,
				decision: AGENT_PERMISSION_DECISION.DENY,
			}),
		});

		expect(response.status).toBe(200);
	});
});
