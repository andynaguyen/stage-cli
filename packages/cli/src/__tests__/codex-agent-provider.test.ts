import {
	AGENT_CAPABILITY_STATUS,
	AGENT_PROVIDER,
	type AgentProviderCapability,
} from "@stagereview/types/agent";
import { describe, expect, it } from "vitest";
import {
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
		});
	});

	it("reports command failures without presenting an install action", async () => {
		const capability = await getCapability(async () => {
			throw new CodexCommandError("Permission denied", "EACCES");
		});

		expect(capability.status).toBe(AGENT_CAPABILITY_STATUS.ERROR);
		expect(capability.detail).toBe("Stage could not inspect the Codex CLI installation.");
	});
});
