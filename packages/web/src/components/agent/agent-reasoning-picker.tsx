import type { AgentModel } from "@stagereview/types/agent";
import { Brain } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AGENT_CONTROL_CLASS } from "./agent-control-primitives";

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
	const [open, setOpen] = useState(false);
	const selectedOption = selectedModel.reasoningEfforts.find(
		(effort) => effort.id === reasoningEffort,
	);
	const selectedLabel = selectedOption?.label ?? "Auto";

	const chooseEffort = (effort: string | null) => {
		onReasoningEffortChange(effort);
		setOpen(false);
	};

	return (
		<Popover modal={false} open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button type="button" aria-label="Choose reasoning effort" className={AGENT_CONTROL_CLASS}>
					<Brain className="size-3.5" />
					<span>{selectedLabel}</span>
				</button>
			</PopoverTrigger>
			<PopoverContent
				side="top"
				align="start"
				sideOffset={8}
				collisionPadding={16}
				className="w-44 rounded-xl p-1.5 shadow-xl"
			>
				<fieldset>
					<legend className="sr-only">Reasoning effort options</legend>
					<ReasoningOption
						label="Auto"
						selected={reasoningEffort === null}
						onSelect={() => chooseEffort(null)}
					/>
					{selectedModel.reasoningEfforts.map((effort) => (
						<ReasoningOption
							key={effort.id}
							label={effort.label}
							selected={reasoningEffort === effort.id}
							onSelect={() => chooseEffort(effort.id)}
						/>
					))}
				</fieldset>
			</PopoverContent>
		</Popover>
	);
}

interface ReasoningOptionProps {
	label: string;
	selected: boolean;
	onSelect: () => void;
}

function ReasoningOption({ label, selected, onSelect }: ReasoningOptionProps) {
	const accessibleLabel = label === "Auto" ? "Use automatic reasoning" : `Use ${label} reasoning`;
	return (
		<button
			type="button"
			aria-label={accessibleLabel}
			aria-pressed={selected}
			className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
			onClick={onSelect}
		>
			<span className="flex w-3 justify-center">
				{selected && <span className="size-1.5 rounded-full bg-foreground" />}
			</span>
			<Brain className="size-3.5 text-muted-foreground" />
			{label}
		</button>
	);
}
