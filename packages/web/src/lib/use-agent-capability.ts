import {
	AGENT_CAPABILITY_STATUS,
	type AgentCapabilitiesResponse,
	type AgentProviderCapability,
	type AgentProviderId,
} from "@stagereview/types/agent";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getAgentCapabilities } from "./agent-api";

export function useAgentCapability(runId: string, providerId: AgentProviderId) {
	const { data, error, isError, isFetching, refetch } = useQuery<
		AgentCapabilitiesResponse,
		unknown,
		AgentProviderCapability | null
	>({
		queryKey: ["agent-capability", runId, providerId],
		queryFn: () => getAgentCapabilities(runId),
		select: ({ providers }) =>
			providers.find((candidate) => candidate.providerId === providerId) ?? null,
		retry: false,
		refetchOnWindowFocus: false,
	});
	const capability = useMemo<AgentProviderCapability | null>(() => {
		if (!isError) return data ?? null;
		return {
			providerId,
			label: "Local agent",
			status: AGENT_CAPABILITY_STATUS.ERROR,
			detail: error instanceof Error ? error.message : "Ask Agent encountered an unexpected error",
			models: [],
		};
	}, [data, error, isError, providerId]);
	const refresh = useCallback(() => {
		void refetch();
	}, [refetch]);

	return { capability, isLoading: isFetching, refresh };
}
