import { readFileSync } from "node:fs";
import path from "node:path";
import open from "open";
import { createAgentRuntime } from "./agent/index.js";
import { buildOtherChangesChapter } from "./build-other-changes.js";
import { closeDb, getDb } from "./db/client.js";
import { parseGitDiff } from "./diff-parser.js";
import { filterFilesForLlm, loadStageIgnore } from "./filter-files.js";
import { readRepoContext, readRepoRoot } from "./git.js";
import { ReviewFeedbackSession } from "./review-feedback.js";
import { runReviewSession } from "./review-lifecycle.js";
import { ReviewTitleResolver } from "./review-title.js";
import { agentRoutes } from "./routes/agent.js";
import { commentRoutes } from "./routes/comments.js";
import { diffRoutes } from "./routes/diff.js";
import { pullRequestRoutes } from "./routes/pull-request.js";
import { pullRequestMutationRoutes } from "./routes/pull-request-mutations.js";
import { reviewFeedbackRoutes } from "./routes/review-feedback.js";
import { runRoutes } from "./routes/runs.js";
import { userSettingsRoutes } from "./routes/user-settings.js";
import { viewStateRoutes } from "./routes/view-state.js";
import { viewerRoutes } from "./routes/viewer.js";
import { insertChaptersFile } from "./runs/import-chapters.js";
import {
	type AgentOutput,
	AgentOutputSchema,
	type Chapter,
	type ChaptersFile,
	ChaptersFileSchema,
	DIFF_SIDE,
	type Scope,
} from "./schema.js";
import { type DiffScopeOptions, pullRequestNumberFromRef, resolveDiffScope } from "./scope.js";
import { LOOPBACK_HOST, startServer } from "./server.js";

export async function show(jsonPath: string, options: DiffScopeOptions): Promise<void> {
	const db = getDb();
	const agentRuntime = createAgentRuntime();
	try {
		const { chaptersFile, prNumber } = await buildChaptersFile(jsonPath, options);
		const repo = readRepoContext();
		const firstChapter = chaptersFile.chapters[0];
		const pageTitle = await new ReviewTitleResolver().resolve({
			repo,
			scope: chaptersFile.scope,
			prNumber,
			...(chaptersFile.reviewTitle !== undefined ? { reviewTitle: chaptersFile.reviewTitle } : {}),
			fallbackTitle: firstChapter === undefined ? null : firstChapter.title,
		});
		const { runId } = insertChaptersFile(db, chaptersFile, repo, prNumber);
		const feedbackSession = new ReviewFeedbackSession(chaptersFile.scope);
		const handle = await startServer({
			pageTitle,
			routes: [
				...agentRoutes(db, agentRuntime),
				...runRoutes(db),
				...userSettingsRoutes(db),
				...viewStateRoutes(db),
				...commentRoutes(db),
				...reviewFeedbackRoutes(db, runId, feedbackSession),
				...viewerRoutes(),
				...diffRoutes(db),
				...pullRequestRoutes(db),
				...pullRequestMutationRoutes(db),
			],
		});
		const url = `http://${LOOPBACK_HOST}:${handle.port}/runs/${encodeURIComponent(runId)}`;

		await runReviewSession(feedbackSession, {
			url,
			signals: process,
			openBrowser: open,
			closeServer: async () => {
				await agentRuntime.dispose();
				await handle.close();
			},
			closeDatabase: closeDb,
			writeStdout: (text) => process.stdout.write(text),
			writeStderr: (text) => process.stderr.write(text),
		});
	} catch (error) {
		await agentRuntime.dispose();
		closeDb();
		throw error;
	}
}

interface BuiltChaptersFile {
	chaptersFile: ChaptersFile;
	/** The reviewed PR's number when `--pr` was used, else null. */
	prNumber: number | null;
}

async function buildChaptersFile(
	jsonPath: string,
	options: DiffScopeOptions,
): Promise<BuiltChaptersFile> {
	const absolute = path.resolve(jsonPath);
	const raw = readFileSync(absolute, "utf8");
	const parsed = JSON.parse(raw) as unknown;

	// A fully-formed chapters file carries its own scope, so the diff isn't
	// recomputed from the working tree or PR. `--pr` still records which PR the
	// run targets (so the UI resolves the right one) — only the number is needed
	// here, not a fetch, since the scope already comes from the file.
	const fullResult = ChaptersFileSchema.safeParse(parsed);
	if (fullResult.success) {
		const prNumber = options.pr === undefined ? null : pullRequestNumberFromRef(options.pr);
		return { chaptersFile: fullResult.data, prNumber };
	}

	const agentResult = AgentOutputSchema.safeParse(parsed);
	if (agentResult.success) {
		const { scope, rawDiff, prNumber } = await resolveDiffScope(options);
		return { chaptersFile: assembleChaptersFile(agentResult.data, scope, rawDiff), prNumber };
	}

	throw fullResult.error;
}

function assembleChaptersFile(
	agentOutput: AgentOutput,
	scope: Scope,
	rawDiff: string,
): ChaptersFile {
	const allFiles = parseGitDiff(rawDiff);
	const stageIgnore = loadStageIgnore(readRepoRoot());
	const { files: filteredFiles, excludedByPath } = filterFilesForLlm(allFiles, stageIgnore);

	validateHunkCoverage(filteredFiles, agentOutput.chapters);
	const sanitized = sanitizeLineRefs(agentOutput.chapters, filteredFiles);

	const chapters = [...sanitized];
	const otherChanges = buildOtherChangesChapter(allFiles, excludedByPath);
	if (otherChanges) {
		chapters.push({ ...otherChanges, order: chapters.length + 1 });
	}

	return {
		scope,
		...(agentOutput.reviewTitle !== undefined ? { reviewTitle: agentOutput.reviewTitle } : {}),
		chapters,
		prologue: agentOutput.prologue,
		generatedAt: new Date().toISOString(),
	};
}

function validateHunkCoverage(
	filteredFiles: { path: string; hunks: { oldStart: number }[] }[],
	chapters: Chapter[],
): void {
	const expected = new Map<string, Set<number>>();
	for (const file of filteredFiles) {
		const starts = new Set<number>();
		for (const hunk of file.hunks) {
			starts.add(hunk.oldStart);
		}
		if (starts.size > 0) {
			expected.set(file.path, starts);
		}
	}

	const actual = new Map<string, Map<number, number>>();
	const duplicates: string[] = [];
	for (const chapter of chapters) {
		for (const ref of chapter.hunkRefs) {
			let starts = actual.get(ref.filePath);
			if (!starts) {
				starts = new Map();
				actual.set(ref.filePath, starts);
			}
			const count = starts.get(ref.oldStart) ?? 0;
			if (count > 0) {
				duplicates.push(`  filePath: "${ref.filePath}", oldStart: ${ref.oldStart}`);
			}
			starts.set(ref.oldStart, count + 1);
		}
	}

	const missing: string[] = [];
	for (const [filePath, starts] of expected) {
		const actualStarts = actual.get(filePath);
		for (const oldStart of starts) {
			if (!actualStarts?.has(oldStart)) {
				missing.push(`  filePath: "${filePath}", oldStart: ${oldStart}`);
			}
		}
	}

	const extra: string[] = [];
	for (const [filePath, starts] of actual) {
		const expectedStarts = expected.get(filePath);
		for (const oldStart of starts.keys()) {
			if (!expectedStarts?.has(oldStart)) {
				extra.push(`  filePath: "${filePath}", oldStart: ${oldStart}`);
			}
		}
	}

	if (missing.length === 0 && extra.length === 0 && duplicates.length === 0) return;

	const lines = ["Hunk coverage validation failed."];
	if (missing.length > 0) {
		lines.push(`Missing hunks (${missing.length}) — not assigned to any chapter:`);
		lines.push(...missing);
	}
	if (extra.length > 0) {
		lines.push(`Extra hunks (${extra.length}) — not found in the diff:`);
		lines.push(...extra);
	}
	if (duplicates.length > 0) {
		lines.push(`Duplicate hunks (${duplicates.length}) — assigned to multiple chapters:`);
		lines.push(...duplicates);
	}
	throw new Error(lines.join("\n"));
}

interface HunkSpan {
	oldStart: number;
	oldEnd: number;
	newStart: number;
	newEnd: number;
}

function sanitizeLineRefs(
	chapters: Chapter[],
	filteredFiles: {
		path: string;
		hunks: { oldStart: number; oldLines: number; newStart: number; newLines: number }[];
	}[],
): Chapter[] {
	const hunkSpanIndex = new Map<string, Map<number, HunkSpan>>();
	for (const file of filteredFiles) {
		const spans = new Map<number, HunkSpan>();
		for (const hunk of file.hunks) {
			spans.set(hunk.oldStart, {
				oldStart: hunk.oldStart,
				oldEnd: hunk.oldStart + hunk.oldLines - 1,
				newStart: hunk.newStart,
				newEnd: hunk.newStart + hunk.newLines - 1,
			});
		}
		if (spans.size > 0) {
			hunkSpanIndex.set(file.path, spans);
		}
	}

	return chapters.map((chapter) => {
		const chapterSpans = new Map<string, HunkSpan[]>();
		for (const ref of chapter.hunkRefs) {
			const fileSpans = hunkSpanIndex.get(ref.filePath);
			if (!fileSpans) continue;
			const span = fileSpans.get(ref.oldStart);
			if (!span) continue;
			let spans = chapterSpans.get(ref.filePath);
			if (!spans) {
				spans = [];
				chapterSpans.set(ref.filePath, spans);
			}
			spans.push(span);
		}

		const keyChanges = chapter.keyChanges.flatMap((kc) => {
			const validRefs = kc.lineRefs.filter((ref) => {
				if (ref.startLine < 1 || ref.endLine < 1) return false;
				if (ref.startLine > ref.endLine) return false;

				const spans = chapterSpans.get(ref.filePath);
				if (!spans) return false;

				return spans.some((span) => {
					const [rangeStart, rangeEnd] =
						ref.side === DIFF_SIDE.ADDITIONS
							? [span.newStart, span.newEnd]
							: [span.oldStart, span.oldEnd];
					if (rangeStart > rangeEnd) return false;
					return ref.startLine >= rangeStart && ref.endLine <= rangeEnd;
				});
			});

			const uniqueRefs: typeof validRefs = [];
			for (const ref of validRefs) {
				const isDuplicate = uniqueRefs.some(
					(existing) =>
						existing.filePath === ref.filePath &&
						existing.side === ref.side &&
						existing.startLine === ref.startLine &&
						existing.endLine === ref.endLine,
				);
				if (!isDuplicate) uniqueRefs.push(ref);
			}

			if (uniqueRefs.length === 0) return [];
			return [{ content: kc.content, lineRefs: uniqueRefs }];
		});

		return { ...chapter, keyChanges };
	});
}
