import {
	AgentCapabilitiesResponseSchema,
	type AgentPermissionDecision,
	type AgentProviderId,
	type AgentQueryRequest,
	type AgentSelection,
	AgentSessionResponseSchema,
	type AgentStreamEvent,
	AgentStreamEventSchema,
} from "@stagereview/types/agent";
import { z } from "zod";

const AgentApiErrorSchema = z.object({
	error: z.string(),
});

export class AgentApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "AgentApiError";
	}
}

async function parseError(response: Response): Promise<AgentApiError> {
	const raw: unknown = await response.json().catch(() => null);
	const parsed = AgentApiErrorSchema.safeParse(raw);
	return new AgentApiError(
		parsed.success ? parsed.data.error : `Ask Agent request failed (${response.status})`,
		response.status,
	);
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
	const response = await fetch(url, init);
	if (!response.ok) throw await parseError(response);
	return response.json();
}

function runAgentUrl(runId: string, suffix: string): string {
	return `/api/runs/${encodeURIComponent(runId)}/agent/${suffix}`;
}

export async function getAgentCapabilities(runId: string) {
	const raw = await fetchJson(runAgentUrl(runId, "capabilities"));
	return AgentCapabilitiesResponseSchema.parse(raw);
}

export async function createAgentSession(runId: string, providerId: AgentProviderId) {
	const raw = await fetchJson(runAgentUrl(runId, "sessions"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ providerId }),
	});
	return AgentSessionResponseSchema.parse(raw);
}

export async function abortAgentSession(runId: string, sessionId: string): Promise<void> {
	await fetchJson(runAgentUrl(runId, "abort"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ sessionId }),
	});
}

export async function respondToAgentPermission(
	runId: string,
	sessionId: string,
	requestId: string | number,
	decision: AgentPermissionDecision,
): Promise<void> {
	await fetchJson(runAgentUrl(runId, "permission"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ sessionId, requestId, decision }),
	});
}

export async function deleteAgentSession(runId: string, sessionId: string): Promise<void> {
	await fetchJson(`${runAgentUrl(runId, "sessions")}/${encodeURIComponent(sessionId)}`, {
		method: "DELETE",
	});
}

export interface ParsedSseChunk {
	payloads: string[];
	remainder: string;
}

/**
 * Extracts complete SSE frames while preserving a trailing partial frame.
 * The server emits one JSON payload per `data:` frame, but accepting multiple
 * data lines keeps the client compliant with the SSE framing contract.
 */
export function parseSseChunk(buffer: string): ParsedSseChunk {
	const normalized = buffer.replaceAll("\r\n", "\n");
	const frames = normalized.split("\n\n");
	const remainder = frames.pop() ?? "";
	const payloads: string[] = [];

	for (const frame of frames) {
		const data = frame
			.split("\n")
			.filter((line) => line.startsWith("data:"))
			.map((line) => line.slice(5).trimStart())
			.join("\n");
		if (data.length > 0) payloads.push(data);
	}

	return { payloads, remainder };
}

export async function streamAgentQuery(
	runId: string,
	sessionId: string,
	question: string,
	selection: AgentSelection | null,
	onEvent: (event: AgentStreamEvent) => void,
	signal: AbortSignal,
): Promise<void> {
	const request: AgentQueryRequest = { sessionId, question, selection };
	const response = await fetch(runAgentUrl(runId, "query"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(request),
		signal,
	});
	if (!response.ok) throw await parseError(response);
	if (!response.body) throw new AgentApiError("Ask Agent returned an empty stream", 502);

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const result = await reader.read();
		buffer += decoder.decode(result.value, { stream: !result.done });
		const parsed = parseSseChunk(buffer);
		buffer = parsed.remainder;
		for (const payload of parsed.payloads) {
			const raw: unknown = JSON.parse(payload);
			onEvent(AgentStreamEventSchema.parse(raw));
		}
		if (result.done) break;
	}

	if (buffer.trim().length > 0) {
		const parsed = parseSseChunk(`${buffer}\n\n`);
		for (const payload of parsed.payloads) {
			const raw: unknown = JSON.parse(payload);
			onEvent(AgentStreamEventSchema.parse(raw));
		}
	}
}
