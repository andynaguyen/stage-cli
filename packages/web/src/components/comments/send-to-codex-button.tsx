import type { CommentThread } from "@stagereview/types/comments";
import { ChevronRight, LoaderCircle, Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
	Popover,
	PopoverContent,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/components/ui/sonner";
import { useCommentThreadsContext } from "@/lib/comment-threads-context";
import { useReviewFeedback } from "@/lib/use-review-feedback";

export function SendToCodexButton({ runId }: { runId: string }) {
	const [isOpen, setIsOpen] = useState(false);
	const [areCommentsOpen, setAreCommentsOpen] = useState(false);
	const { threads, isLoading } = useCommentThreadsContext();
	const submission = useReviewFeedback(runId);
	const unresolvedThreads = threads.filter((thread) => thread.resolvedAt === null);
	const commentCount = unresolvedThreads.reduce(
		(count, thread) => count + thread.comments.length,
		0,
	);
	const isSubmitted = submission.isSuccess;
	const isDisabled = isLoading || commentCount === 0 || submission.isPending || isSubmitted;

	const handleOpenChange = (open: boolean) => {
		if (submission.isPending) return;
		if (open) {
			submission.reset();
			setAreCommentsOpen(false);
		}
		setIsOpen(open);
	};

	const handleSubmit = () => {
		submission.mutate(undefined, {
			onSuccess: () => {
				setIsOpen(false);
				toast.success("Comments sent to Codex");
			},
		});
	};

	return (
		<Popover open={isOpen} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button type="button" size="sm" className="h-7 px-2" disabled={isDisabled}>
					{isLoading || submission.isPending ? (
						<LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
					) : (
						<Send className="size-3.5" aria-hidden="true" />
					)}
					<span className="text-xs">{isLoading ? "Loading comments…" : "Send to Codex"}</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={8}
				collisionPadding={16}
				className="w-96 max-w-[calc(100vw-2rem)] p-0"
			>
				<PopoverHeader className="gap-2 p-4">
					<PopoverTitle className="flex items-center gap-2">
						<Send className="size-4 text-primary" aria-hidden="true" />
						Send review to Codex
					</PopoverTitle>
				</PopoverHeader>

				<Collapsible
					open={areCommentsOpen}
					onOpenChange={setAreCommentsOpen}
					className="border-y bg-muted/30"
				>
					<CollapsibleTrigger
						aria-label={`${areCommentsOpen ? "Collapse" : "Expand"} comments (${commentCount})`}
						className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
					>
						<span className="flex items-center gap-4">
							<span className="font-medium text-sm">Comments</span>
							<span className="rounded-md bg-secondary px-2 py-1 font-medium text-xs tabular-nums">
								{commentCount}
							</span>
						</span>
						<ChevronRight
							className="size-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-90"
							aria-hidden="true"
						/>
					</CollapsibleTrigger>
					<CollapsibleContent className="border-t">
						<ul className="max-h-64 divide-y overflow-y-auto">
							{unresolvedThreads.map((thread) => (
								<li key={thread.id} className="px-4 py-3">
									<p className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
										<span className="truncate">{thread.filePath}</span>
										<span aria-hidden="true">·</span>
										<span className="shrink-0">{formatLineRange(thread)}</span>
									</p>
									<ul className="mt-2 space-y-2">
										{thread.comments.map((comment) => (
											<li
												key={comment.id}
												className="border-border border-l-2 pl-3 text-sm leading-relaxed"
											>
												<p className="line-clamp-3 whitespace-pre-wrap break-words">
													{comment.body}
												</p>
											</li>
										))}
									</ul>
								</li>
							))}
						</ul>
					</CollapsibleContent>
				</Collapsible>

				{submission.isError && (
					<p className="px-4 pt-3 text-destructive text-xs" role="alert">
						Couldn't send comments to Codex. Check that Stage is still running and try again.
					</p>
				)}

				<div className="flex items-center justify-between gap-2 p-3">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={submission.isPending || isSubmitted}
						onClick={() => setIsOpen(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						size="sm"
						disabled={submission.isPending || isSubmitted}
						onClick={handleSubmit}
					>
						{submission.isPending ? (
							<LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
						) : (
							<Send className="size-3.5" aria-hidden="true" />
						)}
						Send to Codex
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

function formatLineRange(thread: CommentThread): string {
	if (thread.startLine === thread.endLine) return `Line ${thread.startLine}`;
	return `Lines ${thread.startLine}–${thread.endLine}`;
}
