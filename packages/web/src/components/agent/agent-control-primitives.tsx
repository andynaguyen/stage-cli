import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const AGENT_CONTROL_CLASS =
	"inline-flex h-8 items-center gap-2 rounded-lg border bg-background px-2.5 text-xs text-foreground shadow-none outline-none transition-colors hover:border-accent hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function formatAgentModelLabel(label: string): string {
	return label.replace(/^GPT-/i, "").replaceAll("-", " ");
}

interface AgentSettingOptionProps {
	label: string;
	ariaLabel: string;
	selected: boolean;
	onSelect: () => void;
}

export function AgentSettingOption({
	label,
	ariaLabel,
	selected,
	onSelect,
}: AgentSettingOptionProps) {
	return (
		<button
			type="button"
			aria-label={ariaLabel}
			aria-pressed={selected}
			className={cn(
				"flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
				selected && "bg-accent",
			)}
			onClick={onSelect}
		>
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{selected && <Check className="size-4 shrink-0 text-primary" />}
		</button>
	);
}
