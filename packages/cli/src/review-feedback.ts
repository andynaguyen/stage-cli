import type { CommentThread } from "@stagereview/types/comments";

const SUBMISSION_STATE = {
	PENDING: "pending",
	SUBMITTING: "submitting",
	SUBMITTED: "submitted",
} as const;

type SubmissionState = (typeof SUBMISSION_STATE)[keyof typeof SUBMISSION_STATE];

export const STAGE_REVIEW_FEEDBACK_HEADER = "# Stage Review Feedback";

const REVIEW_INSTRUCTIONS =
	"Address each comment above. Inspect the referenced code before changing it,\n" +
	"and explain any comment you believe should not be applied.";

export class ReviewFeedbackConflictError extends Error {
	constructor() {
		super("Review feedback has already been submitted");
		this.name = "ReviewFeedbackConflictError";
	}
}

export class ReviewFeedbackSession {
	readonly feedback: Promise<string>;

	private state: SubmissionState = SUBMISSION_STATE.PENDING;
	private readonly resolveFeedback: (feedback: string) => void;

	constructor() {
		let resolveFeedback: ((feedback: string) => void) | undefined;
		this.feedback = new Promise<string>((resolve) => {
			resolveFeedback = resolve;
		});
		if (resolveFeedback === undefined) {
			throw new Error("Failed to initialize review feedback session");
		}
		this.resolveFeedback = resolveFeedback;
	}

	async submit(feedback: string, acknowledge: () => Promise<void>): Promise<void> {
		if (this.state !== SUBMISSION_STATE.PENDING) {
			throw new ReviewFeedbackConflictError();
		}

		this.state = SUBMISSION_STATE.SUBMITTING;
		try {
			await acknowledge();
		} catch (error) {
			this.state = SUBMISSION_STATE.PENDING;
			throw error;
		}

		this.state = SUBMISSION_STATE.SUBMITTED;
		this.resolveFeedback(feedback);
	}
}

export function formatReviewFeedback(threads: readonly CommentThread[]): string {
	const unresolved = threads.filter((thread) => thread.resolvedAt === null);
	if (unresolved.length === 0) {
		throw new Error("Cannot format empty Stage review feedback");
	}

	const sections = [...unresolved].sort(compareThreads).map(formatThread);
	return `${STAGE_REVIEW_FEEDBACK_HEADER}\n\n${sections.join("\n\n")}\n\n${REVIEW_INSTRUCTIONS}\n`;
}

function compareThreads(left: CommentThread, right: CommentThread): number {
	return (
		compareText(left.filePath, right.filePath) ||
		compareText(left.side, right.side) ||
		left.startLine - right.startLine ||
		left.endLine - right.endLine ||
		compareText(left.createdAt, right.createdAt) ||
		compareText(left.id, right.id)
	);
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function formatThread(thread: CommentThread): string {
	if (thread.comments.length === 0) {
		throw new Error(`Comment thread ${thread.id} has no comments`);
	}

	const range =
		thread.startLine === thread.endLine
			? `line ${thread.startLine}`
			: `lines ${thread.startLine}–${thread.endLine}`;
	const comments = [...thread.comments]
		.sort(
			(left, right) =>
				compareText(left.createdAt, right.createdAt) || compareText(left.id, right.id),
		)
		.map((comment) => comment.body);

	return [`## \`${thread.filePath}\` — ${thread.side}, ${range}`, ...comments].join("\n\n");
}
