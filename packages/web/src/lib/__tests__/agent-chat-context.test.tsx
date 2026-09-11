// @vitest-environment happy-dom
import { AGENT_CAPABILITY_STATUS, AGENT_PROVIDER } from "@stagereview/types/agent";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
	createAgentSession,
	deleteAgentSession,
	getAgentCapabilities,
	streamAgentQuery,
} from "../agent-api";
import { AskAgentProvider } from "../agent-chat-context";
import {
	agentRenders,
	ConfigurationConsumer,
	FileNavigationHarness,
	FocusHarness,
	Harness,
	renderWithQueryClient,
	SESSION_ID,
	SelectionConsumer,
	TEST_FILE_NAVIGATION,
} from "./agent-chat-test-helpers";

vi.mock("../agent-api");

describe("AskAgentProvider", () => {
	it("does not rerender non-conversation consumers for streamed message updates", async () => {
		vi.mocked(streamAgentQuery).mockImplementation(
			async (_runId, _sessionId, _question, _selection, onEvent) => {
				onEvent({ type: "text_delta", text: "Streamed answer" });
				onEvent({ type: "turn_completed", outcome: "completed" });
			},
		);
		renderWithQueryClient(
			<AskAgentProvider runId="run-1" fileNavigation={TEST_FILE_NAVIGATION}>
				<Harness />
				<SelectionConsumer />
				<ConfigurationConsumer />
			</AskAgentProvider>,
		);
		await screen.findByText(AGENT_CAPABILITY_STATUS.AVAILABLE);
		const rendersBeforeStreaming = agentRenders.selection;
		const configurationRendersBeforeStreaming = agentRenders.configuration;

		fireEvent.click(screen.getByRole("button", { name: "Ask selection" }));

		await waitFor(() =>
			expect(screen.getByTestId("messages").textContent).toContain("Streamed answer"),
		);
		expect(agentRenders.selection).toBe(rendersBeforeStreaming);
		expect(agentRenders.configuration).toBe(configurationRendersBeforeStreaming);
	});

	it("focuses the composer when opening mounts it", async () => {
		renderWithQueryClient(
			<AskAgentProvider runId="run-1" fileNavigation={TEST_FILE_NAVIGATION}>
				<FocusHarness />
			</AskAgentProvider>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Open panel" }));

		const composer = await screen.findByRole("textbox", { name: "Agent question" });
		expect(document.activeElement).toBe(composer);
	});

	it("owns file navigation and closes the panel before selecting", () => {
		const onSelectFile = vi.fn();
		renderWithQueryClient(
			<AskAgentProvider
				runId="run-1"
				fileNavigation={{ filePaths: ["src/example.ts"], onSelectFile }}
			>
				<FileNavigationHarness />
			</AskAgentProvider>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Open panel" }));
		expect(screen.getByTestId("panel-state").textContent).toBe("open");
		expect(screen.getByTestId("file-paths").textContent).toBe("src/example.ts");

		fireEvent.click(screen.getByRole("button", { name: "Select file" }));
		expect(onSelectFile).toHaveBeenCalledWith("src/example.ts");
		expect(screen.getByTestId("panel-state").textContent).toBe("closed");
	});

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
		renderWithQueryClient(
			<AskAgentProvider runId="run-1" fileNavigation={TEST_FILE_NAVIGATION}>
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
		renderWithQueryClient(
			<AskAgentProvider runId="run-1" fileNavigation={TEST_FILE_NAVIGATION}>
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

	it("can retry capability detection after the local setup changes", async () => {
		vi.mocked(getAgentCapabilities).mockRejectedValueOnce(new Error("Codex is not ready"));
		renderWithQueryClient(
			<AskAgentProvider runId="run-1" fileNavigation={TEST_FILE_NAVIGATION}>
				<Harness />
			</AskAgentProvider>,
		);
		await screen.findByText(AGENT_CAPABILITY_STATUS.ERROR);

		fireEvent.click(screen.getByRole("button", { name: "Check again" }));

		await screen.findByText(AGENT_CAPABILITY_STATUS.AVAILABLE);
		expect(getAgentCapabilities).toHaveBeenCalledTimes(2);
	});

	it("creates a fresh configured session and keeps effort scoped per model", async () => {
		vi.mocked(streamAgentQuery).mockImplementation(
			async (_runId, _sessionId, _question, _selection, onEvent) => {
				onEvent({ type: "turn_completed", outcome: "completed" });
			},
		);
		renderWithQueryClient(
			<AskAgentProvider runId="run-1" fileNavigation={TEST_FILE_NAVIGATION}>
				<Harness />
			</AskAgentProvider>,
		);
		await screen.findByText(AGENT_CAPABILITY_STATUS.AVAILABLE);

		fireEvent.click(screen.getByRole("button", { name: "Select high effort" }));
		expect(screen.getByTestId("configuration").textContent).toBe("balanced-model:high:normal");
		fireEvent.click(screen.getByRole("button", { name: "Select fast model" }));
		expect(screen.getByTestId("configuration").textContent).toBe("fast-model:auto:normal");
		fireEvent.click(screen.getByRole("button", { name: "Select high effort" }));
		fireEvent.click(screen.getByRole("button", { name: "Enable fast tier" }));
		fireEvent.click(screen.getByRole("button", { name: "Ask selection" }));

		await waitFor(() => expect(createAgentSession).toHaveBeenCalledOnce());
		expect(createAgentSession).toHaveBeenCalledWith("run-1", {
			providerId: AGENT_PROVIDER.CODEX,
			model: "fast-model",
			reasoningEffort: "high",
			serviceTier: "priority",
		});

		fireEvent.click(screen.getByRole("button", { name: "Select balanced model" }));
		expect(screen.getByTestId("configuration").textContent).toBe("balanced-model:high:normal");
		await waitFor(() => expect(deleteAgentSession).toHaveBeenCalledWith("run-1", SESSION_ID));
	});
});
