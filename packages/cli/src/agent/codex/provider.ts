import {
	AGENT_CAPABILITY_STATUS,
	AGENT_PROVIDER,
	AGENT_SERVICE_TIER_KIND,
	type AgentModel,
	type AgentProviderCapability,
} from "@stagereview/types/agent";
import type { AgentProvider, AgentProviderSessionOptions, AgentSession } from "../provider.js";
import { CodexAppServerClient } from "./app-server-client.js";
import {
	CodexCommandError,
	type CodexCommandRunner,
	type CodexProcessFactory,
	NodeCodexCommandRunner,
	NodeCodexProcessFactory,
} from "./process.js";
import { ModelListResponseSchema } from "./protocol.js";
import { CodexAgentSession } from "./session.js";

const MINIMUM_CODEX_VERSION = [0, 144, 6] as const;
const VERSION_PATTERN = /codex-cli\s+(\d+)\.(\d+)\.(\d+)/;
const MODEL_DISCOVERY_TIMEOUT_MS = 6000;
const MAX_MODEL_PAGES = 50;
const FAST_TIER_NAME = "Fast";

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

function reasoningEffortLabel(id: string): string {
	switch (id) {
		case "minimal":
			return "Minimal";
		case "none":
			return "Off";
		case "low":
			return "Low";
		case "medium":
			return "Medium";
		case "high":
			return "High";
		case "xhigh":
			return "Extra High";
		case "max":
			return "Max";
		case "ultra":
			return "Ultra";
		default:
			return id;
	}
}

export class CodexAgentProvider implements AgentProvider {
	readonly id = AGENT_PROVIDER.CODEX;
	private modelCatalogPromise: Promise<AgentModel[]> | null = null;

	constructor(
		private readonly processFactory: CodexProcessFactory = new NodeCodexProcessFactory(),
		private readonly commandRunner: CodexCommandRunner = new NodeCodexCommandRunner(),
		private readonly modelDiscoveryTimeoutMs = MODEL_DISCOVERY_TIMEOUT_MS,
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
				models: [],
			};
		}

		const version = parseVersion(versionOutput);
		if (!version || !supportsVersion(version)) {
			return {
				providerId: this.id,
				label: "Codex",
				status: AGENT_CAPABILITY_STATUS.INCOMPATIBLE,
				detail: `Ask Agent requires Codex CLI ${MINIMUM_CODEX_VERSION.join(".")} or newer.`,
				models: [],
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
				models: [],
			};
		}

		return {
			providerId: this.id,
			label: "Codex",
			status: AGENT_CAPABILITY_STATUS.AVAILABLE,
			detail: `Codex CLI ${versionLabel(version)}`,
			models: await this.getModelCatalog(),
		};
	}

	createSession(options: AgentProviderSessionOptions): Promise<AgentSession> {
		return CodexAgentSession.create(options, this.processFactory);
	}

	private getModelCatalog(): Promise<AgentModel[]> {
		if (!this.modelCatalogPromise) {
			const discovery = this.discoverModels().catch(() => {
				if (this.modelCatalogPromise === discovery) this.modelCatalogPromise = null;
				return [];
			});
			this.modelCatalogPromise = discovery;
		}
		return this.modelCatalogPromise;
	}

	private async discoverModels(): Promise<AgentModel[]> {
		const startedAt = Date.now();
		const client = await CodexAppServerClient.start(this.processFactory, {
			requestTimeoutMs: this.modelDiscoveryTimeoutMs,
		});
		try {
			const models: AgentModel[] = [];
			const seenCursors = new Set<string>();
			let cursor: string | null = null;
			for (let page = 0; page < MAX_MODEL_PAGES; page++) {
				const remainingMs = this.modelDiscoveryTimeoutMs - (Date.now() - startedAt);
				if (remainingMs <= 0) throw new Error("Codex model discovery timed out");
				const raw = await client.request(
					"model/list",
					{
						includeHidden: false,
						...(cursor ? { cursor } : {}),
					},
					remainingMs,
				);
				const response = ModelListResponseSchema.parse(raw);
				for (const model of response.data) {
					if (model.hidden) continue;
					models.push({
						id: model.id,
						label: model.displayName,
						description: model.description,
						isDefault: model.isDefault,
						reasoningEfforts: model.supportedReasoningEfforts.map((effort) => ({
							id: effort.reasoningEffort,
							label: reasoningEffortLabel(effort.reasoningEffort),
							description: effort.description,
						})),
						defaultReasoningEffort: model.defaultReasoningEffort,
						serviceTiers: model.serviceTiers.map((tier) => ({
							id: tier.id,
							label: tier.name,
							description: tier.description,
							kind:
								tier.name === FAST_TIER_NAME
									? AGENT_SERVICE_TIER_KIND.FAST
									: AGENT_SERVICE_TIER_KIND.OTHER,
						})),
						defaultServiceTier: model.defaultServiceTier,
					});
				}
				cursor = response.nextCursor;
				if (!cursor) return models;
				if (seenCursors.has(cursor)) throw new Error("Codex model discovery repeated a cursor");
				seenCursors.add(cursor);
			}
			throw new Error("Codex model discovery exceeded the page limit");
		} finally {
			client.dispose();
		}
	}
}
