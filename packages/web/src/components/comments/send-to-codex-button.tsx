import { Check, LoaderCircle, Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useCommentThreadsContext } from "@/lib/comment-threads-context";
import { useReviewFeedback } from "@/lib/use-review-feedback";

export function SendToCodexButton({ runId }: { runId: string }) {
	const [isOpen, setIsOpen] = useState(false);
	const { threads, isLoading } = useCommentThreadsContext();
	const submission = useReviewFeedback(runId);
	const unresolvedCount = threads.filter((thread) => thread.resolvedAt === null).length;
	const unresolvedLabel = `${unresolvedCount} unresolved ${unresolvedCount === 1 ? "thread" : "threads"}`;
	const isSubmitted = submission.isSuccess;
	const isDisabled = isLoading || unresolvedCount === 0 || submission.isPending || isSubmitted;

	const handleOpenChange = (open: boolean) => {
		if (submission.isPending) return;
		if (open) submission.reset();
		setIsOpen(open);
	};

	return (
		<Popover open={isOpen} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button type="button" size="sm" className="h-7 px-2" disabled={isDisabled}>
					{isLoading || submission.isPending ? (
						<LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
					) : isSubmitted ? (
						<Check className="size-3.5" aria-hidden="true" />
					) : (
						<Send className="size-3.5" aria-hidden="true" />
					)}
					<span className="text-xs">
						{isLoading
							? "Loading comments…"
							: submission.isPending
								? "Sending…"
								: isSubmitted
									? "Sent — closing Stage"
									: `Send to Codex · ${unresolvedLabel}`}
					</span>
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
					<PopoverDescription>
						Codex will receive every unresolved comment thread in this review.
					</PopoverDescription>
				</PopoverHeader>

				<div className="flex items-center justify-between gap-4 border-y bg-muted/30 px-4 py-3">
					<div>
						<p className="font-medium text-sm">Pending comments</p>
						<p className="mt-1 text-muted-foreground text-xs">Stage closes after they are sent.</p>
					</div>
					<span className="rounded-md bg-secondary px-2 py-1 font-medium text-xs tabular-nums">
						{unresolvedCount}
					</span>
				</div>

				{submission.isError && (
					<p className="px-4 pt-3 text-destructive text-xs" role="alert">
						Couldn't send comments to Codex. Check that Stage is still running and try again.
					</p>
				)}

				<div className="flex items-center justify-end gap-2 p-3">
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
						onClick={() => submission.mutate()}
					>
						{submission.isPending ? (
							<LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
						) : isSubmitted ? (
							<Check className="size-3.5" aria-hidden="true" />
						) : (
							<Send className="size-3.5" aria-hidden="true" />
						)}
						{submission.isPending
							? "Sending…"
							: isSubmitted
								? "Sent — closing Stage"
								: "Send to Codex"}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
