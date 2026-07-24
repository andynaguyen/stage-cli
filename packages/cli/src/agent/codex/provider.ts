import {
	AGENT_CAPABILITY_STATUS,
	AGENT_PROVIDER,
	type AgentProviderCapability,
} from "@stagereview/types/agent";
import type { AgentProvider, AgentProviderSessionOptions, AgentSession } from "../provider.js";
import {
	CodexCommandError,
	type CodexCommandRunner,
	type CodexProcessFactory,
	NodeCodexCommandRunner,
	NodeCodexProcessFactory,
} from "./process.js";
import { CodexAgentSession } from "./session.js";

const MINIMUM_CODEX_VERSION = [0, 144, 6] as const;
const VERSION_PATTERN = /codex-cli\s+(\d+)\.(\d+)\.(\d+)/;

function parseVersion(output: string): [number, number, number] | null {
	const match = VERSION_PATTERN.exec(output);
	if (!match) return null;
	const major = Number(match[1]);
	const minor = Number(match[2]);
	const patch = Number(match[3]);
	if (![major, minor, patch].every(Number.isInteger)) return null;
	return [major, minor, patch];
}

function supportsVersion(version: [number, number, number]): boolean {
	for (let index = 0; index < version.length; index++) {
		const actual = version[index];
		const minimum = MINIMUM_CODEX_VERSION[index];
		if (actual === undefined || minimum === undefined) return false;
		if (actual > minimum) return true;
		if (actual < minimum) return false;
	}
	return true;
}

function versionLabel(version: [number, number, number]): string {
	return version.join(".");
}

export class CodexAgentProvider implements AgentProvider {
	readonly id = AGENT_PROVIDER.CODEX;

	constructor(
		private readonly processFactory: CodexProcessFactory = new NodeCodexProcessFactory(),
		private readonly commandRunner: CodexCommandRunner = new NodeCodexCommandRunner(),
	) {}

	async getCapability(): Promise<AgentProviderCapability> {
		let versionOutput: string;
		try {
			versionOutput = (await this.commandRunner.run(["--version"])).stdout;
		} catch (error) {
			const missing = error instanceof CodexCommandError && error.code === "ENOENT";
			return {
				providerId: this.id,
				label: "Codex",
				status: missing ? AGENT_CAPABILITY_STATUS.MISSING : AGENT_CAPABILITY_STATUS.ERROR,
				detail: missing
					? "Install the Codex CLI to use Ask Agent."
					: "Stage could not inspect the Codex CLI installation.",
			};
		}

		const version = parseVersion(versionOutput);
		if (!version || !supportsVersion(version)) {
			return {
				providerId: this.id,
				label: "Codex",
				status: AGENT_CAPABILITY_STATUS.INCOMPATIBLE,
				detail: `Ask Agent requires Codex CLI ${MINIMUM_CODEX_VERSION.join(".")} or newer.`,
			};
		}

		try {
			await this.commandRunner.run(["login", "status"]);
		} catch {
			return {
				providerId: this.id,
				label: "Codex",
				status: AGENT_CAPABILITY_STATUS.UNAUTHENTICATED,
				detail: "Run `codex login` before using Ask Agent.",
			};
		}

		return {
			providerId: this.id,
			label: "Codex",
			status: AGENT_CAPABILITY_STATUS.AVAILABLE,
			detail: `Codex CLI ${versionLabel(version)}`,
		};
	}

	createSession(options: AgentProviderSessionOptions): Promise<AgentSession> {
		return CodexAgentSession.create(options, this.processFactory);
	}
}
