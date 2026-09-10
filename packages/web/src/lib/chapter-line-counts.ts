import type { Chapter } from "@stagereview/types/chapters";
import { parsePatchToFileDiffs } from "./parse-diff";

export interface ChapterLineCounts {
	linesAdded: number;
	linesDeleted: number;
}

export function buildChapterLineCountsMap(
	chapters: readonly Pick<Chapter, "id" | "hunkRefs">[],
	patch: string | undefined,
): ReadonlyMap<string, ChapterLineCounts> {
	const map = new Map<string, ChapterLineCounts>();
	if (!patch || chapters.length === 0) return map;

	const countsByPath = new Map<string, ReadonlyMap<number, ChapterLineCounts>>();
	for (const diff of parsePatchToFileDiffs(patch)) {
		const countsByOldStart = new Map<number, ChapterLineCounts>();
		for (const hunk of diff.hunks) {
			const existing = countsByOldStart.get(hunk.deletionStart);
			if (existing) {
				existing.linesAdded += hunk.additionLines;
				existing.linesDeleted += hunk.deletionLines;
			} else {
				countsByOldStart.set(hunk.deletionStart, {
					linesAdded: hunk.additionLines,
					linesDeleted: hunk.deletionLines,
				});
			}
		}
		countsByPath.set(diff.name, countsByOldStart);
		if (diff.prevName) countsByPath.set(diff.prevName, countsByOldStart);
	}

	for (const chapter of chapters) {
		const oldStartsByPath = new Map<string, Set<number>>();
		for (const ref of chapter.hunkRefs) {
			const oldStarts = oldStartsByPath.get(ref.filePath);
			if (oldStarts) oldStarts.add(ref.oldStart);
			else oldStartsByPath.set(ref.filePath, new Set([ref.oldStart]));
		}

		let linesAdded = 0;
		let linesDeleted = 0;
		for (const [path, oldStarts] of oldStartsByPath) {
			const counts = countsByPath.get(path);
			if (!counts) continue;
			for (const oldStart of oldStarts) {
				const hunkCounts = counts.get(oldStart);
				if (!hunkCounts) continue;
				linesAdded += hunkCounts.linesAdded;
				linesDeleted += hunkCounts.linesDeleted;
			}
		}
		map.set(chapter.id, { linesAdded, linesDeleted });
	}
	return map;
}
