import type { AgentModel } from "@stagereview/types/agent";
import { Bot, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
	AGENT_CONTROL_CLASS,
	AgentSettingOption,
	formatAgentModelLabel,
} from "./agent-control-primitives";
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

const AGENT_SETTINGS_VIEW = {
	ROOT: "root",
	MODEL: "model",
	EFFORT: "effort",
	SPEED: "speed",
} as const;
type AgentSettingsView = (typeof AGENT_SETTINGS_VIEW)[keyof typeof AGENT_SETTINGS_VIEW];

function settingsViewTitle(view: AgentSettingsView): string {
	switch (view) {
		case AGENT_SETTINGS_VIEW.MODEL:
			return "Model";
		case AGENT_SETTINGS_VIEW.EFFORT:
			return "Effort";
		case AGENT_SETTINGS_VIEW.SPEED:
			return "Speed";
		case AGENT_SETTINGS_VIEW.ROOT:
			return "Agent settings";
	}
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
	const [open, setOpen] = useState(false);
	const [view, setView] = useState<AgentSettingsView>(AGENT_SETTINGS_VIEW.ROOT);

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

	const selectedEffortId = reasoningEffort ?? selectedModel.defaultReasoningEffort;
	const selectedEffortLabel =
		selectedModel.reasoningEfforts.find((effort) => effort.id === selectedEffortId)?.label ?? null;
	const selectedServiceTierId = serviceTier ?? selectedModel.defaultServiceTier;
	const selectedServiceTierLabel =
		selectedModel.serviceTiers.find((tier) => tier.id === selectedServiceTierId)?.label ??
		"Standard";
	const modelLabel = formatAgentModelLabel(selectedModel.label);

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) setView(AGENT_SETTINGS_VIEW.ROOT);
	};

	return (
		<div className="flex min-w-0 flex-1 items-center">
			<Popover modal={false} open={open} onOpenChange={handleOpenChange}>
				<PopoverTrigger asChild>
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
				</PopoverTrigger>
				<PopoverContent
					side="top"
					align="start"
					sideOffset={8}
					collisionPadding={16}
					className="w-64 rounded-xl p-1.5 shadow-xl"
				>
					{view === AGENT_SETTINGS_VIEW.ROOT ? (
						<div>
							<SettingsRootRow
								label="Model"
								value={modelLabel}
								ariaLabel="Choose agent model"
								onSelect={() => setView(AGENT_SETTINGS_VIEW.MODEL)}
							/>
							{selectedModel.reasoningEfforts.length > 0 && selectedEffortLabel && (
								<SettingsRootRow
									label="Effort"
									value={selectedEffortLabel}
									ariaLabel="Choose reasoning effort"
									onSelect={() => setView(AGENT_SETTINGS_VIEW.EFFORT)}
								/>
							)}
							{selectedModel.serviceTiers.length > 0 && (
								<SettingsRootRow
									label="Speed"
									value={selectedServiceTierLabel}
									ariaLabel="Choose agent speed"
									onSelect={() => setView(AGENT_SETTINGS_VIEW.SPEED)}
								/>
							)}
						</div>
					) : (
						<div>
							<button
								type="button"
								aria-label="Back to agent settings"
								className="mb-1 flex h-9 w-full items-center gap-2 border-b px-2 font-medium text-sm text-foreground outline-none hover:text-primary focus-visible:text-primary"
								onClick={() => setView(AGENT_SETTINGS_VIEW.ROOT)}
							>
								<ChevronLeft className="size-4 text-muted-foreground" />
								{settingsViewTitle(view)}
							</button>
							{view === AGENT_SETTINGS_VIEW.MODEL && (
								<AgentModelPicker
									models={models}
									selectedModel={selectedModel}
									onModelChange={onModelChange}
								/>
							)}
							{view === AGENT_SETTINGS_VIEW.EFFORT && (
								<AgentReasoningPicker
									selectedModel={selectedModel}
									reasoningEffort={reasoningEffort}
									onReasoningEffortChange={onReasoningEffortChange}
								/>
							)}
							{view === AGENT_SETTINGS_VIEW.SPEED && (
								<SpeedOptions
									selectedModel={selectedModel}
									selectedServiceTierId={selectedServiceTierId}
									onServiceTierChange={onServiceTierChange}
								/>
							)}
						</div>
					)}
				</PopoverContent>
			</Popover>
		</div>
	);
}

interface SettingsRootRowProps {
	label: string;
	value: string;
	ariaLabel: string;
	onSelect: () => void;
}

function SettingsRootRow({ label, value, ariaLabel, onSelect }: SettingsRootRowProps) {
	return (
		<button
			type="button"
			aria-label={ariaLabel}
			className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
			onClick={onSelect}
		>
			<span className="flex-1 text-left">{label}</span>
			<span className="max-w-28 truncate text-muted-foreground">{value}</span>
			<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
		</button>
	);
}

interface SpeedOptionsProps {
	selectedModel: AgentModel;
	selectedServiceTierId: string | null;
	onServiceTierChange: (tier: string | null) => void;
}

function SpeedOptions({
	selectedModel,
	selectedServiceTierId,
	onServiceTierChange,
}: SpeedOptionsProps) {
	return (
		<div>
			<AgentSettingOption
				label="Standard"
				ariaLabel="Use standard speed"
				selected={selectedServiceTierId === null}
				onSelect={() => onServiceTierChange(null)}
			/>
			{selectedModel.serviceTiers.map((tier) => (
				<AgentSettingOption
					key={tier.id}
					label={tier.label}
					ariaLabel={`Use ${tier.label.toLocaleLowerCase()} speed`}
					selected={selectedServiceTierId === tier.id}
					onSelect={() =>
						onServiceTierChange(tier.id === selectedModel.defaultServiceTier ? null : tier.id)
					}
				/>
			))}
		</div>
	);
}
