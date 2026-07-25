import { CodexAgentProvider } from "./codex/provider.js";
import { AgentRuntime } from "./runtime.js";

export type {
	AgentProvider,
	AgentProviderSessionOptions,
	AgentRequestId,
	AgentSession,
} from "./provider.js";
export { AgentRuntime, AgentRuntimeError } from "./runtime.js";

export function createAgentRuntime(): AgentRuntime {
	return new AgentRuntime([new CodexAgentProvider()]);
}
