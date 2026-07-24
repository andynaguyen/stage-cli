import { Check, LoaderCircle, X } from "lucide-react";
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
import { useReviewExit } from "@/lib/use-review-exit";

export function CloseStageButton() {
	const [isOpen, setIsOpen] = useState(false);
	const { threads, isLoading } = useCommentThreadsContext();
	const exit = useReviewExit();
	const unresolvedCount = threads.filter((thread) => thread.resolvedAt === null).length;
	const isClosed = exit.isSuccess;

	const handleOpenChange = (open: boolean) => {
		if (exit.isPending) return;
		if (open) exit.reset();
		setIsOpen(open);
	};

	return (
		<Popover open={isOpen} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-muted-foreground"
					disabled={isLoading || exit.isPending || isClosed}
				>
					{isLoading || exit.isPending ? (
						<LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
					) : isClosed ? (
						<Check className="size-3.5" aria-hidden="true" />
					) : (
						<X className="size-3.5" aria-hidden="true" />
					)}
					<span className="text-xs">
						{isLoading
							? "Loading…"
							: exit.isPending
								? "Closing…"
								: isClosed
									? "Stage closed"
									: "Close"}
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
						<X className="size-4 text-muted-foreground" aria-hidden="true" />
						Close Stage?
					</PopoverTitle>
					<PopoverDescription>
						Return to Codex without submitting review feedback.
					</PopoverDescription>
				</PopoverHeader>

				{unresolvedCount > 0 && (
					<div className="flex items-center justify-between gap-4 border-t bg-muted/30 px-4 py-3">
						<div>
							<p className="font-medium text-sm">Unsent comments</p>
							<p className="mt-1 text-muted-foreground text-xs">
								They remain available when this diff is reopened.
							</p>
						</div>
						<span className="rounded-md bg-secondary px-2 py-1 font-medium text-xs tabular-nums">
							{unresolvedCount}
						</span>
					</div>
				)}

				{exit.isError && (
					<p className="px-4 pt-3 text-destructive text-xs" role="alert">
						Couldn't close Stage. Check that the review is still running and try again.
					</p>
				)}

				<div className="flex items-center justify-end gap-2 border-t p-3">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={exit.isPending || isClosed}
						onClick={() => setIsOpen(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={exit.isPending || isClosed}
						onClick={() => exit.mutate()}
					>
						{exit.isPending ? (
							<LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
						) : isClosed ? (
							<Check className="size-3.5" aria-hidden="true" />
						) : (
							<X className="size-3.5" aria-hidden="true" />
						)}
						{exit.isPending ? "Closing…" : isClosed ? "Stage closed" : "Close Stage"}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
