import type { AgentModel } from "@stagereview/types/agent";
import { AgentSettingOption } from "./agent-control-primitives";

interface AgentReasoningPickerProps {
	selectedModel: AgentModel;
	reasoningEffort: string | null;
	onReasoningEffortChange: (effort: string | null) => void;
}

export function AgentReasoningPicker({
	selectedModel,
	reasoningEffort,
	onReasoningEffortChange,
}: AgentReasoningPickerProps) {
	const selectedEffortId = reasoningEffort ?? selectedModel.defaultReasoningEffort;

	return (
		<div>
			{selectedModel.reasoningEfforts.map((effort) => (
				<AgentSettingOption
					key={effort.id}
					label={effort.label}
					ariaLabel={`Use ${effort.label} reasoning`}
					selected={effort.id === selectedEffortId}
					onSelect={() =>
						onReasoningEffortChange(
							effort.id === selectedModel.defaultReasoningEffort ? null : effort.id,
						)
					}
				/>
			))}
		</div>
	);
}
