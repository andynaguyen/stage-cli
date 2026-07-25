import { AGENT_SERVICE_TIER_KIND, type AgentModel } from "@stagereview/types/agent";
import { Bot, Gauge } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AGENT_CONTROL_CLASS } from "./agent-control-primitives";
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

	return (
		<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
			<AgentModelPicker
				providerLabel={providerLabel}
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
				<Tooltip>
					<TooltipTrigger asChild>
						<div className={cn(AGENT_CONTROL_CLASS, "hover:bg-background")}>
							<Gauge className="size-3.5 text-muted-foreground" />
							<span>Fast</span>
							<Switch
								size="sm"
								aria-label="Fast service tier"
								checked={serviceTier === fastTier.id}
								onCheckedChange={(checked) => onServiceTierChange(checked ? fastTier.id : null)}
							/>
						</div>
					</TooltipTrigger>
					<TooltipContent>{fastTier.description}</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
}
