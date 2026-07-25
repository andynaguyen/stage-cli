// @vitest-environment happy-dom

import type { AgentModel } from "@stagereview/types/agent";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentModelControls } from "../agent-model-controls";

const balancedModel: AgentModel = {
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
};

const fastModel: AgentModel = {
	id: "fast-model",
	label: "Fast model",
	description: "Fast model",
	isDefault: false,
	reasoningEfforts: [{ id: "medium", label: "Medium", description: "Balanced reasoning" }],
	defaultReasoningEffort: "medium",
	serviceTiers: [{ id: "priority", label: "Fast", description: "Lower latency", kind: "fast" }],
	defaultServiceTier: null,
};

const models = [balancedModel, fastModel];

afterEach(cleanup);

function renderControls(model: AgentModel, serviceTier: string | null = null) {
	const onServiceTierChange = vi.fn();
	const view = render(
		<AgentModelControls
			providerLabel="Codex"
			models={models}
			selectedModel={model}
			reasoningEffort={null}
			serviceTier={serviceTier}
			onModelChange={vi.fn()}
			onReasoningEffortChange={vi.fn()}
			onServiceTierChange={onServiceTierChange}
		/>,
	);
	return { ...view, onServiceTierChange };
}

describe("AgentModelControls", () => {
	it("shows controls supported by the selected model", () => {
		const { rerender } = renderControls(balancedModel);

		expect(screen.getByRole("combobox", { name: "Agent model" }).textContent).toContain(
			"Balanced model",
		);
		expect(screen.getByRole("combobox", { name: "Reasoning effort" }).textContent).toContain(
			"Auto",
		);
		expect(screen.queryByRole("switch", { name: "Fast service tier" })).toBeNull();

		rerender(
			<AgentModelControls
				providerLabel="Codex"
				models={models}
				selectedModel={fastModel}
				reasoningEffort="medium"
				serviceTier={null}
				onModelChange={vi.fn()}
				onReasoningEffortChange={vi.fn()}
				onServiceTierChange={vi.fn()}
			/>,
		);
		expect(screen.getByRole("combobox", { name: "Reasoning effort" }).textContent).toContain(
			"Medium",
		);
		expect(screen.getByRole("switch", { name: "Fast service tier" }).dataset.state).toBe(
			"unchecked",
		);
	});

	it("maps the Fast toggle to the provider tier id", () => {
		const { onServiceTierChange } = renderControls(fastModel);

		fireEvent.click(screen.getByRole("switch", { name: "Fast service tier" }));

		expect(onServiceTierChange).toHaveBeenCalledWith("priority");
	});

	it("falls back to provider identity when discovery is unavailable", () => {
		renderControls(balancedModel).rerender(
			<AgentModelControls
				providerLabel="Codex"
				models={[]}
				selectedModel={null}
				reasoningEffort={null}
				serviceTier={null}
				onModelChange={vi.fn()}
				onReasoningEffortChange={vi.fn()}
				onServiceTierChange={vi.fn()}
			/>,
		);

		expect(screen.getByText("Codex")).not.toBeNull();
		expect(screen.queryByRole("combobox")).toBeNull();
	});
});
