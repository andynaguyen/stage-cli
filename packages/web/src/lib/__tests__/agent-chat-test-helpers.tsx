import { AGENT_PROVIDER } from "@stagereview/types/agent";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, vi } from "vitest";
import {
	abortAgentSession,
	createAgentSession,
	deleteAgentSession,
	getAgentCapabilities,
	respondToAgentPermission,
} from "../agent-api";
import {
	useAskAgentConfiguration,
	useAskAgentConversation,
	useAskAgentPanel,
	useOptionalAskAgentSelection,
} from "../agent-chat-context";
import { UserSettingsProvider } from "../user-settings-context";
import { makeAgentCapabilities } from "./agent-capability-fixtures";
import { makeUserSettings, mockSettingsRequests } from "./user-settings-test-helpers";

export const SESSION_ID = "123e4567-e89b-12d3-a456-426614174000";
export const TEST_FILE_NAVIGATION = { filePaths: [], onSelectFile: vi.fn() };
export const agentRenders = { selection: 0, configuration: 0 };

export function renderWithQueryClient(element: ReactElement) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	queryClient.setQueryData(["user-settings"], makeUserSettings());
	return render(
		<QueryClientProvider client={queryClient}>
			<UserSettingsProvider>{element}</UserSettingsProvider>
		</QueryClientProvider>,
	);
}

export function SelectionConsumer() {
	useOptionalAskAgentSelection();
	agentRenders.selection += 1;
	return null;
}

export function ConfigurationConsumer() {
	useAskAgentConfiguration();
	agentRenders.configuration += 1;
	return null;
}

export function FocusHarness() {
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

export function FileNavigationHarness() {
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

export function Harness() {
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
			<button type="button" onClick={() => selectServiceTier("priority")}>
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
	mockSettingsRequests();
	agentRenders.selection = 0;
	agentRenders.configuration = 0;
	vi.mocked(getAgentCapabilities).mockResolvedValue(makeAgentCapabilities());
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
	vi.unstubAllGlobals();
});
