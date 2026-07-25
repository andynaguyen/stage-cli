import { EventEmitter } from "node:events";
import {
	type ReviewFeedbackExport,
	ReviewFeedbackExportSchema,
} from "@stagereview/types/review-feedback";
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

const REVIEW_EXIT_SIGNAL = {
	INTERRUPT: "SIGINT",
	TERMINATE: "SIGTERM",
} as const;

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
	stderr: string[];
	stdout: string[];
} {
	const events: string[] = [];
	const signals = new EventEmitter();
	const stderr: string[] = [];
	const stdout: string[] = [];
	return {
		events,
		signals,
		stderr,
		stdout,
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
			writeStdout: vi.fn((text) => {
				stdout.push(text);
				events.push("stdout written");
			}),
			writeStderr: vi.fn((text) => {
				stderr.push(text);
			}),
			...over,
		},
	};
}

describe("runReviewSession", () => {
	it("closes resources and writes feedback when submission wins", async () => {
		const session = new ReviewFeedbackSession(WORKING_TREE_SCOPE);
		const { dependencies, events, signals, stderr, stdout } = makeDependencies();
		const running = runReviewSession(session, dependencies);
		await Promise.resolve();

		await session.complete(makeResult(), async () => {});
		await running;

		expect(stderr).toEqual([
			"Listening on http://127.0.0.1:5391/runs/run-1\n",
			"Press Ctrl+C to exit without submitting feedback.\n",
		]);
		expect(stdout).toHaveLength(1);
		const serializedFeedback = stdout.join("");
		expect(serializedFeedback).not.toContain("Listening on");
		expect(serializedFeedback).not.toContain("Press Ctrl+C");
		expect(ReviewFeedbackExportSchema.parse(JSON.parse(serializedFeedback))).toEqual(makeResult());
		expect(events).toEqual(["server closed", "database closed", "stdout written"]);
		expect(signals.listenerCount("SIGINT")).toBe(0);
		expect(signals.listenerCount("SIGTERM")).toBe(0);
	});

	it.each(
		Object.values(REVIEW_EXIT_SIGNAL),
	)("cleans up and writes an empty result when %s wins", async (signal) => {
		const session = new ReviewFeedbackSession(WORKING_TREE_SCOPE);
		const { dependencies, events, signals, stdout } = makeDependencies({
			openBrowser: vi.fn(async () => {
				throw new Error("browser unavailable");
			}),
		});
		const running = runReviewSession(session, dependencies);
		await Promise.resolve();
		await Promise.resolve();

		signals.emit(signal);
		await running;

		expect(stdout).toHaveLength(1);
		expect(ReviewFeedbackExportSchema.parse(JSON.parse(stdout.join("")))).toEqual(
			buildEmptyReviewFeedbackExport(WORKING_TREE_SCOPE),
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
		signals.emit(REVIEW_EXIT_SIGNAL.TERMINATE);

		await expect(running).rejects.toThrow("close failed");
		expect(events).toEqual(["database closed"]);
	});
});
