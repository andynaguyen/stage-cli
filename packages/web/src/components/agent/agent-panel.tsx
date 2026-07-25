import { AGENT_CAPABILITY_STATUS, AGENT_PROVIDER } from "@stagereview/types/agent";
import {
	AlertCircle,
	Bot,
	Eye,
	FileText,
	LoaderCircle,
	type LucideIcon,
	Plus,
	Shield,
	Workflow,
	X,
} from "lucide-react";
import {
	type CSSProperties,
	type MouseEvent,
	type ReactNode,
	type RefObject,
	useEffect,
} from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAskAgent } from "@/lib/agent-chat-context";
import { RESIZE_HANDLE_SIDE, useResizablePanel } from "@/lib/use-resizable-panel";
import { cn } from "@/lib/utils";
import { AgentComposer, AgentPermissionCards } from "./agent-composer";
import { AgentConversation } from "./agent-message";

const STARTER_PROMPTS: Array<{ prompt: string; icon: LucideIcon }> = [
	{ prompt: "Summarize this review", icon: FileText },
	{ prompt: "Walk me through the key changes", icon: Workflow },
	{ prompt: "What looks risky?", icon: Shield },
	{ prompt: "What should I review first?", icon: Eye },
] as const;

function EmptyState() {
	const { send } = useAskAgent();
	return (
		<div className="flex min-h-full items-center justify-center px-6 py-12">
			<div className="w-full max-w-sm text-center">
				<div className="mx-auto flex size-10 items-center justify-center rounded-xl border bg-muted/40">
					<Bot className="size-5 text-foreground/70" />
				</div>
				<h2 className="mt-4 font-semibold text-base">Ask about this review</h2>
				<p className="mt-1 text-muted-foreground text-sm">
					Your local coding agent can explain changes, trace behavior, and surface review risks.
				</p>
				<div className="mt-6 flex flex-col items-center gap-2">
					{STARTER_PROMPTS.map(({ prompt, icon: Icon }) => (
						<Button
							key={prompt}
							variant="outline"
							size="sm"
							className="h-auto w-fit px-3 py-2 font-normal"
							onClick={() => void send(prompt)}
						>
							<Icon className="size-4 text-muted-foreground" />
							{prompt}
						</Button>
					))}
				</div>
			</div>
		</div>
	);
}

function CapabilityState() {
	const { capability, isCapabilityLoading, refreshCapability } = useAskAgent();
	if (isCapabilityLoading) {
		return (
			<div className="flex min-h-full items-center justify-center gap-2 text-muted-foreground text-sm">
				<LoaderCircle className="size-4 animate-spin" />
				Checking the local agent…
			</div>
		);
	}

	const detail =
		capability?.detail ??
		"The local coding agent is not available. Check its installation and try again.";
	const providerLabel = capability?.label ?? "Local agent";
	return (
		<div className="flex min-h-full items-center justify-center px-6 text-center">
			<div className="max-w-xs">
				<div className="mx-auto flex size-10 items-center justify-center rounded-xl border bg-muted/40">
					<AlertCircle className="size-5 text-muted-foreground" />
				</div>
				<h2 className="mt-4 font-semibold text-base">{providerLabel} needs attention</h2>
				<p className="mt-2 text-muted-foreground text-sm">{detail}</p>
				<div className="mt-4 flex items-center justify-center gap-3">
					{capability?.providerId === AGENT_PROVIDER.CODEX &&
						capability.status === AGENT_CAPABILITY_STATUS.MISSING && (
							<a
								href="https://developers.openai.com/codex/cli"
								target="_blank"
								rel="noreferrer"
								className="inline-flex text-primary text-sm underline-offset-4 hover:underline"
							>
								Install Codex CLI
							</a>
						)}
					<Button variant="outline" size="sm" className="h-8" onClick={refreshCapability}>
						Check again
					</Button>
				</div>
			</div>
		</div>
	);
}

function PanelHeader() {
	const { capability, messages, close, reset } = useAskAgent();
	const title =
		messages.length === 0 || !capability ? "Ask Agent" : `Ask Agent · ${capability.label}`;
	return (
		<header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
			<div className="min-w-0">
				<h2 className="truncate font-medium text-sm">{title}</h2>
			</div>
			<div className="flex items-center gap-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon-sm" aria-label="New chat" onClick={reset}>
							<Plus className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>New chat</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon-sm" aria-label="Close Ask Agent" onClick={close}>
							<X className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Close</TooltipContent>
				</Tooltip>
			</div>
		</header>
	);
}

interface AskAgentPanelProps {
	width: number;
	panelRef: RefObject<HTMLElement | null>;
	resizeHandleProps: {
		onMouseDown: (event: MouseEvent) => void;
		onDoubleClick: () => void;
	};
}

function AskAgentPanel({ width, panelRef, resizeHandleProps }: AskAgentPanelProps) {
	const { isOpen, close, capability, isCapabilityLoading, messages } = useAskAgent();

	useEffect(() => {
		if (!isOpen) return;
		const previousOverflowX = document.documentElement.style.overflowX;
		document.documentElement.style.overflowX = "hidden";
		const handleKeyDown = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Escape") close();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			document.documentElement.style.overflowX = previousOverflowX;
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [close, isOpen]);

	if (!isOpen) return null;

	const isAvailable = capability?.status === AGENT_CAPABILITY_STATUS.AVAILABLE;
	let body: ReactNode;
	if (isCapabilityLoading || !isAvailable) {
		body = <CapabilityState />;
	} else if (messages.length === 0) {
		body = <EmptyState />;
	} else {
		body = <AgentConversation />;
	}

	return (
		<>
			<button
				type="button"
				className="fixed inset-x-0 top-12 bottom-0 z-30 bg-black/20 2xl:hidden"
				aria-label="Close Ask Agent"
				onClick={close}
			/>
			<aside
				ref={panelRef}
				aria-label="Ask Agent"
				style={{ "--agent-panel-width": `${width}px` } as CSSProperties}
				className="fixed top-12 right-0 bottom-0 z-40 flex w-[var(--agent-panel-width)] flex-col overflow-hidden border-l bg-background shadow-2xl shadow-black/10 max-sm:!w-full sm:max-2xl:!w-[420px] 2xl:shadow-none"
			>
				<button
					type="button"
					aria-label="Resize Ask Agent panel"
					className="absolute inset-y-0 left-0 z-10 hidden w-1 -translate-x-1/2 cursor-col-resize hover:bg-primary/30 2xl:block"
					{...resizeHandleProps}
				/>
				<PanelHeader />
				<div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{body}</div>
				{isAvailable && <AgentPermissionCards />}
				<AgentComposer />
			</aside>
		</>
	);
}

export function AskAgentShell({ children }: { children: ReactNode }) {
	const { isOpen } = useAskAgent();
	const { width, panelRef, resizeHandleProps } = useResizablePanel<HTMLElement>({
		minWidth: 360,
		maxWidth: 520,
		defaultWidth: 420,
		handleSide: RESIZE_HANDLE_SIDE.LEFT,
		enabled: isOpen,
	});

	return (
		<div
			style={{ "--agent-panel-width": `${width}px` } as CSSProperties}
			className={cn(
				"min-w-0 transition-[margin] duration-200",
				isOpen && "2xl:mr-[var(--agent-panel-width)]",
			)}
		>
			{children}
			<AskAgentPanel width={width} panelRef={panelRef} resizeHandleProps={resizeHandleProps} />
		</div>
	);
}
