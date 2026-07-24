import { Check, LoaderCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useCommentThreadsContext } from "@/lib/comment-threads-context";
import { useReviewFeedback } from "@/lib/use-review-feedback";

const SUBMIT_ERROR_TOAST_ID = "review-feedback-submit-error";

export function SendToCodexButton({ runId }: { runId: string }) {
	const { threads, isLoading } = useCommentThreadsContext();
	const submission = useReviewFeedback(runId);
	const unresolvedCount = threads.filter((thread) => thread.resolvedAt === null).length;
	const unresolvedLabel = `${unresolvedCount} unresolved ${unresolvedCount === 1 ? "thread" : "threads"}`;
	const isSubmitted = submission.isSuccess;
	const isDisabled = isLoading || unresolvedCount === 0 || submission.isPending || isSubmitted;

	const submit = async () => {
		toast.dismiss(SUBMIT_ERROR_TOAST_ID);
		try {
			await submission.mutateAsync();
		} catch (error) {
			toast.error("Couldn't send comments to Codex", {
				id: SUBMIT_ERROR_TOAST_ID,
				description: error instanceof Error ? error.message : undefined,
			});
		}
	};

	return (
		<Button
			type="button"
			size="sm"
			className="h-7 px-2"
			disabled={isDisabled}
			onClick={() => void submit()}
		>
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
	);
}
