import { AGENT_CAPABILITY_STATUS, AGENT_PERMISSION_DECISION } from "@stagereview/types/agent";
import { ArrowUp, ShieldAlert, Square, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAskAgent } from "@/lib/agent-chat-context";
import { cn } from "@/lib/utils";
import { AgentSelectionLabel } from "./agent-message";

export function AgentPermissionCards() {
	const { pendingPermissions, respondToPermission } = useAskAgent();
	if (pendingPermissions.length === 0) return null;

	return (
		<div className="space-y-2 border-t bg-background px-3 pt-3">
			{pendingPermissions.map((permission) => (
				<div
					key={permission.requestId}
					className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
				>
					<div className="flex items-start gap-2">
						<ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
						<div>
							<p className="font-medium text-sm">{permission.title}</p>
							{permission.description && (
								<p className="mt-1 text-muted-foreground text-xs">{permission.description}</p>
							)}
						</div>
					</div>
					<div className="mt-3 flex justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 text-xs"
							onClick={() =>
								void respondToPermission(
									permission.requestId,
									AGENT_PERMISSION_DECISION.DENY,
								).catch(() => undefined)
							}
						>
							Deny
						</Button>
						<Button
							size="sm"
							className="h-7 text-xs"
							onClick={() =>
								void respondToPermission(
									permission.requestId,
									AGENT_PERMISSION_DECISION.ALLOW,
								).catch(() => undefined)
							}
						>
							Allow once
						</Button>
					</div>
				</div>
			))}
		</div>
	);
}

export function AgentComposer() {
	const {
		capability,
		isCapabilityLoading,
		pendingSelection,
		clearSelection,
		isStreaming,
		focusRequest,
		send,
		stop,
	} = useAskAgent();
	const [question, setQuestion] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const isAvailable = capability?.status === AGENT_CAPABILITY_STATUS.AVAILABLE;
	const providerLabel = capability?.label ?? "Agent";
	const canSend = isAvailable && question.trim().length > 0 && !isStreaming;

	useEffect(() => {
		if (focusRequest > 0) textareaRef.current?.focus();
	}, [focusRequest]);

	const submit = () => {
		if (!canSend) return;
		const submittedQuestion = question;
		setQuestion("");
		void send(submittedQuestion);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
		event.preventDefault();
		submit();
	};

	return (
		<div className="border-t bg-background p-3">
			<div
				className={cn(
					"rounded-xl border bg-card shadow-sm transition-colors focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10",
					!isAvailable && "bg-muted/30",
				)}
			>
				{pendingSelection && (
					<div className="flex items-center gap-2 border-b px-3 py-2">
						<div className="min-w-0 flex-1">
							<AgentSelectionLabel selection={pendingSelection} />
						</div>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Remove selected code"
							onClick={clearSelection}
						>
							<X className="size-3" />
						</Button>
					</div>
				)}
				<TextareaAutosize
					ref={textareaRef}
					value={question}
					minRows={2}
					maxRows={8}
					disabled={!isAvailable || isStreaming}
					placeholder={
						isCapabilityLoading
							? "Checking the local agent…"
							: isAvailable
								? "Ask about this review…"
								: "The local agent is unavailable"
					}
					className="block w-full resize-none bg-transparent px-3 pt-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
					onChange={(event) => setQuestion(event.target.value)}
					onKeyDown={handleKeyDown}
				/>
				<div className="flex items-center justify-between gap-2 px-2.5 py-2">
					<div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
						<span className="rounded-md border bg-muted/30 px-2 py-1">{providerLabel}</span>
						<span className="rounded-md border bg-muted/30 px-2 py-1">Read only</span>
					</div>
					{isStreaming ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size="icon-sm"
									variant="secondary"
									aria-label="Stop response"
									onClick={stop}
								>
									<Square className="size-3 fill-current" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Stop response</TooltipContent>
						</Tooltip>
					) : (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size="icon-sm"
									aria-label="Send question"
									disabled={!canSend}
									onClick={submit}
								>
									<ArrowUp className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Send with ⌘ Enter</TooltipContent>
						</Tooltip>
					)}
				</div>
			</div>
		</div>
	);
}
