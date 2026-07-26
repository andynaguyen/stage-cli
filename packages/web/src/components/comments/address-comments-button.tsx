import { COMMENT_ANCHOR, type CommentThread } from "@stagereview/types/comments";
import { ArrowRight, LoaderCircle, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverHeader, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/sonner";
import { useCommentThreadsContext } from "@/lib/comment-threads-context";
import { formatLineRange } from "@/lib/format";
import { useReviewFeedback } from "@/lib/use-review-feedback";

interface AddressCommentsButtonProps {
	onSelectThread: (threadId: string) => void;
}

function formatCommentAnchor(thread: CommentThread): string {
	return thread.anchor === COMMENT_ANCHOR.FILE ? "File comment" : formatLineRange(thread);
}

export function AddressCommentsButton({ onSelectThread }: AddressCommentsButtonProps) {
	const [isOpen, setIsOpen] = useState(false);
	const { threads, isLoading } = useCommentThreadsContext();
	const submission = useReviewFeedback();
	const unresolvedThreads = threads.filter((thread) => thread.resolvedAt === null);
	const commentCount = unresolvedThreads.reduce(
		(count, thread) => count + thread.comments.length,
		0,
	);
	const isSubmitted = submission.isSuccess;
	const isDisabled = isLoading || commentCount === 0 || submission.isPending || isSubmitted;

	const handleOpenChange = (open: boolean) => {
		if (submission.isPending) return;
		setIsOpen(open);
		if (!open) return;
		submission.reset();
	};

	const handleSubmit = () => {
		submission.mutate(undefined, {
			onSuccess: () => {
				setIsOpen(false);
				toast.success("Comments ready to address");
			},
		});
	};

	const handleSelectThread = (threadId: string) => {
		setIsOpen(false);
		onSelectThread(threadId);
	};

	return (
		<Popover open={isOpen} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button type="button" size="sm" className="h-7 px-2" disabled={isDisabled}>
					{isLoading || submission.isPending ? (
						<LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
					) : (
						<Sparkles className="size-3.5" aria-hidden="true" />
					)}
					<span className="text-xs">{isLoading ? "Loading comments…" : "Address comments"}</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={8}
				collisionPadding={16}
				className="w-96 max-w-[calc(100vw-2rem)] p-0"
			>
				<PopoverHeader className="flex-row items-center gap-4 p-4">
					<span className="font-medium">Comments</span>
					<span className="rounded-md bg-secondary px-2 py-1 font-medium text-xs tabular-nums">
						{commentCount}
					</span>
				</PopoverHeader>

				<ul className="scrollbar-thin max-h-64 divide-y overflow-y-auto border-y bg-muted/30">
					{unresolvedThreads.map((thread) => (
						<li key={thread.id}>
							<button
								type="button"
								className="group w-full cursor-pointer px-4 py-3 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
								onClick={() => handleSelectThread(thread.id)}
								aria-label={`Go to ${thread.filePath}, ${formatCommentAnchor(thread)}`}
							>
								<span className="flex items-center justify-between gap-3">
									<span className="truncate text-muted-foreground text-xs">{thread.filePath}</span>
									<ArrowRight
										className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5"
										aria-hidden="true"
									/>
								</span>
								<span className="mt-2 block space-y-2">
									{thread.comments.map((comment) => (
										<span
											key={comment.id}
											className="block border-border border-l-2 pl-3 text-sm leading-relaxed"
										>
											<span className="mb-1 block font-medium text-muted-foreground text-xs">
												{formatCommentAnchor(thread)}
											</span>
											<span className="line-clamp-3 whitespace-pre-wrap break-words">
												{comment.body}
											</span>
										</span>
									))}
								</span>
							</button>
						</li>
					))}
				</ul>

				{submission.isError && (
					<p className="px-4 pt-3 text-destructive text-xs" role="alert">
						Couldn't submit comments. Check that Stage is still running and try again.
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
						Submit
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
