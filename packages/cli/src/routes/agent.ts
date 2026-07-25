import {
	AgentPermissionRequestSchema,
	AgentQueryRequestSchema,
	AgentSessionCreateRequestSchema,
	AgentSessionRequestSchema,
	type AgentStreamEvent,
} from "@stagereview/types/agent";
import { type AgentRuntime, AgentRuntimeError } from "../agent/index.js";
import type { StageDb } from "../db/client.js";
import type { Route } from "../server.js";
import { parseJsonBody, writeJson } from "./json.js";
import { enforceSameOrigin, resolveRun } from "./pull-request-shared.js";

function writeRuntimeError(res: Parameters<Route["handler"]>[1], error: unknown): void {
	if (error instanceof AgentRuntimeError) {
		writeJson(res, error.status, { error: error.message, code: error.code });
		return;
	}
	writeJson(res, 500, {
		error: error instanceof Error ? error.message : "Ask Agent request failed",
		code: "agent_error",
	});
}

function encodeSse(event: AgentStreamEvent): string {
	return `data: ${JSON.stringify(event)}\n\n`;
}

async function writeSse(
	res: Parameters<Route["handler"]>[1],
	event: AgentStreamEvent,
): Promise<void> {
	if (res.write(encodeSse(event))) return;
	await new Promise<void>((resolve) => {
		const finish = () => {
			res.removeListener("drain", finish);
			res.removeListener("close", finish);
			resolve();
		};
		res.once("drain", finish);
		res.once("close", finish);
	});
}

export function agentRoutes(db: StageDb, runtime: AgentRuntime): Route[] {
	return [
		{
			method: "GET",
			pattern: "/api/runs/:runId/agent/capabilities",
			handler: async (_req, res, params) => {
				if (!resolveRun(db, params, res)) return;
				try {
					writeJson(res, 200, { providers: await runtime.getCapabilities() });
				} catch (error) {
					writeRuntimeError(res, error);
				}
			},
		},
		{
			method: "POST",
			pattern: "/api/runs/:runId/agent/sessions",
			handler: async (req, res, params) => {
				if (!enforceSameOrigin(req, res)) return;
				const run = resolveRun(db, params, res);
				if (!run) return;
				const body = await parseJsonBody(req, res, AgentSessionCreateRequestSchema);
				if (!body) return;
				try {
					const session = await runtime.createSession(run.runId, body, run.repoRoot, run.scope);
					writeJson(res, 201, session);
				} catch (error) {
					writeRuntimeError(res, error);
				}
			},
		},
		{
			method: "POST",
			pattern: "/api/runs/:runId/agent/query",
			handler: async (req, res, params) => {
				if (!enforceSameOrigin(req, res)) return;
				const run = resolveRun(db, params, res);
				if (!run) return;
				const body = await parseJsonBody(req, res, AgentQueryRequestSchema);
				if (!body) return;

				let stream: AsyncIterable<AgentStreamEvent>;
				try {
					stream = runtime.query(run.runId, body);
				} catch (error) {
					writeRuntimeError(res, error);
					return;
				}

				res.writeHead(200, {
					"Content-Type": "text/event-stream; charset=utf-8",
					"Cache-Control": "no-cache, no-transform",
					Connection: "keep-alive",
					"X-Accel-Buffering": "no",
				});

				let completed = false;
				const onClose = () => {
					if (!completed) void runtime.abort(run.runId, body.sessionId);
				};
				res.on("close", onClose);
				try {
					for await (const event of stream) {
						if (res.destroyed) break;
						await writeSse(res, event);
					}
					completed = true;
				} catch (error) {
					if (!res.destroyed) {
						await writeSse(res, {
							type: "error",
							code: "stream_error",
							message: error instanceof Error ? error.message : "Ask Agent stream failed",
						});
						await writeSse(res, { type: "turn_completed", outcome: "failed" });
					}
				} finally {
					res.removeListener("close", onClose);
					if (!res.destroyed) res.end();
				}
			},
		},
		{
			method: "POST",
			pattern: "/api/runs/:runId/agent/abort",
			handler: async (req, res, params) => {
				if (!enforceSameOrigin(req, res)) return;
				const run = resolveRun(db, params, res);
				if (!run) return;
				const body = await parseJsonBody(req, res, AgentSessionRequestSchema);
				if (!body) return;
				try {
					await runtime.abort(run.runId, body.sessionId);
					writeJson(res, 200, {});
				} catch (error) {
					writeRuntimeError(res, error);
				}
			},
		},
		{
			method: "POST",
			pattern: "/api/runs/:runId/agent/permission",
			handler: async (req, res, params) => {
				if (!enforceSameOrigin(req, res)) return;
				const run = resolveRun(db, params, res);
				if (!run) return;
				const body = await parseJsonBody(req, res, AgentPermissionRequestSchema);
				if (!body) return;
				try {
					await runtime.respondToPermission(
						run.runId,
						body.sessionId,
						body.requestId,
						body.decision,
					);
					writeJson(res, 200, {});
				} catch (error) {
					writeRuntimeError(res, error);
				}
			},
		},
		{
			method: "DELETE",
			pattern: "/api/runs/:runId/agent/sessions/:sessionId",
			handler: async (req, res, params) => {
				if (!enforceSameOrigin(req, res)) return;
				const run = resolveRun(db, params, res);
				if (!run) return;
				const parsed = AgentSessionRequestSchema.safeParse({
					sessionId: params.sessionId,
				});
				if (!parsed.success) {
					writeJson(res, 400, { error: "Invalid Ask Agent session ID" });
					return;
				}
				try {
					await runtime.disposeSession(run.runId, parsed.data.sessionId);
					writeJson(res, 200, {});
				} catch (error) {
					writeRuntimeError(res, error);
				}
			},
		},
	];
}
