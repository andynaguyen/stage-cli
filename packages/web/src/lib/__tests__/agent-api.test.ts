import type { AgentStreamEvent } from "@stagereview/types/agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSseChunk, streamAgentQuery } from "../agent-api";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("parseSseChunk", () => {
	it("extracts complete events and preserves a partial trailing frame", () => {
		const first = parseSseChunk(
			'data: {"type":"text_delta","text":"one"}\r\n\r\ndata: {"type":"text_',
		);
		expect(first.payloads).toEqual(['{"type":"text_delta","text":"one"}']);
		expect(first.remainder).toBe('data: {"type":"text_');

		const second = parseSseChunk(
			`${first.remainder}delta","text":"two"}\n\ndata: first\ndata: second\n\n`,
		);
		expect(second.payloads).toEqual(['{"type":"text_delta","text":"two"}', "first\nsecond"]);
		expect(second.remainder).toBe("");
	});
});

describe("streamAgentQuery", () => {
	it("decodes fragmented Unicode and emits validated events in order", async () => {
		const wire =
			'data: {"type":"text_delta","text":"café 🚀"}\n\n' +
			'data: {"type":"turn_completed","outcome":"completed"}\n\n';
		const encoder = new TextEncoder();
		const bytes = encoder.encode(wire);
		const emojiStart = encoder.encode('data: {"type":"text_delta","text":"café ').length;
		const chunks = [
			bytes.slice(0, emojiStart + 1),
			bytes.slice(emojiStart + 1, emojiStart + 3),
			bytes.slice(emojiStart + 3),
		];
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				for (const chunk of chunks) controller.enqueue(chunk);
				controller.close();
			},
		});
		const fetchMock = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(body, { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchMock);
		const events: AgentStreamEvent[] = [];

		await streamAgentQuery(
			"run with spaces",
			"123e4567-e89b-12d3-a456-426614174000",
			"Explain this",
			null,
			(event) => events.push(event),
			new AbortController().signal,
		);

		expect(events).toEqual([
			{ type: "text_delta", text: "café 🚀" },
			{ type: "turn_completed", outcome: "completed" },
		]);
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe("/api/runs/run%20with%20spaces/agent/query");
		expect(init?.method).toBe("POST");
		expect(JSON.parse(String(init?.body))).toEqual({
			sessionId: "123e4567-e89b-12d3-a456-426614174000",
			question: "Explain this",
			selection: null,
		});
	});

	it("rejects a stream that closes without a terminal event", async () => {
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(
					new TextEncoder().encode('data: {"type":"text_delta","text":"partial"}\n\n'),
				);
				controller.close();
			},
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(body, { status: 200 })),
		);
		const events: AgentStreamEvent[] = [];

		await expect(
			streamAgentQuery(
				"run-1",
				"123e4567-e89b-12d3-a456-426614174000",
				"Explain this",
				null,
				(event) => events.push(event),
				new AbortController().signal,
			),
		).rejects.toThrow("ended before completing");
		expect(events).toEqual([{ type: "text_delta", text: "partial" }]);
	});
});
