import type { AgentModel } from "@stagereview/types/agent";
import { Check } from "lucide-react";
import {
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

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
	const selectedLabel =
		selectedModel.reasoningEfforts.find((effort) => effort.id === selectedEffortId)?.label ??
		selectedEffortId;

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger aria-label="Choose reasoning effort">
				<span>Effort</span>
				<span className="ml-auto max-w-28 truncate text-muted-foreground">{selectedLabel}</span>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent sideOffset={8} className="w-52 rounded-xl p-1.5 shadow-xl">
				<DropdownMenuLabel>Effort</DropdownMenuLabel>
				{selectedModel.reasoningEfforts.map((effort) => {
					const selected = effort.id === selectedEffortId;
					return (
						<DropdownMenuItem
							key={effort.id}
							aria-label={`Use ${effort.label} reasoning`}
							className={cn("h-10 rounded-lg px-3", selected && "bg-accent")}
							onSelect={() =>
								onReasoningEffortChange(
									effort.id === selectedModel.defaultReasoningEffort ? null : effort.id,
								)
							}
						>
							<span className="min-w-0 flex-1 truncate">{effort.label}</span>
							{selected && <Check className="size-4 shrink-0 text-muted-foreground" />}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
