import type { AgentModel } from "@stagereview/types/agent";
import { Check } from "lucide-react";
import {
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatAgentModelLabel } from "./agent-control-primitives";

interface AgentModelPickerProps {
	models: AgentModel[];
	selectedModel: AgentModel;
	onModelChange: (modelId: string) => void;
}

export function AgentModelPicker({ models, selectedModel, onModelChange }: AgentModelPickerProps) {
	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger aria-label="Choose agent model">
				<span>Model</span>
				<span className="ml-auto max-w-28 truncate text-muted-foreground">
					{formatAgentModelLabel(selectedModel.label)}
				</span>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent
				sideOffset={8}
				className="scrollbar-thin max-h-80 w-56 overflow-y-auto rounded-xl p-1.5 shadow-xl"
			>
				{models.map((model) => {
					const selected = model.id === selectedModel.id;
					return (
						<DropdownMenuItem
							key={model.id}
							aria-label={`Use ${model.label}`}
							className={cn("h-10 rounded-lg px-3", selected && "bg-accent")}
							onSelect={() => onModelChange(model.id)}
						>
							<span className="min-w-0 flex-1 truncate">{formatAgentModelLabel(model.label)}</span>
							{selected && <Check className="size-4 shrink-0 text-muted-foreground" />}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
