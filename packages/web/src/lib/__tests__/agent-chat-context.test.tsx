// @vitest-environment happy-dom

import { AGENT_CAPABILITY_STATUS, AGENT_PROVIDER } from "@stagereview/types/agent";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	abortAgentSession,
	createAgentSession,
	deleteAgentSession,
	getAgentCapabilities,
	respondToAgentPermission,
	streamAgentQuery,
} from "../agent-api";
import {
	AskAgentProvider,
	useAskAgentConfiguration,
	useAskAgentConversation,
	useAskAgentPanel,
	useOptionalAskAgentSelection,
} from "../agent-chat-context";

vi.mock("../agent-api", () => ({
	abortAgentSession: vi.fn(),
	createAgentSession: vi.fn(),
	deleteAgentSession: vi.fn(),
	getAgentCapabilities: vi.fn(),
	respondToAgentPermission: vi.fn(),
	streamAgentQuery: vi.fn(),
}));

const SESSION_ID = "123e4567-e89b-12d3-a456-426614174000";
const TEST_FILE_NAVIGATION = { filePaths: [], onSelectFile: vi.fn() };
let selectionConsumerRenders = 0;
let configurationConsumerRenders = 0;

function renderWithQueryClient(element: ReactElement) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
}

function SelectionConsumer() {
	useOptionalAskAgentSelection();
	selectionConsumerRenders += 1;
	return null;
}

function ConfigurationConsumer() {
	useAskAgentConfiguration();
	configurationConsumerRenders += 1;
	return null;
}

function FocusHarness() {
	const { isOpen, open, composerRef } = useAskAgentPanel();
	return (
		<>
			<button type="button" onClick={open}>
				Open panel
			</button>
			{isOpen && <textarea ref={composerRef} aria-label="Agent question" />}
		</>
	);
}

function FileNavigationHarness() {
	const { fileNavigation } = useAskAgentConversation();
	const { isOpen, open } = useAskAgentPanel();
	return (
		<>
			<button type="button" onClick={open}>
				Open panel
			</button>
			<button type="button" onClick={() => fileNavigation.onSelectFile("src/example.ts")}>
				Select file
			</button>
			<output data-testid="panel-state">{isOpen ? "open" : "closed"}</output>
			<output data-testid="file-paths">{fileNavigation.filePaths.join(",")}</output>
		</>
	);
}

function Harness() {
	const {
		capability,
		refreshCapability,
		reasoningEffort,
		selectedModel,
		selectModel,
		selectReasoningEffort,
		selectServiceTier,
		serviceTier,
	} = useAskAgentConfiguration();
	const { messages, send } = useAskAgentConversation();
	const { openWithSelection } = useAskAgentPanel();
	return (
		<>
			<span>{capability?.status ?? "loading"}</span>
			<span data-testid="configuration">
				{selectedModel?.id ?? "default"}:{reasoningEffort ?? "auto"}:{serviceTier ?? "normal"}
			</span>
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
			<button type="button" onClick={refreshCapability}>
				Check again
			</button>
			<button type="button" onClick={() => selectModel("fast-model")}>
				Select fast model
			</button>
			<button type="button" onClick={() => selectModel("balanced-model")}>
				Select balanced model
			</button>
			<button type="button" onClick={() => selectReasoningEffort("high")}>
				Select high effort
			</button>
			<button type="button" onClick={() => selectServiceTier("fast")}>
				Enable fast tier
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
	selectionConsumerRenders = 0;
	configurationConsumerRenders = 0;
	vi.mocked(getAgentCapabilities).mockResolvedValue({
		providers: [
			{
				providerId: AGENT_PROVIDER.CODEX,
				label: "Codex",
				status: AGENT_CAPABILITY_STATUS.AVAILABLE,
				detail: "Codex CLI 0.144.6",
				models: [
					{
						id: "balanced-model",
						label: "Balanced model",
						description: "Balanced model",
						isDefault: true,
						reasoningEfforts: [
							{ id: "low", label: "Low", description: "Lower latency" },
							{ id: "high", label: "High", description: "More reasoning" },
						],
						defaultReasoningEffort: "low",
						serviceTiers: [],
						defaultServiceTier: null,
					},
					{
						id: "fast-model",
						label: "Fast model",
						description: "Fast model",
						isDefault: false,
						reasoningEfforts: [{ id: "high", label: "High", description: "More reasoning" }],
						defaultReasoningEffort: "high",
						serviceTiers: [
							{
								id: "priority",
								label: "Fast",
								description: "Lower latency",
								kind: "fast",
							},
						],
						defaultServiceTier: null,
					},
				],
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
		const rendersBeforeStreaming = selectionConsumerRenders;
		const configurationRendersBeforeStreaming = configurationConsumerRenders;

		fireEvent.click(screen.getByRole("button", { name: "Ask selection" }));

		await waitFor(() =>
			expect(screen.getByTestId("messages").textContent).toContain("Streamed answer"),
		);
		expect(selectionConsumerRenders).toBe(rendersBeforeStreaming);
		expect(configurationConsumerRenders).toBe(configurationRendersBeforeStreaming);
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
			serviceTier: "fast",
		});

		fireEvent.click(screen.getByRole("button", { name: "Select balanced model" }));
		expect(screen.getByTestId("configuration").textContent).toBe("balanced-model:high:normal");
		await waitFor(() => expect(deleteAgentSession).toHaveBeenCalledWith("run-1", SESSION_ID));
	});
});
