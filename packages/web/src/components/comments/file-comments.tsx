import { COMMENT_ANCHOR, type FileCommentThread } from "@stagereview/types/comments";
import { useState } from "react";
import { useCommentThreadsContext } from "@/lib/comment-threads-context";
import { CommentForm } from "./comment-form";
import { CommentThreadView } from "./comment-thread";

interface FileCommentsProps {
	filePath: string;
	threads: readonly FileCommentThread[];
	isComposing: boolean;
	onCancel: () => void;
	onCreated: () => void;
}

export function FileComments({
	filePath,
	threads,
	isComposing,
	onCancel,
	onCreated,
}: FileCommentsProps) {
	const { createThread } = useCommentThreadsContext();
	const [error, setError] = useState<string | null>(null);

	if (threads.length === 0 && !isComposing) return null;

	async function handleSubmit(body: string) {
		setError(null);
		try {
			await createThread({
				anchor: COMMENT_ANCHOR.FILE,
				filePath,
				body,
			});
			onCreated();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Failed to add comment");
			throw cause;
		}
	}

	function handleCancel() {
		setError(null);
		onCancel();
	}

	return (
		<div className="space-y-2 border-border border-x bg-background px-3 py-2">
			{threads.map((thread) => (
				<div
					key={thread.id}
					id={`comment-thread-${thread.id}`}
					tabIndex={-1}
					className="rounded-xl outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background"
				>
					<CommentThreadView thread={thread} />
				</div>
			))}
			{isComposing && (
				<CommentForm
					label="Comment"
					placeholder="Leave a comment on this file…"
					error={error}
					onSubmit={handleSubmit}
					onCancel={handleCancel}
				/>
			)}
		</div>
	);
}
