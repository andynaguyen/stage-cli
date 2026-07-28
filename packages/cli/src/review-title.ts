import { getCommitSubjects, parseRepoName, type RepoContext } from "./git.js";
import { getPullRequest } from "./github/index.js";
import type { Scope } from "./schema.js";

const STAGE_TITLE_PREFIX = "Stage - ";

export interface ReviewTitleContext {
	repo: RepoContext;
	scope: Scope;
	prNumber: number | null;
	reviewTitle?: string;
	fallbackTitle: string | null;
}

export interface ReviewTitleDependencies {
	getPullRequestTitle(
		repoRoot: string,
		originUrl: string | null,
		prNumber: number | null,
	): Promise<string | null>;
	getCommitSubjects(repoRoot: string, mergeBase: string, head: string): string[];
}

const DEFAULT_DEPENDENCIES: ReviewTitleDependencies = {
	getPullRequestTitle: async (repoRoot, originUrl, prNumber) => {
		const pullRequest = await getPullRequest(repoRoot, originUrl, prNumber);
		return pullRequest ? pullRequest.title : null;
	},
	getCommitSubjects,
};

export class ReviewTitleResolver {
	constructor(private readonly dependencies: ReviewTitleDependencies = DEFAULT_DEPENDENCIES) {}

	async resolve(context: ReviewTitleContext): Promise<string> {
		const pullRequestTitle = await this.dependencies.getPullRequestTitle(
			context.repo.root,
			context.repo.originUrl,
			context.prNumber,
		);
		if (pullRequestTitle !== null) return this.format(pullRequestTitle);

		const subjects = this.dependencies.getCommitSubjects(
			context.repo.root,
			context.scope.mergeBaseSha,
			context.scope.headSha,
		);
		if (subjects.length === 1) {
			const subject = subjects[0];
			if (subject === undefined) throw new Error("git returned an invalid commit subject list");
			return this.format(subject);
		}
		if (context.reviewTitle !== undefined) return this.format(context.reviewTitle);
		if (context.fallbackTitle !== null) return this.format(context.fallbackTitle);
		return this.format(parseRepoName(context.repo.originUrl, context.repo.root));
	}

	private format(title: string): string {
		return `${STAGE_TITLE_PREFIX}${title}`;
	}
}
