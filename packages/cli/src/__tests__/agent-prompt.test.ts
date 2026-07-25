import { describe, expect, it } from "vitest";
import { buildAgentInstructions, buildAgentQuestion } from "../agent/prompt.js";
import { makeFixture } from "./fixtures.js";

describe("Ask Agent prompts", () => {
	it("describes the exact committed review scope without accepting a browser cwd", () => {
		const instructions = buildAgentInstructions(makeFixture().scope);

		expect(instructions).toContain("You are Ask Agent inside Stage");
		expect(instructions).toContain("Never edit files");
		expect(instructions).toContain("git diff --no-ext-diff");
		expect(instructions).toContain(makeFixture().scope.mergeBaseSha);
	});

	it("includes exact selected code and its diff coordinates", () => {
		const prompt = buildAgentQuestion({
			sessionId: "9a6aff90-6a4e-4f11-acb0-50df870ca285",
			question: "Why is this branch necessary?",
			selection: {
				filePath: "src/auth.ts",
				side: "additions",
				startLine: 12,
				endLine: 14,
				selectedText: "if (!token) {\n\treturn unauthorized();\n}",
			},
		});

		expect(prompt).toContain("file: src/auth.ts");
		expect(prompt).toContain("side: new");
		expect(prompt).toContain("lines: 12-14");
		expect(prompt).toContain("if (!token) {\n\treturn unauthorized();\n}");
		expect(prompt).toContain("Why is this branch necessary?");
	});
});
