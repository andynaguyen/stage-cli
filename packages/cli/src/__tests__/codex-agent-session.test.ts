import { PassThrough } from "node:stream";
import { AGENT_PERMISSION_DECISION, type AgentStreamEvent } from "@stagereview/types/agent";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { CodexAppServerProcess, CodexProcessFactory } from "../agent/codex/process.js";
import { CodexAgentSession } from "../agent/codex/session.js";
import type { AgentProviderSessionOptions } from "../agent/provider.js";

const OutgoingMessageSchema = z.object({
	method: z.string().optional(),
	id: z.union([z.string(), z.number()]).optional(),
	params: z.unknown().optional(),
	result: z.unknown().optional(),
	error: z.unknown().optional(),
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

	messagesWithMethod(method: string) {
		return this.writes
			.map((line) => OutgoingMessageSchema.parse(JSON.parse(line)))
			.filter((message) => message.method === method);
	}

	messageWithMethod(method: string, index = 0) {
		const message = this.messagesWithMethod(method)[index];
		if (!message) throw new Error(`Expected outgoing ${method} message ${index}`);
		return message;
	}

	messageWithId(id: string | number) {
		const message = this.writes
			.map((line) => OutgoingMessageSchema.parse(JSON.parse(line)))
			.find((candidate) => candidate.id === id);
		if (!message) throw new Error(`Expected outgoing response ${id}`);
		return message;
	}
}

class FakeCodexProcessFactory implements CodexProcessFactory {
	readonly process = new FakeCodexProcess();

	start(): CodexAppServerProcess {
		return this.process;
	}
}

async function createSession(
	options: AgentProviderSessionOptions = { repoRoot: "/repo", instructions: "Read only." },
) {
	const factory = new FakeCodexProcessFactory();
	const creating = CodexAgentSession.create(options, factory);
	await vi.waitFor(() => expect(factory.process.writes).toHaveLength(1));
	factory.process.emit({ id: factory.process.message(0).id, result: { userAgent: "test" } });
	await vi.waitFor(() => expect(factory.process.writes).toHaveLength(3));
	factory.process.emit({
		id: factory.process.message(2).id,
		result: { thread: { id: "thread-1" } },
	});
	return { session: await creating, process: factory.process };
}

async function collectEvents(stream: AsyncIterable<AgentStreamEvent>): Promise<AgentStreamEvent[]> {
	const events: AgentStreamEvent[] = [];
	for await (const event of stream) events.push(event);
	return events;
}

async function beginTurn(
	session: CodexAgentSession,
	process: FakeCodexProcess,
	prompt: string,
	turnId: string,
) {
	const turnIndex = process.messagesWithMethod("turn/start").length;
	const eventsPromise = collectEvents(session.query(prompt));
	await vi.waitFor(() =>
		expect(process.messagesWithMethod("turn/start")).toHaveLength(turnIndex + 1),
	);
	const request = process.messageWithMethod("turn/start", turnIndex);
	process.emit({ id: request.id, result: { turn: { id: turnId } } });
	return { eventsPromise };
}

function emitFinalAnswer(
	process: FakeCodexProcess,
	turnId: string,
	itemId: string,
	text: string,
): void {
	process.emit({
		method: "item/started",
		params: {
			threadId: "thread-1",
			turnId,
			item: { type: "agentMessage", id: itemId, phase: "final_answer" },
		},
	});
	process.emit({
		method: "item/agentMessage/delta",
		params: {
			threadId: "thread-1",
			turnId,
			itemId,
			delta: text,
		},
	});
	process.emit({
		method: "turn/completed",
		params: {
			threadId: "thread-1",
			turn: { id: turnId, status: "completed", error: null },
		},
	});
}

describe("Codex agent session", () => {
	it("streams only the final answer while retaining commentary inside Codex", async () => {
		const { session, process } = await createSession();
		const { eventsPromise } = await beginTurn(session, process, "Summarize this review", "turn-1");
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
				item: { type: "agentMessage", id: "answer-1", phase: null },
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

	it("streams turn events received before the turn start response", async () => {
		const { session, process } = await createSession();
		const eventsPromise = collectEvents(session.query("Summarize this review"));
		await vi.waitFor(() => expect(process.messagesWithMethod("turn/start")).toHaveLength(1));
		const turnRequest = process.messageWithMethod("turn/start");

		emitFinalAnswer(process, "turn-1", "answer-1", "The review adds Ask Agent.");
		process.emit({ id: turnRequest.id, result: { turn: { id: "turn-1" } } });

		await expect(eventsPromise).resolves.toEqual([
			{ type: "text_delta", text: "The review adds Ask Agent." },
			{ type: "turn_completed", outcome: "completed" },
		]);
		await session.dispose();
	});

	it("reuses one thread for follow-up turns", async () => {
		const { session, process } = await createSession();
		const { eventsPromise: firstEvents } = await beginTurn(
			session,
			process,
			"What changed?",
			"turn-1",
		);
		emitFinalAnswer(process, "turn-1", "answer-1", "A provider was added.");
		await expect(firstEvents).resolves.toContainEqual({
			type: "text_delta",
			text: "A provider was added.",
		});

		const { eventsPromise: secondEvents } = await beginTurn(session, process, "Why?", "turn-2");
		emitFinalAnswer(process, "turn-2", "answer-2", "To support review questions.");
		await expect(secondEvents).resolves.toContainEqual({
			type: "text_delta",
			text: "To support review questions.",
		});

		expect(process.messagesWithMethod("thread/start")).toHaveLength(1);
		expect(process.messageWithMethod("thread/start").params).toMatchObject({
			cwd: "/repo",
			developerInstructions: "Read only.",
			ephemeral: true,
		});
		expect(process.messageWithMethod("thread/start").params).not.toHaveProperty("sandbox");
		expect(process.messagesWithMethod("turn/start")).toHaveLength(2);
		for (const request of process.messagesWithMethod("turn/start")) {
			expect(request.params).toMatchObject({
				threadId: "thread-1",
				sandboxPolicy: { type: "readOnly", networkAccess: false },
			});
		}
		await session.dispose();
	});

	it("applies immutable model settings to every turn", async () => {
		const { session, process } = await createSession({
			repoRoot: "/repo",
			instructions: "Read only.",
			model: "fast-model",
			reasoningEffort: "high",
			serviceTier: "fast",
		});
		const { eventsPromise } = await beginTurn(session, process, "Inspect this", "turn-1");

		expect(process.messageWithMethod("turn/start").params).toMatchObject({
			model: "fast-model",
			effort: "high",
			serviceTier: "fast",
		});
		emitFinalAnswer(process, "turn-1", "answer-1", "Done");
		await eventsPromise;
		await session.dispose();
	});

	it("allows one command inside the read-only sandbox and denies broader access", async () => {
		const { session, process } = await createSession();
		const iterator = session.query("Inspect the tests")[Symbol.asyncIterator]();
		const permissionEvent = iterator.next();
		await vi.waitFor(() => expect(process.messagesWithMethod("turn/start")).toHaveLength(1));
		const turnRequest = process.messageWithMethod("turn/start");
		process.emit({ id: turnRequest.id, result: { turn: { id: "turn-1" } } });
		process.emit({
			method: "item/commandExecution/requestApproval",
			id: 99,
			params: {
				threadId: "thread-1",
				turnId: "turn-1",
				itemId: "command-1",
				command: "git diff --stat",
				cwd: "/repo",
				reason: "Inspect the review",
			},
		});

		await expect(permissionEvent).resolves.toEqual({
			done: false,
			value: {
				type: "permission_request",
				requestId: 99,
				title: "$ git diff --stat",
				description: "Inspect the review",
			},
		});
		await session.respondToPermission(99, AGENT_PERMISSION_DECISION.ALLOW);
		expect(process.messageWithId(99).result).toEqual({ decision: "accept" });

		const fileNotice = iterator.next();
		process.emit({
			method: "item/fileChange/requestApproval",
			id: 100,
			params: {
				threadId: "thread-1",
				turnId: "turn-1",
				itemId: "file-1",
				reason: "Edit a test",
			},
		});
		await expect(fileNotice).resolves.toMatchObject({
			done: false,
			value: { type: "write_blocked", message: expect.stringContaining("file change") },
		});
		expect(process.messageWithId(100).result).toEqual({ decision: "decline" });

		const escalationNotice = iterator.next();
		process.emit({
			method: "item/permissions/requestApproval",
			id: 101,
			params: {
				threadId: "thread-1",
				turnId: "turn-1",
				itemId: "permissions-1",
				reason: "Access the network",
			},
		});
		await expect(escalationNotice).resolves.toMatchObject({
			done: false,
			value: { type: "write_blocked", message: expect.stringContaining("network access") },
		});
		expect(process.messageWithId(101).result).toEqual({
			permissions: {},
			scope: "turn",
		});

		const terminalEvent = iterator.next();
		process.emit({
			method: "turn/completed",
			params: {
				threadId: "thread-1",
				turn: { id: "turn-1", status: "completed", error: null },
			},
		});
		await expect(terminalEvent).resolves.toEqual({
			done: false,
			value: { type: "turn_completed", outcome: "completed" },
		});
		await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
		await session.dispose();
	});

	it("interrupts immediately and ignores late output before the next turn", async () => {
		const { session, process } = await createSession();
		const { eventsPromise: firstEvents } = await beginTurn(
			session,
			process,
			"Start a long answer",
			"turn-1",
		);
		const aborting = session.abort();
		await vi.waitFor(() => expect(process.messagesWithMethod("turn/interrupt")).toHaveLength(1));
		const interrupt = process.messageWithMethod("turn/interrupt");
		process.emit({ id: interrupt.id, result: {} });
		await aborting;
		await expect(firstEvents).resolves.toEqual([{ type: "turn_completed", outcome: "stopped" }]);

		const { eventsPromise: secondEvents } = await beginTurn(
			session,
			process,
			"Try again",
			"turn-2",
		);
		emitFinalAnswer(process, "turn-1", "late-answer", "Late output");
		emitFinalAnswer(process, "turn-2", "answer-2", "Fresh output");
		await expect(secondEvents).resolves.toEqual([
			{ type: "text_delta", text: "Fresh output" },
			{ type: "turn_completed", outcome: "completed" },
		]);
		await session.dispose();
	});

	it("rejects overlapping turns and maps terminal provider failures", async () => {
		const { session, process } = await createSession();
		const { eventsPromise: firstEvents } = await beginTurn(session, process, "First", "turn-1");
		const overlapping = session.query("Second")[Symbol.asyncIterator]();
		await expect(overlapping.next()).rejects.toThrow("already running");

		process.emit({
			method: "error",
			params: {
				threadId: "thread-1",
				turnId: "turn-1",
				willRetry: false,
				error: { message: "Provider failed" },
			},
		});
		await expect(firstEvents).resolves.toEqual([
			{ type: "error", code: "provider_error", message: "Provider failed" },
			{ type: "turn_completed", outcome: "failed" },
		]);
		await session.dispose();
	});
});
