import { COMMENT_ANCHOR, type Comment, type CommentThread } from "@stagereview/types/comments";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { StageDb } from "../db/client.js";
import {
	type CommentRow,
	type CommentThreadRow,
	chapterRun,
	comment,
	commentThread,
} from "../db/schema/index.js";
import { deriveScopeKey } from "../runs/scope-key.js";

export class CommentThreadQuery {
	constructor(private readonly db: StageDb) {}

	findScopeKeyForRun(runId: string | undefined): string | null {
		if (runId === undefined) return null;
		const [run] = this.db
			.select({
				scopeKind: chapterRun.scopeKind,
				workingTreeRef: chapterRun.workingTreeRef,
				baseSha: chapterRun.baseSha,
				headSha: chapterRun.headSha,
				mergeBaseSha: chapterRun.mergeBaseSha,
			})
			.from(chapterRun)
			.where(eq(chapterRun.id, runId))
			.limit(1)
			.all();
		return run === undefined ? null : deriveScopeKey(run);
	}

	listForRun(runId: string | undefined): CommentThread[] | null {
		const scopeKey = this.findScopeKeyForRun(runId);
		return scopeKey === null ? null : this.listForScope(scopeKey, false);
	}

	listUnresolvedForRun(runId: string | undefined): CommentThread[] | null {
		const scopeKey = this.findScopeKeyForRun(runId);
		return scopeKey === null ? null : this.listForScope(scopeKey, true);
	}

	private listForScope(scopeKey: string, unresolvedOnly: boolean): CommentThread[] {
		const scopePredicate = eq(commentThread.scopeKey, scopeKey);
		const threads = this.db
			.select()
			.from(commentThread)
			.where(
				unresolvedOnly ? and(scopePredicate, isNull(commentThread.resolvedAt)) : scopePredicate,
			)
			.orderBy(asc(commentThread.createdAt))
			.all();
		if (threads.length === 0) return [];

		const comments = this.db
			.select()
			.from(comment)
			.where(
				inArray(
					comment.threadId,
					threads.map((thread) => thread.id),
				),
			)
			.orderBy(asc(comment.createdAt))
			.all();

		const byThread = new Map<string, CommentRow[]>();
		for (const row of comments) {
			const rows = byThread.get(row.threadId);
			if (rows === undefined) byThread.set(row.threadId, [row]);
			else rows.push(row);
		}

		return threads.map((thread) => {
			const rows = byThread.get(thread.id);
			if (rows === undefined) {
				throw new Error(`Comment thread ${thread.id} has no comments`);
			}
			return toCommentThread(thread, rows);
		});
	}
}

export function toCommentThread(
	thread: CommentThreadRow,
	comments: readonly CommentRow[],
): CommentThread {
	const shared = {
		id: thread.id,
		filePath: thread.filePath,
		resolvedAt: thread.resolvedAt === null ? null : thread.resolvedAt.toISOString(),
		createdAt: thread.createdAt.toISOString(),
		updatedAt: thread.updatedAt.toISOString(),
		comments: comments.map(toComment),
	};
	if (thread.anchor === COMMENT_ANCHOR.FILE) {
		return {
			...shared,
			anchor: COMMENT_ANCHOR.FILE,
			side: null,
			startLine: null,
			endLine: null,
		};
	}
	if (thread.side === null || thread.startLine === null || thread.endLine === null) {
		throw new Error(`Line comment thread ${thread.id} has an incomplete anchor`);
	}
	return {
		...shared,
		anchor: COMMENT_ANCHOR.LINE,
		side: thread.side,
		startLine: thread.startLine,
		endLine: thread.endLine,
	};
}

export function toComment(row: CommentRow): Comment {
	return {
		id: row.id,
		body: row.body,
		authorId: row.authorId,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}
