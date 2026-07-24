import { EventEmitter } from "node:events";
import type { ReviewFeedbackExport } from "@stagereview/types/review-feedback";
import { describe, expect, it, vi } from "vitest";
import { buildEmptyReviewFeedbackExport, ReviewFeedbackSession } from "../review-feedback.js";
import { type ReviewSessionDependencies, runReviewSession } from "../review-lifecycle.js";
import { SCOPE_KIND, type Scope, WORKING_TREE_REF } from "../schema.js";

const WORKING_TREE_SCOPE: Scope = {
	kind: SCOPE_KIND.WORKING_TREE,
	ref: WORKING_TREE_REF.WORK,
	baseSha: "1".repeat(40),
	headSha: "2".repeat(40),
	mergeBaseSha: "1".repeat(40),
};

function makeResult(): ReviewFeedbackExport {
	return {
		gitRef: "working tree",
		approved: false,
		feedback: "# Code Review Feedback\n",
		annotations: [],
	};
}

function makeDependencies(over: Partial<ReviewSessionDependencies> = {}): {
	dependencies: ReviewSessionDependencies;
	events: string[];
	signals: EventEmitter;
} {
	const events: string[] = [];
	const signals = new EventEmitter();
	return {
		events,
		signals,
		dependencies: {
			url: "http://127.0.0.1:5391/runs/run-1",
			signals,
			openBrowser: vi.fn(async () => {}),
			closeServer: vi.fn(async () => {
				events.push("server closed");
			}),
			closeDatabase: vi.fn(() => {
				events.push("database closed");
			}),
			writeStdout: vi.fn(() => {
				events.push("stdout written");
			}),
			writeStderr: vi.fn(),
			...over,
		},
	};
}

describe("runReviewSession", () => {
	it("closes resources and writes feedback when submission wins", async () => {
		const session = new ReviewFeedbackSession(WORKING_TREE_SCOPE);
		const { dependencies, events, signals } = makeDependencies();
		const running = runReviewSession(session, dependencies);
		await Promise.resolve();

		await session.complete(makeResult(), async () => {});
		await running;

		expect(dependencies.writeStderr).toHaveBeenCalledWith(
			"Listening on http://127.0.0.1:5391/runs/run-1\n",
		);
		expect(dependencies.writeStdout).toHaveBeenCalledWith(
			`${JSON.stringify(makeResult(), null, 2)}\n`,
		);
		expect(events).toEqual(["server closed", "database closed", "stdout written"]);
		expect(signals.listenerCount("SIGINT")).toBe(0);
		expect(signals.listenerCount("SIGTERM")).toBe(0);
	});

	it("cleans up and writes an empty result when a signal wins", async () => {
		const session = new ReviewFeedbackSession(WORKING_TREE_SCOPE);
		const { dependencies, events, signals } = makeDependencies({
			openBrowser: vi.fn(async () => {
				throw new Error("browser unavailable");
			}),
		});
		const running = runReviewSession(session, dependencies);
		await Promise.resolve();
		await Promise.resolve();

		signals.emit("SIGINT");
		await running;

		expect(dependencies.writeStdout).toHaveBeenCalledWith(
			`${JSON.stringify(buildEmptyReviewFeedbackExport(WORKING_TREE_SCOPE), null, 2)}\n`,
		);
		expect(events).toEqual(["server closed", "database closed", "stdout written"]);
		expect(signals.listenerCount("SIGINT")).toBe(0);
		expect(signals.listenerCount("SIGTERM")).toBe(0);
	});

	it("closes the database when server shutdown fails", async () => {
		const session = new ReviewFeedbackSession(WORKING_TREE_SCOPE);
		const { dependencies, events, signals } = makeDependencies({
			closeServer: vi.fn(async () => {
				throw new Error("close failed");
			}),
		});
		const running = runReviewSession(session, dependencies);
		await Promise.resolve();
		signals.emit("SIGTERM");

		await expect(running).rejects.toThrow("close failed");
		expect(events).toEqual(["database closed"]);
	});
});
