import type { Comment, CommentThread } from "@stagereview/types/comments";
import {
	REVIEW_ANNOTATION_SIDE,
	REVIEW_ANNOTATION_TYPE,
	type ReviewFeedbackAnnotation,
	type ReviewFeedbackExport,
} from "@stagereview/types/review-feedback";
import { DIFF_SIDE, SCOPE_KIND, type Scope, WORKING_TREE_REF } from "./schema.js";

const COMPLETION_STATE = {
	PENDING: "pending",
	COMPLETING: "completing",
	COMPLETED: "completed",
} as const;

type CompletionState = (typeof COMPLETION_STATE)[keyof typeof COMPLETION_STATE];

export const CODE_REVIEW_FEEDBACK_HEADER = "# Code Review Feedback";

export class ReviewSessionConflictError extends Error {
	constructor() {
		super("Review session has already completed");
		this.name = "ReviewSessionConflictError";
	}
}

export class ReviewFeedbackSession {
	readonly result: Promise<ReviewFeedbackExport>;
	readonly gitRef: string;

	private state: CompletionState = COMPLETION_STATE.PENDING;
	private readonly resolveResult: (result: ReviewFeedbackExport) => void;

	constructor(gitRef: string) {
		this.gitRef = gitRef;
		let resolveResult: ((result: ReviewFeedbackExport) => void) | undefined;
		this.result = new Promise<ReviewFeedbackExport>((resolve) => {
			resolveResult = resolve;
		});
		if (resolveResult === undefined) {
			throw new Error("Failed to initialize review feedback session");
		}
		this.resolveResult = resolveResult;
	}

	async complete(result: ReviewFeedbackExport, acknowledge: () => Promise<void>): Promise<void> {
		if (this.state !== COMPLETION_STATE.PENDING) {
			throw new ReviewSessionConflictError();
		}

		this.state = COMPLETION_STATE.COMPLETING;
		try {
			await acknowledge();
		} catch (error) {
			this.state = COMPLETION_STATE.PENDING;
			throw error;
		}

		this.state = COMPLETION_STATE.COMPLETED;
		this.resolveResult(result);
	}
}

export function buildEmptyReviewFeedbackExport(gitRef: string): ReviewFeedbackExport {
	return {
		gitRef,
		approved: false,
		feedback: "",
		annotations: [],
	};
}

export function buildReviewFeedbackExport(
	gitRef: string,
	threads: readonly CommentThread[],
): ReviewFeedbackExport {
	const unresolved = prepareThreads(threads);
	return {
		gitRef,
		approved: false,
		feedback: formatReviewFeedback(gitRef, unresolved),
		annotations: formatAnnotations(unresolved),
	};
}

export function formatReviewGitRef(scope: Scope): string {
	if (scope.kind === SCOPE_KIND.COMMITTED) {
		return `${scope.mergeBaseSha}..${scope.headSha}`;
	}

	switch (scope.ref) {
		case WORKING_TREE_REF.WORK:
			return "working tree";
		case WORKING_TREE_REF.STAGED:
			return "--staged";
		case WORKING_TREE_REF.UNSTAGED:
			return "unstaged";
	}
}

export function serializeReviewFeedback(result: ReviewFeedbackExport): string {
	return `${JSON.stringify(result, null, 2)}\n`;
}

function prepareThreads(threads: readonly CommentThread[]): CommentThread[] {
	const unresolved = threads.filter((thread) => thread.resolvedAt === null);
	if (unresolved.length === 0) {
		throw new Error("Cannot format empty Stage review feedback");
	}
	for (const thread of unresolved) {
		if (thread.comments.length === 0) {
			throw new Error(`Comment thread ${thread.id} has no comments`);
		}
	}
	return [...unresolved].sort(compareThreads);
}

function formatReviewFeedback(gitRef: string, threads: readonly CommentThread[]): string {
	const byFile = new Map<string, CommentThread[]>();
	for (const thread of threads) {
		const fileThreads = byFile.get(thread.filePath);
		if (fileThreads === undefined) byFile.set(thread.filePath, [thread]);
		else fileThreads.push(thread);
	}

	const sections: string[] = [];
	for (const [filePath, fileThreads] of byFile) {
		sections.push([`## ${filePath}`, ...fileThreads.map(formatThread)].join("\n\n"));
	}

	return `${CODE_REVIEW_FEEDBACK_HEADER}\n\n**Diff:** ${formatDiffLabel(gitRef)}\n\n${sections.join("\n\n")}\n`;
}

function compareThreads(left: CommentThread, right: CommentThread): number {
	return (
		compareText(left.filePath, right.filePath) ||
		left.startLine - right.startLine ||
		left.endLine - right.endLine ||
		compareText(left.side, right.side) ||
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
	const range =
		thread.startLine === thread.endLine
			? `Line ${thread.startLine}`
			: `Lines ${thread.startLine}-${thread.endLine}`;
	const comments = sortComments(thread.comments).map((comment) => comment.body);

	return [`### ${range} (${formatSide(thread.side)})`, ...comments].join("\n\n");
}

function formatAnnotations(threads: readonly CommentThread[]): ReviewFeedbackAnnotation[] {
	return threads.flatMap((thread) =>
		sortComments(thread.comments).map((comment) => ({
			id: comment.id,
			threadId: thread.id,
			type: REVIEW_ANNOTATION_TYPE.COMMENT,
			filePath: thread.filePath,
			lineStart: thread.startLine,
			lineEnd: thread.endLine,
			side: formatSide(thread.side),
			text: comment.body,
			authorId: comment.authorId,
			createdAt: comment.createdAt,
			updatedAt: comment.updatedAt,
		})),
	);
}

function sortComments(comments: readonly Comment[]): Comment[] {
	return [...comments].sort(
		(left, right) => compareText(left.createdAt, right.createdAt) || compareText(left.id, right.id),
	);
}

function formatSide(side: CommentThread["side"]): ReviewFeedbackAnnotation["side"] {
	switch (side) {
		case DIFF_SIDE.ADDITIONS:
			return REVIEW_ANNOTATION_SIDE.NEW;
		case DIFF_SIDE.DELETIONS:
			return REVIEW_ANNOTATION_SIDE.OLD;
	}
}

function formatDiffLabel(gitRef: string): string {
	switch (gitRef) {
		case "working tree":
			return "Uncommitted changes";
		case "--staged":
			return "Staged changes";
		case "unstaged":
			return "Unstaged changes";
		default:
			return `\`${gitRef}\``;
	}
}
