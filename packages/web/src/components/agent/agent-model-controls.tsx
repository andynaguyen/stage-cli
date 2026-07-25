import { AGENT_SERVICE_TIER_KIND, type AgentModel } from "@stagereview/types/agent";
import { Bot, Check, ChevronDown } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { AGENT_CONTROL_CLASS, formatAgentModelLabel } from "./agent-control-primitives";
import { AgentModelPicker } from "./agent-model-picker";
import { AgentReasoningPicker } from "./agent-reasoning-picker";

interface AgentModelControlsProps {
	providerLabel: string;
	models: AgentModel[];
	selectedModel: AgentModel | null;
	reasoningEffort: string | null;
	serviceTier: string | null;
	onModelChange: (modelId: string) => void;
	onReasoningEffortChange: (effort: string | null) => void;
	onServiceTierChange: (tier: string | null) => void;
}

export function AgentModelControls({
	providerLabel,
	models,
	selectedModel,
	reasoningEffort,
	serviceTier,
	onModelChange,
	onReasoningEffortChange,
	onServiceTierChange,
}: AgentModelControlsProps) {
	if (!selectedModel || models.length === 0) {
		return (
			<div className="flex min-w-0 flex-1 items-center">
				<span className={AGENT_CONTROL_CLASS}>
					<Bot className="size-3.5 text-muted-foreground" />
					{providerLabel}
				</span>
			</div>
		);
	}

	const fastTier =
		selectedModel.serviceTiers.find((tier) => tier.kind === AGENT_SERVICE_TIER_KIND.FAST) ?? null;
	const selectedEffortId = reasoningEffort ?? selectedModel.defaultReasoningEffort;
	const selectedEffortLabel =
		selectedModel.reasoningEfforts.find((effort) => effort.id === selectedEffortId)?.label ?? null;
	const modelLabel = formatAgentModelLabel(selectedModel.label);

	return (
		<div className="flex min-w-0 flex-1 items-center">
			<DropdownMenu modal={false}>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label="Choose model, effort, and speed"
						className={cn(AGENT_CONTROL_CLASS, "min-w-0 max-w-full")}
					>
						<Bot className="size-3.5 shrink-0 text-muted-foreground" />
						<span className="truncate">{modelLabel}</span>
						{selectedEffortLabel && (
							<span className="shrink-0 text-muted-foreground">{selectedEffortLabel}</span>
						)}
						<ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					side="top"
					align="start"
					sideOffset={8}
					collisionPadding={16}
					className="w-60 rounded-xl p-1.5 shadow-xl"
				>
					<AgentModelPicker
						models={models}
						selectedModel={selectedModel}
						onModelChange={onModelChange}
					/>
					{selectedModel.reasoningEfforts.length > 0 && (
						<AgentReasoningPicker
							selectedModel={selectedModel}
							reasoningEffort={reasoningEffort}
							onReasoningEffortChange={onReasoningEffortChange}
						/>
					)}
					{fastTier && (
						<DropdownMenuSub>
							<DropdownMenuSubTrigger aria-label="Choose agent speed">
								<span>Speed</span>
								<span className="ml-auto text-muted-foreground">
									{serviceTier === fastTier.id ? fastTier.label : "Standard"}
								</span>
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent sideOffset={8} className="w-60 rounded-xl p-1.5 shadow-xl">
								<DropdownMenuLabel>Speed</DropdownMenuLabel>
								<SpeedOption
									label="Standard"
									description="Default speed"
									selected={serviceTier === null}
									onSelect={() => onServiceTierChange(null)}
								/>
								<SpeedOption
									label={fastTier.label}
									description={fastTier.description}
									selected={serviceTier === fastTier.id}
									onSelect={() => onServiceTierChange(fastTier.id)}
								/>
							</DropdownMenuSubContent>
						</DropdownMenuSub>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

interface SpeedOptionProps {
	label: string;
	description: string;
	selected: boolean;
	onSelect: () => void;
}

function SpeedOption({ label, description, selected, onSelect }: SpeedOptionProps) {
	return (
		<DropdownMenuItem
			aria-label={`Use ${label.toLocaleLowerCase()} speed`}
			className={cn("min-h-14 items-start rounded-lg px-3 py-2", selected && "bg-accent")}
			onSelect={onSelect}
		>
			<div className="min-w-0 flex-1">
				<p>{label}</p>
				<p className="mt-0.5 truncate text-muted-foreground text-xs">{description}</p>
			</div>
			{selected && <Check className="mt-1 size-4 shrink-0 text-muted-foreground" />}
		</DropdownMenuItem>
	);
}
