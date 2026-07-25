// @vitest-environment happy-dom

import { AGENT_CAPABILITY_STATUS, AGENT_PROVIDER } from "@stagereview/types/agent";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAskAgent } from "@/lib/agent-chat-context";
import { AgentComposer } from "../agent-composer";

vi.mock("@/lib/agent-chat-context", () => ({
	useAskAgent: vi.fn(),
}));

const send = vi.fn<() => Promise<void>>();

beforeEach(() => {
	send.mockResolvedValue();
	vi.mocked(useAskAgent).mockReturnValue({
		isOpen: true,
		capability: {
			providerId: AGENT_PROVIDER.CODEX,
			label: "Codex",
			status: AGENT_CAPABILITY_STATUS.AVAILABLE,
			detail: "Codex is ready",
			models: [],
		},
		isCapabilityLoading: false,
		messages: [],
		pendingSelection: null,
		pendingPermissions: [],
		clearSelection: vi.fn(),
		isStreaming: false,
		focusRequest: 0,
		models: [],
		selectedModel: null,
		reasoningEffort: null,
		serviceTier: null,
		open: vi.fn(),
		close: vi.fn(),
		openWithSelection: vi.fn(),
		refreshCapability: vi.fn(),
		selectModel: vi.fn(),
		selectReasoningEffort: vi.fn(),
		selectServiceTier: vi.fn(),
		send,
		stop: vi.fn(),
		reset: vi.fn(),
		respondToPermission: vi.fn(),
	});
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("AgentComposer", () => {
	it("submits with Enter and reserves Shift+Enter for a newline", () => {
		render(<AgentComposer />);
		const composer = screen.getByPlaceholderText("Ask about this review…");

		fireEvent.change(composer, { target: { value: "Explain this change" } });
		fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
		expect(send).not.toHaveBeenCalled();

		fireEvent.keyDown(composer, { key: "Enter" });
		expect(send).toHaveBeenCalledWith("Explain this change");
		expect(composer).toHaveProperty("value", "");
	});
});
