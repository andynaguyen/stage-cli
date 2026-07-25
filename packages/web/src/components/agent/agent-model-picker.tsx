import type { AgentModel } from "@stagereview/types/agent";
import { AgentSettingOption, formatAgentModelLabel } from "./agent-control-primitives";

interface AgentModelPickerProps {
	models: AgentModel[];
	selectedModel: AgentModel;
	onModelChange: (modelId: string) => void;
}

export function AgentModelPicker({ models, selectedModel, onModelChange }: AgentModelPickerProps) {
	return (
		<div className="scrollbar-thin max-h-72 overflow-y-auto">
			{models.map((model) => (
				<AgentSettingOption
					key={model.id}
					label={formatAgentModelLabel(model.label)}
					ariaLabel={`Use ${model.label}`}
					selected={model.id === selectedModel.id}
					onSelect={() => onModelChange(model.id)}
				/>
			))}
		</div>
	);
}
