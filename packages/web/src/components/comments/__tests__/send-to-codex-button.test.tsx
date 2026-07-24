// @vitest-environment happy-dom

import type { Comment, CommentThread } from "@stagereview/types/comments";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components/ui/sonner";
import { makeWrapper } from "@/lib/__tests__/fixtures";
import { CommentThreadsProvider } from "@/lib/comment-threads-context";
import { SendToCodexButton } from "../send-to-codex-button";

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

function renderButton(threads: CommentThread[], submit: () => Promise<Response>) {
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
			<SendToCodexButton />
		</CommentThreadsProvider>,
		{ wrapper: Wrapper },
	);
}

function postCount(): number {
	return vi.mocked(fetch).mock.calls.filter(([, init]) => (init?.method ?? "GET") === "POST")
		.length;
}

function getConfirmationButton(trigger: HTMLElement): HTMLElement {
	const confirm = screen
		.getAllByRole("button", { name: "Send to Codex" })
		.find((button) => button !== trigger);
	if (confirm === undefined) throw new Error("Send confirmation button was not rendered");
	return confirm;
}

describe("SendToCodexButton", () => {
	it("disables the action when no unresolved threads exist", async () => {
		renderButton([makeThread({ resolvedAt: "2026-07-24T11:00:00.000Z" })], async () =>
			noContentResponse(),
		);

		const button = await screen.findByRole("button", { name: "Send to Codex" });
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

		const trigger = await screen.findByRole("button", { name: "Send to Codex" });

		fireEvent.click(trigger);

		expect(await screen.findByText("Send review to Codex")).toBeTruthy();
		expect(
			screen.queryByText("Codex will receive every unresolved comment thread in this review."),
		).toBeNull();
		expect(screen.queryByText("Stage closes after they are sent.")).toBeNull();
		expect(screen.queryByText("Pending comments")).toBeNull();

		const commentsTrigger = screen.getByRole("button", { name: "Expand comments (3)" });
		expect(within(commentsTrigger).getByText("Comments")).toBeTruthy();
		expect(within(commentsTrigger).getByText("3")).toBeTruthy();
		expect(screen.queryByText("Please change this")).toBeNull();

		fireEvent.click(commentsTrigger);

		expect(screen.getByRole("button", { name: "Collapse comments (3)" })).toBeTruthy();
		expect(screen.getByText("Please change this")).toBeTruthy();
		expect(screen.getByText("Also update the test")).toBeTruthy();
		expect(screen.getByText("Handle the empty state")).toBeTruthy();
		expect(screen.getByText("Lines 4–6")).toBeTruthy();
		expect(screen.queryByText("This is already resolved")).toBeNull();

		const cancel = screen.getByRole("button", { name: "Cancel" });
		expect(cancel.parentElement?.className).toContain("justify-between");
		expect(cancel.parentElement?.firstElementChild).toBe(cancel);
		expect(postCount()).toBe(0);
	});

	it("cancels without submitting", async () => {
		renderButton([makeThread()], async () => noContentResponse());
		const trigger = await screen.findByRole("button", { name: "Send to Codex" });
		fireEvent.click(trigger);
		await screen.findByText("Send review to Codex");

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		await waitFor(() => expect(screen.queryByText("Send review to Codex")).toBeNull());
		expect(postCount()).toBe(0);
	});

	it("keeps CTAs stable, closes the popover, and toasts after success", async () => {
		let finishSubmission = (_response: Response) => {};
		const pending = new Promise<Response>((resolve) => {
			finishSubmission = resolve;
		});
		renderButton([makeThread()], () => pending);
		const trigger = await screen.findByRole("button", { name: "Send to Codex" });
		fireEvent.click(trigger);
		await screen.findByText("Send review to Codex");
		const confirm = getConfirmationButton(trigger);

		fireEvent.click(confirm);
		await waitFor(() => expect(confirm.hasAttribute("disabled")).toBe(true));
		expect(confirm.textContent).toContain("Send to Codex");
		expect(trigger.textContent).toContain("Send to Codex");
		expect(screen.queryByText("Sending…")).toBeNull();
		expect(confirm.hasAttribute("disabled")).toBe(true);

		finishSubmission(noContentResponse());
		await waitFor(() => expect(screen.queryByText("Send review to Codex")).toBeNull());
		expect(trigger.textContent).toContain("Send to Codex");
		expect(trigger.hasAttribute("disabled")).toBe(true);
		expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Comments sent to Codex");

		fireEvent.click(trigger);
		expect(postCount()).toBe(1);
	});

	it("keeps the confirmation open with a recoverable error and allows retry", async () => {
		let submissions = 0;
		renderButton([makeThread()], async () => {
			submissions += 1;
			return submissions === 1 ? jsonResponse({ error: "failed" }, 500) : noContentResponse();
		});
		const trigger = await screen.findByRole("button", { name: "Send to Codex" });
		fireEvent.click(trigger);
		await screen.findByText("Send review to Codex");
		const confirm = getConfirmationButton(trigger);

		fireEvent.click(confirm);
		expect(await screen.findByRole("alert")).toBeTruthy();
		expect(confirm.hasAttribute("disabled")).toBe(false);

		fireEvent.click(confirm);
		await waitFor(() => expect(screen.queryByText("Send review to Codex")).toBeNull());
		expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Comments sent to Codex");
		expect(submissions).toBe(2);
	});
});
