import type { AgentModel } from "@stagereview/types/agent";
import { Bot, Check, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AGENT_CONTROL_CLASS } from "./agent-control-primitives";

interface AgentModelPickerProps {
	providerLabel: string;
	models: AgentModel[];
	selectedModel: AgentModel;
	onModelChange: (modelId: string) => void;
}

export function AgentModelPicker({
	providerLabel,
	models,
	selectedModel,
	onModelChange,
}: AgentModelPickerProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const searchInputRef = useRef<HTMLInputElement>(null);
	const filteredModels = useMemo(() => {
		const normalized = query.trim().toLocaleLowerCase();
		if (normalized.length === 0) return models;
		return models.filter((model) =>
			[model.label, model.id, model.description].some((value) =>
				value.toLocaleLowerCase().includes(normalized),
			),
		);
	}, [models, query]);

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) setQuery("");
	};

	return (
		<Popover modal={false} open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label="Choose agent model"
					className={cn(AGENT_CONTROL_CLASS, "max-w-44")}
				>
					<Bot className="size-3.5 shrink-0 text-muted-foreground" />
					<span className="truncate">{selectedModel.label}</span>
				</button>
			</PopoverTrigger>
			<PopoverContent
				side="top"
				align="end"
				sideOffset={8}
				collisionPadding={16}
				className="w-[min(32rem,calc(100vw-2rem))] overflow-hidden rounded-xl p-0 shadow-xl"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					searchInputRef.current?.focus();
				}}
			>
				<div className="flex h-12 items-center gap-3 border-b px-4">
					<Search className="size-4 shrink-0 text-muted-foreground" />
					<input
						ref={searchInputRef}
						value={query}
						aria-label="Search models"
						placeholder="Search models…"
						className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
						onChange={(event) => setQuery(event.target.value)}
					/>
					<button
						type="button"
						aria-label={query ? "Clear model search" : "Close model picker"}
						className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
						onClick={() => {
							if (query) setQuery("");
							else setOpen(false);
						}}
					>
						<X className="size-4" />
					</button>
				</div>
				<div className="scrollbar-thin max-h-80 overflow-y-auto p-2">
					<p className="px-2 py-2 font-medium text-muted-foreground text-xs">{providerLabel}</p>
					<fieldset className="space-y-1">
						<legend className="sr-only">{providerLabel} models</legend>
						{filteredModels.map((model) => {
							const selected = model.id === selectedModel.id;
							return (
								<button
									key={model.id}
									type="button"
									aria-label={`Use ${model.label}`}
									aria-pressed={selected}
									className={cn(
										"flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
										selected && "bg-accent",
									)}
									onClick={() => {
										onModelChange(model.id);
										setOpen(false);
									}}
								>
									<Bot className="size-4 shrink-0 text-muted-foreground" />
									<span className="min-w-0 flex-1 truncate">{model.label}</span>
									{selected && <Check className="size-4 shrink-0 text-muted-foreground" />}
								</button>
							);
						})}
					</fieldset>
					{filteredModels.length === 0 && (
						<p className="px-3 py-8 text-center text-muted-foreground text-sm">
							No matching models
						</p>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
