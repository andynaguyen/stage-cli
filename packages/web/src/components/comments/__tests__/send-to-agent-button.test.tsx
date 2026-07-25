// @vitest-environment happy-dom

import type { Comment, CommentThread } from "@stagereview/types/comments";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components/ui/sonner";
import { makeWrapper } from "@/lib/__tests__/fixtures";
import { CommentThreadsProvider } from "@/lib/comment-threads-context";
import { SendToAgentButton } from "../send-to-agent-button";

vi.mock("@/components/ui/sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

function makeComment(id: string, body: string): Comment {
	return {
		id,
		body,
		authorId: "local",
		createdAt: "2026-07-24T10:00:00.000Z",
		updatedAt: "2026-07-24T10:00:00.000Z",
	};
}

function makeThread(over: Partial<CommentThread> = {}): CommentThread {
	return {
		id: "thread-1",
		filePath: "src/example.ts",
		side: "additions",
		startLine: 4,
		endLine: 4,
		resolvedAt: null,
		createdAt: "2026-07-24T10:00:00.000Z",
		updatedAt: "2026-07-24T10:00:00.000Z",
		comments: [makeComment("comment-1", "Please change this")],
		...over,
	};
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function noContentResponse(): Response {
	return new Response(null, { status: 204 });
}
function renderButton(
	threads: CommentThread[],
	submit: () => Promise<Response>,
	onSelectThread = vi.fn(),
) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = input.toString();
			if ((init?.method ?? "GET") === "POST" && url.endsWith("/feedback")) return submit();
			return jsonResponse(threads);
		}),
	);
	const { Wrapper } = makeWrapper();
	return render(
		<CommentThreadsProvider runId="run-1">
			<SendToAgentButton onSelectThread={onSelectThread} />
		</CommentThreadsProvider>,
		{ wrapper: Wrapper },
	);
}
function postCount(): number {
	return vi.mocked(fetch).mock.calls.filter(([, init]) => (init?.method ?? "GET") === "POST")
		.length;
}
describe("SendToAgentButton", () => {
	it("disables the action when no unresolved threads exist", async () => {
		renderButton([makeThread({ resolvedAt: "2026-07-24T11:00:00.000Z" })], async () =>
			noContentResponse(),
		);
		const button = await screen.findByRole("button", { name: "Send to Agent" });
		expect(button.hasAttribute("disabled")).toBe(true);
	});

	it("previews every comment from unresolved threads without submitting", async () => {
		renderButton(
			[
				makeThread({
					startLine: 4,
					endLine: 6,
					comments: [
						makeComment("comment-1", "Please change this"),
						makeComment("comment-2", "Also update the test"),
					],
				}),
				makeThread({
					id: "thread-2",
					filePath: "src/other.ts",
					comments: [makeComment("comment-3", "Handle the empty state")],
				}),
				makeThread({
					id: "thread-3",
					resolvedAt: "2026-07-24T11:00:00.000Z",
					comments: [makeComment("comment-4", "This is already resolved")],
				}),
			],
			async () => noContentResponse(),
		);
		const trigger = await screen.findByRole("button", { name: "Send to Agent" });
		fireEvent.click(trigger);

		expect(await screen.findByText("Comments")).toBeTruthy();
		expect(screen.getByText("3")).toBeTruthy();
		expect(screen.getByText("Please change this")).toBeTruthy();
		expect(screen.getByText("Also update the test")).toBeTruthy();
		expect(screen.getByText("Handle the empty state")).toBeTruthy();
		expect(screen.getAllByText("L4-6")).toHaveLength(2);
		expect(screen.getByText("L4")).toBeTruthy();
		expect(screen.queryByText("This is already resolved")).toBeNull();
		expect(postCount()).toBe(0);
	});

	it("selects an unresolved thread from its preview", async () => {
		const onSelectThread = vi.fn();
		renderButton([makeThread()], async () => noContentResponse(), onSelectThread);
		fireEvent.click(await screen.findByRole("button", { name: "Send to Agent" }));
		fireEvent.click(await screen.findByRole("button", { name: "Go to src/example.ts, L4" }));

		expect(onSelectThread).toHaveBeenCalledWith("thread-1");
		expect(screen.queryByText("Comments")).toBeNull();
		expect(postCount()).toBe(0);
	});

	it("cancels without submitting", async () => {
		renderButton([makeThread()], async () => noContentResponse());
		const trigger = await screen.findByRole("button", { name: "Send to Agent" });
		fireEvent.click(trigger);
		await screen.findByText("Comments");

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		await waitFor(() => expect(screen.queryByText("Comments")).toBeNull());
		expect(postCount()).toBe(0);
	});

	it("keeps CTAs stable, closes the popover, and toasts after success", async () => {
		let finishSubmission = (_response: Response) => {};
		const pending = new Promise<Response>((resolve) => {
			finishSubmission = resolve;
		});
		renderButton([makeThread()], () => pending);
		const trigger = await screen.findByRole("button", { name: "Send to Agent" });
		fireEvent.click(trigger);
		await screen.findByText("Comments");
		const confirm = screen.getByRole("button", { name: "Submit" });

		fireEvent.click(confirm);
		await waitFor(() => expect(confirm.hasAttribute("disabled")).toBe(true));
		expect(confirm.textContent).toContain("Submit");
		expect(trigger.textContent).toContain("Send to Agent");

		finishSubmission(noContentResponse());
		await waitFor(() => expect(screen.queryByText("Comments")).toBeNull());
		expect(trigger.textContent).toContain("Send to Agent");
		expect(trigger.hasAttribute("disabled")).toBe(true);
		expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Comments sent to agent");

		fireEvent.click(trigger);
		expect(postCount()).toBe(1);
	});

	it("keeps the confirmation open with a recoverable error and allows retry", async () => {
		let submissions = 0;
		renderButton([makeThread()], async () => {
			submissions += 1;
			return submissions === 1 ? jsonResponse({ error: "failed" }, 500) : noContentResponse();
		});
		const trigger = await screen.findByRole("button", { name: "Send to Agent" });
		fireEvent.click(trigger);
		await screen.findByText("Comments");
		const confirm = screen.getByRole("button", { name: "Submit" });

		fireEvent.click(confirm);
		expect(await screen.findByRole("alert")).toBeTruthy();
		expect(confirm.hasAttribute("disabled")).toBe(false);

		fireEvent.click(confirm);
		await waitFor(() => expect(screen.queryByText("Comments")).toBeNull());
		expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Comments sent to agent");
		expect(submissions).toBe(2);
	});
});
