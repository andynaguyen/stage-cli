import type { AgentSelection } from "@stagereview/types/agent";
import { useNavigate } from "@tanstack/react-router";
import {
	AlertCircle,
	Bot,
	Check,
	FileCode2,
	LoaderCircle,
	ShieldAlert,
	Terminal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Markdown } from "@/components/ui/markdown";
import { useAskAgentConversation, useAskAgentPanel } from "@/lib/agent-chat-context";
import {
	AGENT_ACTIVITY_PHASE,
	AGENT_MESSAGE_STATUS,
	type AgentChatActivity,
	type AgentChatMessage,
} from "@/lib/agent-chat-message";
import { resolveChangedFileLink } from "@/lib/agent-file-navigation";
import { useFileDiffEntries } from "@/lib/parse-diff";
import { useDiffPatch } from "@/lib/use-diff-patch";

export function AgentSelectionLabel({ selection }: { selection: AgentSelection }) {
	const side = selection.side === "additions" ? "new" : "old";
	const lines =
		selection.startLine === selection.endLine
			? `line ${selection.startLine}`
			: `lines ${selection.startLine}–${selection.endLine}`;
	return (
		<span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
			<FileCode2 className="size-3 shrink-0" />
			<span className="truncate">{selection.filePath}</span>
			<span className="shrink-0">
				{lines} · {side}
			</span>
		</span>
	);
}

function ActivityRow({ activity }: { activity: AgentChatActivity }) {
	const failed =
		activity.phase === AGENT_ACTIVITY_PHASE.COMPLETED &&
		activity.exitCode !== null &&
		activity.exitCode !== 0;
	return (
		<div className="flex items-start gap-2 text-muted-foreground text-xs">
			{activity.phase === AGENT_ACTIVITY_PHASE.STARTED ? (
				<LoaderCircle className="mt-0.5 size-3 animate-spin" />
			) : failed ? (
				<AlertCircle className="mt-0.5 size-3 text-destructive" />
			) : (
				<Check className="mt-0.5 size-3 text-primary" />
			)}
			<div className="min-w-0">
				<p className="truncate">{activity.label}</p>
				{activity.detail && <p className="mt-0.5 break-words opacity-75">{activity.detail}</p>}
			</div>
		</div>
	);
}

interface AgentAnswerProps {
	content: string;
	filePaths: readonly string[];
	onSelectFile: (filePath: string) => void;
}

export function AgentAnswer({ content, filePaths, onSelectFile }: AgentAnswerProps) {
	const handleLinkClick = (href: string) => {
		const filePath = resolveChangedFileLink(href, filePaths);
		if (filePath === null) return false;
		onSelectFile(filePath);
		return true;
	};

	return (
		<Markdown content={content} className="text-foreground/90" onLinkClick={handleLinkClick} />
	);
}

interface AssistantMessageProps {
	message: AgentChatMessage;
	filePaths: readonly string[];
	onSelectFile: (filePath: string) => void;
}

function AssistantMessage({ message, filePaths, onSelectFile }: AssistantMessageProps) {
	const isThinking =
		message.status === AGENT_MESSAGE_STATUS.STREAMING && message.content.length === 0;
	return (
		<div className="flex items-start gap-3">
			<div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/50">
				<Bot className="size-3.5 text-foreground/70" />
			</div>
			<div className="min-w-0 flex-1">
				{message.content.length > 0 && (
					<AgentAnswer
						content={message.content}
						filePaths={filePaths}
						onSelectFile={onSelectFile}
					/>
				)}
				{isThinking && (
					<div className="flex items-center gap-2 py-1 text-muted-foreground text-sm">
						<LoaderCircle className="size-3.5 animate-spin" />
						Reading the review…
					</div>
				)}
				{message.activities.length > 0 && (
					<details className="group mt-3 rounded-md border bg-muted/20 px-3 py-2">
						<summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-foreground/70 text-xs">
							<Terminal className="size-3" />
							{message.activities.length} {message.activities.length === 1 ? "command" : "commands"}
						</summary>
						<div className="mt-2 space-y-1.5 border-t pt-2">
							{message.activities.map((activity) => (
								<ActivityRow key={activity.id} activity={activity} />
							))}
						</div>
					</details>
				)}
				{message.notices.map((notice) => (
					<div
						key={notice}
						className="mt-2 flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs"
					>
						<ShieldAlert className="mt-0.5 size-3 shrink-0 text-amber-600 dark:text-amber-400" />
						<span>{notice}</span>
					</div>
				))}
				{message.status === AGENT_MESSAGE_STATUS.STOPPED && (
					<p className="mt-2 text-muted-foreground text-xs">Stopped</p>
				)}
			</div>
		</div>
	);
}

function UserMessage({ message }: { message: AgentChatMessage }) {
	return (
		<div className="ml-10 rounded-lg bg-primary/10 px-3 py-2.5">
			<p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
			{message.selection && (
				<div className="mt-2 border-primary/15 border-t pt-2">
					<AgentSelectionLabel selection={message.selection} />
				</div>
			)}
		</div>
	);
}

export function AgentConversation() {
	const { messages, runId } = useAskAgentConversation();
	const { close } = useAskAgentPanel();
	const navigate = useNavigate();
	const { data: diffData } = useDiffPatch(runId);
	const fileEntries = useFileDiffEntries(diffData?.patch, diffData?.fileContents);
	const filePaths = useMemo(() => fileEntries.map((entry) => entry.file.path), [fileEntries]);
	const handleSelectFile = useCallback(
		(filePath: string) => {
			close();
			void navigate({
				to: "/runs/$runId/files",
				params: { runId },
				search: { file: filePath },
			});
		},
		[close, navigate, runId],
	);
	const endRef = useRef<HTMLDivElement>(null);
	const lastMessage = messages.at(-1);

	useEffect(() => {
		if (lastMessage) endRef.current?.scrollIntoView({ block: "end" });
	}, [lastMessage]);

	return (
		<div className="space-y-6 px-4 py-5">
			{messages.map((message) =>
				message.role === "user" ? (
					<UserMessage key={message.id} message={message} />
				) : (
					<AssistantMessage
						key={message.id}
						message={message}
						filePaths={filePaths}
						onSelectFile={handleSelectFile}
					/>
				),
			)}
			<div ref={endRef} />
		</div>
	);
}
