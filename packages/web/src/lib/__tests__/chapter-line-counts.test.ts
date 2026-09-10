import { getSingularPatch, parsePatchFiles } from "@pierre/diffs";
import type { Chapter, HunkReference } from "@stagereview/types/chapters";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildChapterLineCountsMap } from "../chapter-line-counts";

vi.mock("@pierre/diffs", { spy: true });

const PATCH = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,2 +1,3 @@
-old
+new
+extra
 context
@@ -10,1 +11,1 @@
-before
+after
diff --git a/old.ts b/renamed.ts
similarity index 50%
rename from old.ts
rename to renamed.ts
--- a/old.ts
+++ b/renamed.ts
@@ -1,1 +1,2 @@
-old
+new
+extra
diff --git a/deleted.ts b/deleted.ts
deleted file mode 100644
--- a/deleted.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-one
-two
diff --git a/added.ts b/added.ts
new file mode 100644
--- /dev/null
+++ b/added.ts
@@ -0,0 +1,2 @@
+one
+two
diff --git a/image.png b/image.png
index 1111111..2222222 100644
Binary files a/image.png and b/image.png differ
`;

function makeChapter(id: string, hunkRefs: HunkReference[] = []): Pick<Chapter, "id" | "hunkRefs"> {
	return { id, hunkRefs };
}

beforeEach(() => vi.clearAllMocks());

describe("buildChapterLineCountsMap", () => {
	it("counts each referenced hunk once per chapter, including shared hunks", () => {
		const first = { filePath: "src/foo.ts", oldStart: 1 };
		const second = { filePath: "src/foo.ts", oldStart: 10 };
		const counts = buildChapterLineCountsMap(
			[makeChapter("first", [first, first, second]), makeChapter("overlap", [first])],
			PATCH,
		);
		expect(counts.get("first")).toEqual({ linesAdded: 3, linesDeleted: 2 });
		expect(counts.get("overlap")).toEqual({ linesAdded: 2, linesDeleted: 1 });
	});

	it("accepts either rename path and preserves distinct path references", () => {
		const old = { filePath: "old.ts", oldStart: 1 };
		const renamed = { filePath: "renamed.ts", oldStart: 1 };
		const counts = buildChapterLineCountsMap(
			[
				makeChapter("old", [old]),
				makeChapter("new", [renamed]),
				makeChapter("both", [old, renamed]),
			],
			PATCH,
		);
		expect(counts.get("old")).toEqual({ linesAdded: 2, linesDeleted: 1 });
		expect(counts.get("new")).toEqual({ linesAdded: 2, linesDeleted: 1 });
		expect(counts.get("both")).toEqual({ linesAdded: 4, linesDeleted: 2 });
	});

	it("counts added and deleted files and ignores binary, missing, and unmatched references", () => {
		const counts = buildChapterLineCountsMap(
			[
				makeChapter("files", [
					{ filePath: "added.ts", oldStart: 0 },
					{ filePath: "deleted.ts", oldStart: 1 },
					{ filePath: "image.png", oldStart: 1 },
					{ filePath: "missing.ts", oldStart: 1 },
					{ filePath: "src/foo.ts", oldStart: 999 },
				]),
				makeChapter("empty"),
			],
			PATCH,
		);
		expect(counts.get("files")).toEqual({ linesAdded: 2, linesDeleted: 2 });
		expect(counts.get("empty")).toEqual({ linesAdded: 0, linesDeleted: 0 });
	});

	it.each([undefined, ""])("returns no counts before a patch is available", (patch) => {
		expect(buildChapterLineCountsMap([makeChapter("chapter")], patch).size).toBe(0);
	});

	it("parses the patch once for all chapters", () => {
		const chapters = Array.from({ length: 50 }, (_, index) =>
			makeChapter(String(index), [{ filePath: "src/foo.ts", oldStart: 1 }]),
		);
		buildChapterLineCountsMap(chapters, PATCH);
		expect(
			vi.mocked(parsePatchFiles).mock.calls.length + vi.mocked(getSingularPatch).mock.calls.length,
		).toBe(1);
	});
});
