import { PassThrough } from "node:stream";
import {
	AGENT_CAPABILITY_STATUS,
	AGENT_PROVIDER,
	type AgentProviderCapability,
} from "@stagereview/types/agent";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	type CodexAppServerProcess,
	CodexCommandError,
	type CodexCommandResult,
	type CodexCommandRunner,
	type CodexProcessFactory,
} from "../agent/codex/process.js";
import { CodexAgentProvider } from "../agent/codex/provider.js";

class NeverProcessFactory implements CodexProcessFactory {
	start(): never {
		throw new Error("Process creation is not expected during capability checks");
	}
}

const ClientMessageSchema = z.object({
	method: z.string(),
	id: z.number().optional(),
	params: z.object({ cursor: z.string().optional() }).passthrough(),
});

class ModelCatalogProcess implements CodexAppServerProcess {
	readonly stdout = new PassThrough();
	terminated = false;

	writeLine(line: string): void {
		const message = ClientMessageSchema.safeParse(JSON.parse(line));
		if (!message.success || message.data.id === undefined) return;
		if (message.data.method === "initialize") {
			this.respond(message.data.id, { userAgent: "test" });
			return;
		}
		if (message.data.method !== "model/list") return;
		if (!message.data.params.cursor) {
			this.respond(message.data.id, {
				data: [
					this.model("hidden-model", "Hidden", true, [], []),
					this.model(
						"balanced-model",
						"Balanced model",
						false,
						[
							{ reasoningEffort: "low", description: "Lower latency" },
							{ reasoningEffort: "high", description: "More reasoning" },
							{ reasoningEffort: "xhigh", description: "Extended reasoning" },
						],
						[],
					),
				],
				nextCursor: "page-2",
			});
			return;
		}
		this.respond(message.data.id, {
			data: [
				this.model(
					"fast-model",
					"Fast model",
					false,
					[
						{ reasoningEffort: "medium", description: "Balanced reasoning" },
						{ reasoningEffort: "max", description: "Maximum reasoning" },
						{ reasoningEffort: "ultra", description: "Ultra reasoning" },
					],
					[{ id: "priority", name: "Fast", description: "Lower latency" }],
				),
			],
			nextCursor: null,
		});
	}

	closeInput(): void {}

	terminate(): void {
		this.terminated = true;
	}

	onTermination(): () => void {
		return () => {};
	}

	private respond(id: number, result: unknown): void {
		this.stdout.write(`${JSON.stringify({ id, result })}\n`);
	}

	private model(
		id: string,
		description: string,
		hidden: boolean,
		supportedReasoningEfforts: Array<{ reasoningEffort: string; description: string }>,
		serviceTiers: Array<{ id: string; name: string; description: string }>,
	) {
		return {
			id,
			displayName: id,
			description,
			hidden,
			supportedReasoningEfforts,
			defaultReasoningEffort: supportedReasoningEfforts[0]?.reasoningEffort ?? "medium",
			serviceTiers,
			defaultServiceTier: null,
			isDefault: id === "balanced-model",
		};
	}
}

class ModelCatalogProcessFactory implements CodexProcessFactory {
	readonly process = new ModelCatalogProcess();
	starts = 0;

	start(): CodexAppServerProcess {
		this.starts += 1;
		return this.process;
	}
}

class HangingModelProcess implements CodexAppServerProcess {
	readonly stdout = new PassThrough();
	terminated = false;

	writeLine(line: string): void {
		const message = ClientMessageSchema.safeParse(JSON.parse(line));
		if (message.success && message.data.id !== undefined && message.data.method === "initialize") {
			this.stdout.write(
				`${JSON.stringify({ id: message.data.id, result: { userAgent: "test" } })}\n`,
			);
		}
	}

	closeInput(): void {}

	terminate(): void {
		this.terminated = true;
	}

	onTermination(): () => void {
		return () => {};
	}
}

class RetryingModelProcessFactory implements CodexProcessFactory {
	readonly hangingProcess = new HangingModelProcess();
	readonly catalogProcess = new ModelCatalogProcess();
	starts = 0;

	start(): CodexAppServerProcess {
		this.starts += 1;
		return this.starts === 1 ? this.hangingProcess : this.catalogProcess;
	}
}

class FakeCommandRunner implements CodexCommandRunner {
	constructor(private readonly handler: (args: string[]) => Promise<CodexCommandResult>) {}

	run(args: string[]): Promise<CodexCommandResult> {
		return this.handler(args);
	}
}

function getCapability(
	handler: (args: string[]) => Promise<CodexCommandResult>,
): Promise<AgentProviderCapability> {
	return new CodexAgentProvider(
		new NeverProcessFactory(),
		new FakeCommandRunner(handler),
	).getCapability();
}

describe("Codex agent provider capability", () => {
	it("reports an actionable missing installation", async () => {
		const capability = await getCapability(async () => {
			throw new CodexCommandError("spawn codex ENOENT", "ENOENT");
		});

		expect(capability).toEqual({
			providerId: AGENT_PROVIDER.CODEX,
			label: "Codex",
			status: AGENT_CAPABILITY_STATUS.MISSING,
			detail: "Install the Codex CLI to use Ask Agent.",
			models: [],
		});
	});

	it("rejects unsupported and unparseable CLI versions", async () => {
		for (const output of ["codex-cli 0.144.5", "unexpected version output"]) {
			const capability = await getCapability(async () => ({ stdout: output, stderr: "" }));

			expect(capability.status).toBe(AGENT_CAPABILITY_STATUS.INCOMPATIBLE);
			expect(capability.detail).toContain("0.144.6 or newer");
		}
	});

	it("distinguishes a logged-out CLI from an available one", async () => {
		const loggedOut = await getCapability(async (args) => {
			if (args[0] === "--version") return { stdout: "codex-cli 0.144.6", stderr: "" };
			throw new CodexCommandError("Not logged in", null);
		});
		expect(loggedOut.status).toBe(AGENT_CAPABILITY_STATUS.UNAUTHENTICATED);
		expect(loggedOut.detail).toContain("codex login");

		const available = await getCapability(async (args) => ({
			stdout: args[0] === "--version" ? "codex-cli 0.145.0" : "Logged in",
			stderr: "",
		}));
		expect(available).toEqual({
			providerId: AGENT_PROVIDER.CODEX,
			label: "Codex",
			status: AGENT_CAPABILITY_STATUS.AVAILABLE,
			detail: "Codex CLI 0.145.0",
			models: [],
		});
	});

	it("normalizes and caches every visible model-list page", async () => {
		const factory = new ModelCatalogProcessFactory();
		const provider = new CodexAgentProvider(
			factory,
			new FakeCommandRunner(async (args) => ({
				stdout: args[0] === "--version" ? "codex-cli 0.144.6" : "Logged in",
				stderr: "",
			})),
		);

		const first = await provider.getCapability();
		const second = await provider.getCapability();

		expect(first.models).toEqual([
			{
				id: "balanced-model",
				label: "balanced-model",
				description: "Balanced model",
				isDefault: true,
				reasoningEfforts: [
					{ id: "low", label: "Low", description: "Lower latency" },
					{ id: "high", label: "High", description: "More reasoning" },
					{ id: "xhigh", label: "Extra High", description: "Extended reasoning" },
				],
				defaultReasoningEffort: "low",
				serviceTiers: [],
				defaultServiceTier: null,
			},
			{
				id: "fast-model",
				label: "fast-model",
				description: "Fast model",
				isDefault: false,
				reasoningEfforts: [
					{ id: "medium", label: "Medium", description: "Balanced reasoning" },
					{ id: "max", label: "Max", description: "Maximum reasoning" },
					{ id: "ultra", label: "Ultra", description: "Ultra reasoning" },
				],
				defaultReasoningEffort: "medium",
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
		]);
		expect(second.models).toEqual(first.models);
		expect(factory.starts).toBe(1);
		expect(factory.process.terminated).toBe(true);
	});

	it("keeps Ask Agent available when model discovery times out", async () => {
		const process = new HangingModelProcess();
		const provider = new CodexAgentProvider(
			{ start: () => process },
			new FakeCommandRunner(async (args) => ({
				stdout: args[0] === "--version" ? "codex-cli 0.144.6" : "Logged in",
				stderr: "",
			})),
			10,
		);

		const capability = await provider.getCapability();

		expect(capability.status).toBe(AGENT_CAPABILITY_STATUS.AVAILABLE);
		expect(capability.models).toEqual([]);
		expect(process.terminated).toBe(true);
	});

	it("retries model discovery after a transient failure", async () => {
		const factory = new RetryingModelProcessFactory();
		const provider = new CodexAgentProvider(
			factory,
			new FakeCommandRunner(async (args) => ({
				stdout: args[0] === "--version" ? "codex-cli 0.144.6" : "Logged in",
				stderr: "",
			})),
			10,
		);

		const first = await provider.getCapability();
		const second = await provider.getCapability();

		expect(first.models).toEqual([]);
		expect(second.models.map((model) => model.id)).toEqual(["balanced-model", "fast-model"]);
		expect(factory.starts).toBe(2);
		expect(factory.hangingProcess.terminated).toBe(true);
		expect(factory.catalogProcess.terminated).toBe(true);
	});

	it("reports command failures without presenting an install action", async () => {
		const capability = await getCapability(async () => {
			throw new CodexCommandError("Permission denied", "EACCES");
		});

		expect(capability.status).toBe(AGENT_CAPABILITY_STATUS.ERROR);
		expect(capability.detail).toBe("Stage could not inspect the Codex CLI installation.");
	});
});
