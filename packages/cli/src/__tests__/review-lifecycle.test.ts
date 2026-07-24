import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { ReviewFeedbackSession } from "../review-feedback.js";
import { type ReviewSessionDependencies, runReviewSession } from "../review-lifecycle.js";

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
		const session = new ReviewFeedbackSession();
		const { dependencies, events, signals } = makeDependencies();
		const running = runReviewSession(session, dependencies);
		await Promise.resolve();

		await session.submit("# Stage Review Feedback\n", async () => {});
		await running;

		expect(dependencies.writeStderr).toHaveBeenCalledWith(
			"Listening on http://127.0.0.1:5391/runs/run-1\n",
		);
		expect(dependencies.writeStdout).toHaveBeenCalledWith("# Stage Review Feedback\n");
		expect(events).toEqual(["server closed", "database closed", "stdout written"]);
		expect(signals.listenerCount("SIGINT")).toBe(0);
		expect(signals.listenerCount("SIGTERM")).toBe(0);
	});

	it("cleans up without stdout when a signal wins", async () => {
		const session = new ReviewFeedbackSession();
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

		expect(dependencies.writeStdout).not.toHaveBeenCalled();
		expect(events).toEqual(["server closed", "database closed"]);
		expect(signals.listenerCount("SIGINT")).toBe(0);
		expect(signals.listenerCount("SIGTERM")).toBe(0);
	});

	it("closes the database when server shutdown fails", async () => {
		const session = new ReviewFeedbackSession();
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
