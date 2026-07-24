import { PassThrough } from "node:stream";
import type { AgentStreamEvent } from "@stagereview/types/agent";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { CodexAppServerProcess, CodexProcessFactory } from "../agent/codex/process.js";
import { CodexAgentSession } from "../agent/codex/session.js";

const OutgoingMessageSchema = z.object({
	method: z.string().optional(),
	id: z.number().optional(),
});

class FakeCodexProcess implements CodexAppServerProcess {
	readonly stdout = new PassThrough();
	readonly writes: string[] = [];
	terminated = false;

	writeLine(line: string): void {
		this.writes.push(line);
	}

	closeInput(): void {}

	terminate(): void {
		this.terminated = true;
	}

	onTermination(): () => void {
		return () => {};
	}

	emit(value: unknown): void {
		this.stdout.write(`${JSON.stringify(value)}\n`);
	}

	message(index: number) {
		return OutgoingMessageSchema.parse(JSON.parse(this.writes[index] ?? ""));
	}
}

class FakeCodexProcessFactory implements CodexProcessFactory {
	readonly process = new FakeCodexProcess();

	start(): CodexAppServerProcess {
		return this.process;
	}
}

async function createSession() {
	const factory = new FakeCodexProcessFactory();
	const creating = CodexAgentSession.create(
		{ repoRoot: "/repo", instructions: "Read only." },
		factory,
	);
	await vi.waitFor(() => expect(factory.process.writes).toHaveLength(1));
	factory.process.emit({ id: factory.process.message(0).id, result: { userAgent: "test" } });
	await vi.waitFor(() => expect(factory.process.writes).toHaveLength(3));
	factory.process.emit({
		id: factory.process.message(2).id,
		result: { thread: { id: "thread-1" } },
	});
	return { session: await creating, process: factory.process };
}

describe("Codex agent session", () => {
	it("streams only the final answer while retaining commentary inside Codex", async () => {
		const { session, process } = await createSession();
		const eventsPromise = (async () => {
			const events: AgentStreamEvent[] = [];
			for await (const event of session.query("Summarize this review")) events.push(event);
			return events;
		})();

		await vi.waitFor(() => expect(process.writes).toHaveLength(4));
		process.emit({
			id: process.message(3).id,
			result: { turn: { id: "turn-1" } },
		});
		process.emit({
			method: "item/started",
			params: {
				threadId: "thread-1",
				turnId: "turn-1",
				item: { type: "agentMessage", id: "commentary-1", phase: "commentary" },
			},
		});
		process.emit({
			method: "item/agentMessage/delta",
			params: {
				threadId: "thread-1",
				turnId: "turn-1",
				itemId: "commentary-1",
				delta: "I will inspect the diff.",
			},
		});
		process.emit({
			method: "item/started",
			params: {
				threadId: "thread-1",
				turnId: "turn-1",
				item: { type: "agentMessage", id: "answer-1", phase: "final_answer" },
			},
		});
		process.emit({
			method: "item/agentMessage/delta",
			params: {
				threadId: "thread-1",
				turnId: "turn-1",
				itemId: "answer-1",
				delta: "The review adds Ask Agent.",
			},
		});
		process.emit({
			method: "turn/completed",
			params: {
				threadId: "thread-1",
				turn: { id: "turn-1", status: "completed", error: null },
			},
		});

		await expect(eventsPromise).resolves.toEqual([
			{ type: "text_delta", text: "The review adds Ask Agent." },
			{ type: "turn_completed", outcome: "completed" },
		]);
		await session.dispose();
		expect(process.terminated).toBe(true);
	});
});
