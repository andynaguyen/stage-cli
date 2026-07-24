// @vitest-environment happy-dom

import { AGENT_CAPABILITY_STATUS, AGENT_PROVIDER } from "@stagereview/types/agent";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	abortAgentSession,
	createAgentSession,
	deleteAgentSession,
	getAgentCapabilities,
	respondToAgentPermission,
	streamAgentQuery,
} from "../agent-api";
import { AskAgentProvider, useAskAgent } from "../agent-chat-context";

vi.mock("../agent-api", () => ({
	abortAgentSession: vi.fn(),
	createAgentSession: vi.fn(),
	deleteAgentSession: vi.fn(),
	getAgentCapabilities: vi.fn(),
	respondToAgentPermission: vi.fn(),
	streamAgentQuery: vi.fn(),
}));

const SESSION_ID = "123e4567-e89b-12d3-a456-426614174000";

function Harness() {
	const { capability, messages, openWithSelection, send } = useAskAgent();
	return (
		<>
			<span>{capability?.status ?? "loading"}</span>
			<button
				type="button"
				onClick={() => {
					void send("First question");
					void send("Second question");
				}}
			>
				Send twice
			</button>
			<button
				type="button"
				onClick={() =>
					openWithSelection({
						filePath: "src/auth.ts",
						side: "additions",
						startLine: 12,
						endLine: 14,
						selectedText: "if (!token) return;",
					})
				}
			>
				Select code
			</button>
			<button type="button" onClick={() => void send("Why is this guard here?")}>
				Ask selection
			</button>
			<output data-testid="messages">
				{JSON.stringify(
					messages.map(({ role, content, selection }) => ({ role, content, selection })),
				)}
			</output>
		</>
	);
}

beforeEach(() => {
	vi.mocked(getAgentCapabilities).mockResolvedValue({
		providers: [
			{
				providerId: AGENT_PROVIDER.CODEX,
				label: "Codex",
				status: AGENT_CAPABILITY_STATUS.AVAILABLE,
				detail: "Codex CLI 0.144.6",
			},
		],
	});
	vi.mocked(createAgentSession).mockResolvedValue({
		sessionId: SESSION_ID,
		providerId: AGENT_PROVIDER.CODEX,
	});
	vi.mocked(abortAgentSession).mockResolvedValue();
	vi.mocked(deleteAgentSession).mockResolvedValue();
	vi.mocked(respondToAgentPermission).mockResolvedValue();
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("AskAgentProvider", () => {
	it("prevents two turns from starting in the same render", async () => {
		let completeStream: (() => void) | null = null;
		vi.mocked(streamAgentQuery).mockImplementation(
			(_runId, _sessionId, _question, _selection, onEvent) =>
				new Promise((resolve) => {
					completeStream = () => {
						onEvent({ type: "turn_completed", outcome: "completed" });
						resolve();
					};
				}),
		);
		render(
			<AskAgentProvider runId="run-1">
				<Harness />
			</AskAgentProvider>,
		);
		await screen.findByText(AGENT_CAPABILITY_STATUS.AVAILABLE);

		fireEvent.click(screen.getByRole("button", { name: "Send twice" }));
		await waitFor(() => expect(streamAgentQuery).toHaveBeenCalledOnce());

		expect(screen.getByTestId("messages").textContent).toContain("First question");
		expect(screen.getByTestId("messages").textContent).not.toContain("Second question");
		expect(createAgentSession).toHaveBeenCalledOnce();

		await act(async () => {
			completeStream?.();
		});
	});

	it("passes the exact selected diff context into the next turn", async () => {
		vi.mocked(streamAgentQuery).mockImplementation(
			async (_runId, _sessionId, _question, _selection, onEvent) => {
				onEvent({ type: "turn_completed", outcome: "completed" });
			},
		);
		render(
			<AskAgentProvider runId="run-1">
				<Harness />
			</AskAgentProvider>,
		);
		await screen.findByText(AGENT_CAPABILITY_STATUS.AVAILABLE);

		fireEvent.click(screen.getByRole("button", { name: "Select code" }));
		fireEvent.click(screen.getByRole("button", { name: "Ask selection" }));
		await waitFor(() => expect(streamAgentQuery).toHaveBeenCalledOnce());

		expect(vi.mocked(streamAgentQuery).mock.calls[0]?.slice(0, 5)).toEqual([
			"run-1",
			SESSION_ID,
			"Why is this guard here?",
			{
				filePath: "src/auth.ts",
				side: "additions",
				startLine: 12,
				endLine: 14,
				selectedText: "if (!token) return;",
			},
			expect.any(Function),
		]);
		expect(screen.getByTestId("messages").textContent).toContain("src/auth.ts");
	});
});
