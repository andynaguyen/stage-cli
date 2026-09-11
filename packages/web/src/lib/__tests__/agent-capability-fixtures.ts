import {
	AGENT_CAPABILITY_STATUS,
	AGENT_PROVIDER,
	type AgentCapabilitiesResponse,
} from "@stagereview/types/agent";

export function makeAgentCapabilities(): AgentCapabilitiesResponse {
	return {
		providers: [
			{
				providerId: AGENT_PROVIDER.CODEX,
				label: "Codex",
				status: AGENT_CAPABILITY_STATUS.AVAILABLE,
				detail: "Codex CLI 0.144.6",
				models: [
					{
						id: "balanced-model",
						label: "Balanced model",
						description: "Balanced model",
						isDefault: true,
						reasoningEfforts: [
							{ id: "low", label: "Low", description: "Lower latency" },
							{ id: "high", label: "High", description: "More reasoning" },
						],
						defaultReasoningEffort: "low",
						serviceTiers: [],
						defaultServiceTier: null,
					},
					{
						id: "fast-model",
						label: "Fast model",
						description: "Fast model",
						isDefault: false,
						reasoningEfforts: [{ id: "high", label: "High", description: "More reasoning" }],
						defaultReasoningEffort: "high",
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
				],
			},
		],
	};
}
