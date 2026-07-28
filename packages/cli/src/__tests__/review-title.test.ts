import { describe, expect, it } from "vitest";
import {
	type ReviewTitleContext,
	type ReviewTitleDependencies,
	ReviewTitleResolver,
} from "../review-title.js";

const CONTEXT: ReviewTitleContext = {
	repo: { root: "/work/stage-cli", originUrl: "git@github.com:ReviewStage/stage-cli.git" },
	scope: {
		kind: "committed",
		baseSha: "1".repeat(40),
		headSha: "2".repeat(40),
		mergeBaseSha: "1".repeat(40),
	},
	prNumber: null,
	reviewTitle: "Summarize several related commits",
	fallbackTitle: "First chapter title",
};

function makeResolver(
	pullRequestTitle: string | null,
	commitSubjects: string[],
): ReviewTitleResolver {
	const dependencies: ReviewTitleDependencies = {
		getPullRequestTitle: async () => pullRequestTitle,
		getCommitSubjects: () => commitSubjects,
	};
	return new ReviewTitleResolver(dependencies);
}

describe("ReviewTitleResolver", () => {
	it("uses the PR title before commit-derived titles", async () => {
		const title = await makeResolver("Ship dynamic browser titles", ["Ignored commit"]).resolve(
			CONTEXT,
		);

		expect(title).toBe("Stage - Ship dynamic browser titles");
	});

	it("uses the exact subject for a single commit", async () => {
		const title = await makeResolver(null, ["fix(web): preserve exact casing"]).resolve(CONTEXT);

		expect(title).toBe("Stage - fix(web): preserve exact casing");
	});

	it("uses the AI suggestion for multiple commits", async () => {
		const title = await makeResolver(null, ["First commit", "Second commit"]).resolve(CONTEXT);

		expect(title).toBe("Stage - Summarize several related commits");
	});

	it("uses the AI suggestion for working-tree-only changes", async () => {
		const title = await makeResolver(null, []).resolve(CONTEXT);

		expect(title).toBe("Stage - Summarize several related commits");
	});

	it("uses the first chapter title for legacy output without an AI suggestion", async () => {
		const { reviewTitle: _reviewTitle, ...legacyContext } = CONTEXT;
		const title = await makeResolver(null, ["First commit", "Second commit"]).resolve(
			legacyContext,
		);

		expect(title).toBe("Stage - First chapter title");
	});

	it("uses the repository name when no generated title is available", async () => {
		const { reviewTitle: _reviewTitle, ...legacyContext } = CONTEXT;
		const title = await makeResolver(null, []).resolve({
			...legacyContext,
			fallbackTitle: null,
		});

		expect(title).toBe("Stage - stage-cli");
	});
});
