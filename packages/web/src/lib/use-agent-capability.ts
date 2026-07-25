import {
	AGENT_CAPABILITY_STATUS,
	type AgentProviderCapability,
	type AgentProviderId,
} from "@stagereview/types/agent";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAgentCapabilities } from "./agent-api";
import { describeAgentError } from "./agent-chat-message";

export function useAgentCapability(runId: string, providerId: AgentProviderId) {
	const [capability, setCapability] = useState<AgentProviderCapability | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const generationRef = useRef(0);

	const refresh = useCallback(() => {
		const generation = generationRef.current + 1;
		generationRef.current = generation;
		setIsLoading(true);
		void getAgentCapabilities(runId)
			.then(({ providers }) => {
				if (generationRef.current !== generation) return;
				const provider = providers.find((candidate) => candidate.providerId === providerId) ?? null;
				setCapability(provider);
			})
			.catch((error: unknown) => {
				if (generationRef.current !== generation) return;
				setCapability({
					providerId,
					label: "Local agent",
					status: AGENT_CAPABILITY_STATUS.ERROR,
					detail: describeAgentError(error),
					models: [],
				});
			})
			.finally(() => {
				if (generationRef.current === generation) setIsLoading(false);
			});
	}, [providerId, runId]);

	useEffect(() => {
		refresh();
		return () => {
			generationRef.current += 1;
		};
	}, [refresh]);

	return { capability, isLoading, refresh };
}
