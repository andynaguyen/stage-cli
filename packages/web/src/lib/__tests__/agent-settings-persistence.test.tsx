// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
	AskAgentProvider,
	useAskAgentConfiguration,
	useAskAgentConversation,
} from "../agent-chat-context";
import { makeAgentCapabilities } from "./agent-capability-fixtures";
import {
	createSettingsWrapper,
	makeUserSettings,
	mockSettingsRequests,
} from "./user-settings-test-helpers";

function Controls() {
	const {
		selectedModel,
		reasoningEffort,
		serviceTier,
		selectModel,
		selectReasoningEffort,
		selectServiceTier,
	} = useAskAgentConfiguration();
	const { send, reset } = useAskAgentConversation();
	return (
		<>
			<output>
				{selectedModel?.id}:{reasoningEffort}:{serviceTier}
			</output>
			<button type="button" onClick={() => selectModel("fast-model")}>
				Model
			</button>
			<button type="button" onClick={() => selectReasoningEffort("high")}>
				Effort
			</button>
			<button type="button" onClick={() => selectServiceTier("priority")}>
				Speed
			</button>
			<button type="button" onClick={reset}>
				New chat
			</button>
			<button type="button" onClick={() => void send("Explain this change")}>
				Send
			</button>
		</>
	);
}

function renderChat(runId: string) {
	return render(
		<AskAgentProvider runId={runId} fileNavigation={{ filePaths: [], onSelectFile: vi.fn() }}>
			<Controls />
		</AskAgentProvider>,
		{ wrapper: createSettingsWrapper() },
	);
}

function setup(initial = makeUserSettings()) {
	const settingsFetch = mockSettingsRequests(initial);
	const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
		if (url === "/api/user-settings") return settingsFetch(url, init);
		if (url.endsWith("/capabilities")) return Response.json(makeAgentCapabilities());
		if (url.endsWith("/sessions"))
			return Response.json({
				sessionId: "123e4567-e89b-12d3-a456-426614174000",
				providerId: "codex",
			});
		if (url.endsWith("/query"))
			return new Response('data: {"type":"turn_completed","outcome":"completed"}\n\n');
		return Response.json({});
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

it("reuses model, effort, and speed for a different review and a new chat", async () => {
	const fetchMock = setup();
	const first = renderChat("first-review");
	await screen.findByText("balanced-model::");
	fireEvent.click(screen.getByText("Model"));
	fireEvent.click(screen.getByText("Effort"));
	fireEvent.click(screen.getByText("Speed"));
	await waitFor(() =>
		expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(3),
	);
	first.unmount();

	renderChat("second-review");
	await screen.findByText("fast-model:high:priority");
	fireEvent.click(screen.getByText("New chat"));
	fireEvent.click(screen.getByText("Send"));
	await waitFor(() =>
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/runs/second-review/agent/sessions",
			expect.objectContaining({
				body: JSON.stringify({
					providerId: "codex",
					model: "fast-model",
					reasoningEffort: "high",
					serviceTier: "priority",
				}),
			}),
		),
	);
});

it.each([
	{ model: "removed-model", reasoningEffort: "ultra", serviceTier: "removed-tier" },
	{ model: "balanced-model", reasoningEffort: "ultra", serviceTier: "priority" },
])("uses supported defaults when saved options are unavailable: %j", async (configuration) => {
	const fetchMock = setup(makeUserSettings({ agent: { providerId: "codex", ...configuration } }));
	renderChat("review");
	await screen.findByText("balanced-model::");
	fireEvent.click(screen.getByText("Send"));

	await waitFor(() =>
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/runs/review/agent/sessions",
			expect.objectContaining({
				body: JSON.stringify({ providerId: "codex", model: "balanced-model" }),
			}),
		),
	);
});
