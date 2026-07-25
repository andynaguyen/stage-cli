import { AGENT_SERVICE_TIER_KIND, type AgentModel } from "@stagereview/types/agent";
import { Gauge, LockKeyhole } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const REASONING_SELECTION = {
	AUTO: "__auto__",
} as const;

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
			<div className="flex min-w-0 flex-1 items-center gap-1.5 text-muted-foreground text-[11px]">
				<span className="rounded-md border bg-muted/30 px-2 py-1">{providerLabel}</span>
				<ReadOnlyLabel />
			</div>
		);
	}

	const fastTier =
		selectedModel.serviceTiers.find((tier) => tier.kind === AGENT_SERVICE_TIER_KIND.FAST) ?? null;
	const defaultEffort = selectedModel.reasoningEfforts.find(
		(effort) => effort.id === selectedModel.defaultReasoningEffort,
	);

	return (
		<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
			<Select value={selectedModel.id} onValueChange={onModelChange}>
				<SelectTrigger
					size="sm"
					aria-label="Agent model"
					className="h-7 max-w-40 gap-1 border bg-muted/30 px-2 text-[11px] shadow-none"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent align="start" position="popper" className="w-72">
					{models.map((model) => (
						<SelectItem key={model.id} value={model.id} description={model.description}>
							{model.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{selectedModel.reasoningEfforts.length > 0 && (
				<Select
					value={reasoningEffort ?? REASONING_SELECTION.AUTO}
					onValueChange={(value) =>
						onReasoningEffortChange(value === REASONING_SELECTION.AUTO ? null : value)
					}
				>
					<SelectTrigger
						size="sm"
						aria-label="Reasoning effort"
						className="h-7 max-w-28 gap-1 border bg-muted/30 px-2 text-[11px] shadow-none"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent align="start" position="popper" className="w-64">
						<SelectItem
							value={REASONING_SELECTION.AUTO}
							description={`Use the model default${defaultEffort ? ` (${defaultEffort.label})` : ""}`}
						>
							Auto
						</SelectItem>
						{selectedModel.reasoningEfforts.map((effort) => (
							<SelectItem key={effort.id} value={effort.id} description={effort.description}>
								{effort.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}

			{fastTier && (
				<Tooltip>
					<TooltipTrigger asChild>
						<div className="flex h-7 items-center gap-1.5 rounded-md border bg-muted/30 px-2 text-foreground text-[11px]">
							<Gauge className="size-3 text-muted-foreground" />
							Fast
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

			<ReadOnlyLabel />
		</div>
	);
}

function ReadOnlyLabel() {
	return (
		<span className="inline-flex h-7 items-center gap-1 rounded-md border bg-muted/30 px-2 text-muted-foreground text-[11px]">
			<LockKeyhole className="size-3" />
			Read only
		</span>
	);
}
