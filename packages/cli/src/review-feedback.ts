import {
	COMMENT_ANCHOR,
	type Comment,
	type CommentThread,
	type LineCommentThread,
} from "@stagereview/types/comments";
import {
	REVIEW_ANNOTATION_SIDE,
	REVIEW_ANNOTATION_TYPE,
	type ReviewFeedbackAnnotation,
	type ReviewFeedbackExport,
} from "@stagereview/types/review-feedback";
import {
	DIFF_SIDE,
	SCOPE_KIND,
	type Scope,
	WORKING_TREE_REF,
	type WorkingTreeRef,
} from "./schema.js";

const COMPLETION_STATE = {
	PENDING: "pending",
	COMPLETING: "completing",
	COMPLETED: "completed",
} as const;

type CompletionState = (typeof COMPLETION_STATE)[keyof typeof COMPLETION_STATE];

export interface ReviewFeedbackCompletion {
	persist: () => void | Promise<void>;
	acknowledge: () => Promise<void>;
}

const WORKING_TREE_REVIEW_LABEL = {
	[WORKING_TREE_REF.WORK]: {
		gitRef: "working tree",
		diffLabel: "Uncommitted changes",
	},
	[WORKING_TREE_REF.STAGED]: {
		gitRef: "--staged",
		diffLabel: "Staged changes",
	},
	[WORKING_TREE_REF.UNSTAGED]: {
		gitRef: "unstaged",
		diffLabel: "Unstaged changes",
	},
} as const satisfies Record<WorkingTreeRef, { gitRef: string; diffLabel: string }>;

const CODE_REVIEW_FEEDBACK_HEADER = "# Code Review Feedback";

export class ReviewSessionConflictError extends Error {
	constructor() {
		super("Review session has already completed");
		this.name = "ReviewSessionConflictError";
	}
}

export class ReviewFeedbackSession {
	readonly result: Promise<ReviewFeedbackExport>;
	readonly scope: Scope;

	private state: CompletionState = COMPLETION_STATE.PENDING;
	private readonly resolveResult: (result: ReviewFeedbackExport) => void;

	constructor(scope: Scope) {
		this.scope = scope;
		let resolveResult: ((result: ReviewFeedbackExport) => void) | undefined;
		this.result = new Promise<ReviewFeedbackExport>((resolve) => {
			resolveResult = resolve;
		});
		if (resolveResult === undefined) {
			throw new Error("Failed to initialize review feedback session");
		}
		this.resolveResult = resolveResult;
	}

	async complete(
		result: ReviewFeedbackExport,
		completion: ReviewFeedbackCompletion,
	): Promise<void> {
		if (this.state !== COMPLETION_STATE.PENDING) {
			throw new ReviewSessionConflictError();
		}

		this.state = COMPLETION_STATE.COMPLETING;
		try {
			await completion.persist();
		} catch (error) {
			this.state = COMPLETION_STATE.PENDING;
			throw error;
		}

		this.state = COMPLETION_STATE.COMPLETED;
		try {
			await completion.acknowledge();
		} finally {
			this.resolveResult(result);
		}
	}
}

export function buildEmptyReviewFeedbackExport(scope: Scope): ReviewFeedbackExport {
	return {
		gitRef: formatReviewGitRef(scope),
		approved: false,
		feedback: "",
		annotations: [],
	};
}

export function buildReviewFeedbackExport(
	scope: Scope,
	threads: readonly CommentThread[],
): ReviewFeedbackExport {
	const unresolved = prepareThreads(threads);
	return {
		gitRef: formatReviewGitRef(scope),
		approved: false,
		feedback: formatReviewFeedback(scope, unresolved),
		annotations: formatAnnotations(unresolved),
	};
}

export function formatReviewGitRef(scope: Scope): string {
	if (scope.kind === SCOPE_KIND.COMMITTED) {
		return `${scope.mergeBaseSha}..${scope.headSha}`;
	}
	return WORKING_TREE_REVIEW_LABEL[scope.ref].gitRef;
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

function formatReviewFeedback(scope: Scope, threads: readonly CommentThread[]): string {
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

	return `${CODE_REVIEW_FEEDBACK_HEADER}\n\n**Diff:** ${formatDiffLabel(scope)}\n\n${sections.join("\n\n")}\n`;
}

function compareThreads(left: CommentThread, right: CommentThread): number {
	const fileOrder = compareText(left.filePath, right.filePath);
	if (fileOrder !== 0) return fileOrder;
	if (left.anchor !== right.anchor) return left.anchor === COMMENT_ANCHOR.FILE ? -1 : 1;
	if (left.anchor === COMMENT_ANCHOR.LINE && right.anchor === COMMENT_ANCHOR.LINE) {
		const lineOrder =
			left.startLine - right.startLine ||
			left.endLine - right.endLine ||
			compareText(left.side, right.side);
		if (lineOrder !== 0) return lineOrder;
	}
	return compareText(left.createdAt, right.createdAt) || compareText(left.id, right.id);
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function formatThread(thread: CommentThread): string {
	const heading = (() => {
		if (thread.anchor === COMMENT_ANCHOR.FILE) return "File comment";
		const range =
			thread.startLine === thread.endLine
				? `L${thread.startLine}`
				: `L${thread.startLine}-${thread.endLine}`;
		return `${range} (${formatSide(thread.side)})`;
	})();
	const comments = sortComments(thread.comments).map((comment) => comment.body);

	return [`### ${heading}`, ...comments].join("\n\n");
}

function formatAnnotations(threads: readonly CommentThread[]): ReviewFeedbackAnnotation[] {
	return threads.flatMap((thread) =>
		thread.anchor === COMMENT_ANCHOR.FILE
			? []
			: sortComments(thread.comments).map((comment) => ({
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

function formatSide(side: LineCommentThread["side"]): ReviewFeedbackAnnotation["side"] {
	switch (side) {
		case DIFF_SIDE.ADDITIONS:
			return REVIEW_ANNOTATION_SIDE.NEW;
		case DIFF_SIDE.DELETIONS:
			return REVIEW_ANNOTATION_SIDE.OLD;
	}
}

function formatDiffLabel(scope: Scope): string {
	if (scope.kind === SCOPE_KIND.COMMITTED) {
		return `\`${formatReviewGitRef(scope)}\``;
	}
	return WORKING_TREE_REVIEW_LABEL[scope.ref].diffLabel;
}
