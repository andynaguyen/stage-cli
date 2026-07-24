import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CodexAppServerClient } from "../agent/codex/app-server-client.js";
import type { CodexAppServerProcess, CodexProcessFactory } from "../agent/codex/process.js";

const OutgoingMessageSchema = z.object({
	method: z.string().optional(),
	id: z.number().optional(),
	params: z.unknown().optional(),
});

class FakeCodexProcess implements CodexAppServerProcess {
	readonly stdout = new PassThrough();
	readonly writes: string[] = [];
	terminated = false;
	private terminationListener: ((error: Error) => void) | null = null;

	writeLine(line: string): void {
		this.writes.push(line);
	}

	closeInput(): void {}

	terminate(): void {
		this.terminated = true;
	}

	onTermination(listener: (error: Error) => void): () => void {
		this.terminationListener = listener;
		return () => {
			this.terminationListener = null;
		};
	}

	emit(value: unknown): void {
		this.stdout.write(`${JSON.stringify(value)}\n`);
	}

	exit(): void {
		this.terminationListener?.(new Error("Codex app-server exited with exit code 1"));
	}
}

class FakeCodexProcessFactory implements CodexProcessFactory {
	readonly process = new FakeCodexProcess();

	start(): CodexAppServerProcess {
		return this.process;
	}
}

async function startClient(): Promise<{
	client: CodexAppServerClient;
	process: FakeCodexProcess;
}> {
	const factory = new FakeCodexProcessFactory();
	const starting = CodexAppServerClient.start(factory);
	await vi.waitFor(() => expect(factory.process.writes).toHaveLength(1));
	const initialize = OutgoingMessageSchema.parse(JSON.parse(factory.process.writes[0] ?? ""));
	factory.process.emit({ id: initialize.id, result: { userAgent: "test" } });
	const client = await starting;
	return { client, process: factory.process };
}

describe("Codex app-server client", () => {
	it("waits for initialize before sending initialized", async () => {
		const { client, process } = await startClient();
		const messages = process.writes.map((line) => OutgoingMessageSchema.parse(JSON.parse(line)));

		expect(messages[0]?.method).toBe("initialize");
		expect(messages[1]?.method).toBe("initialized");
		client.dispose();
	});

	it("correlates JSONL responses with pending requests", async () => {
		const { client, process } = await startClient();
		const request = client.request("thread/start", { ephemeral: true });
		await vi.waitFor(() => expect(process.writes).toHaveLength(3));
		const outgoing = OutgoingMessageSchema.parse(JSON.parse(process.writes[2] ?? ""));
		process.emit({ id: outgoing.id, result: { thread: { id: "thread-1" } } });

		await expect(request).resolves.toEqual({ thread: { id: "thread-1" } });
		client.dispose();
	});

	it("parses fragmented lines and split Unicode", async () => {
		const { client, process } = await startClient();
		const listener = vi.fn();
		client.onNotification(listener);
		const encoded = Buffer.from(
			`${JSON.stringify({ method: "item/agentMessage/delta", params: { delta: "✓" } })}\n`,
		);
		const split = encoded.indexOf(Buffer.from("✓")) + 1;
		process.stdout.write(encoded.subarray(0, split));
		process.stdout.write(encoded.subarray(split));

		await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());
		expect(listener.mock.calls[0]?.[0]).toMatchObject({
			method: "item/agentMessage/delta",
			params: { delta: "✓" },
		});
		client.dispose();
	});

	it("rejects pending work when the process exits", async () => {
		const { client, process } = await startClient();
		const request = client.request("thread/start", {});
		process.exit();

		await expect(request).rejects.toThrow("exited");
	});
});
