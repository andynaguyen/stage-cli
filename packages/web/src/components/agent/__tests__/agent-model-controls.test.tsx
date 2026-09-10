// @vitest-environment happy-dom

import type { AgentModel } from "@stagereview/types/agent";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentModelControls } from "../agent-model-controls";

const balancedModel: AgentModel = {
	id: "balanced-model",
	label: "GPT-5.6-Sol",
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
	label: "GPT-5.6-Terra",
	description: "Fast model",
	isDefault: false,
	reasoningEfforts: [{ id: "medium", label: "Medium", description: "Balanced reasoning" }],
	defaultReasoningEffort: "medium",
	serviceTiers: [
		{ id: "priority", label: "Fast", description: "Lower latency", kind: "fast" },
		{ id: "economy", label: "Economy", description: "Lower usage", kind: "other" },
	],
	defaultServiceTier: null,
};

const models = [balancedModel, fastModel];

afterEach(cleanup);

function renderControls(model: AgentModel, serviceTier: string | null = null) {
	const onModelChange = vi.fn();
	const onReasoningEffortChange = vi.fn();
	const onServiceTierChange = vi.fn();
	const view = render(
		<AgentModelControls
			providerLabel="Codex"
			models={models}
			selectedModel={model}
			reasoningEffort={null}
			serviceTier={serviceTier}
			onModelChange={onModelChange}
			onReasoningEffortChange={onReasoningEffortChange}
			onServiceTierChange={onServiceTierChange}
		/>,
	);
	return {
		...view,
		onModelChange,
		onReasoningEffortChange,
		onServiceTierChange,
	};
}

function openSettingsMenu() {
	fireEvent.click(screen.getByRole("button", { name: "Choose model, effort, and speed" }));
}

describe("AgentModelControls", () => {
	it("combines the selected model and effective effort in one control", () => {
		const { rerender } = renderControls(balancedModel);

		const trigger = screen.getByRole("button", { name: "Choose model, effort, and speed" });
		expect(trigger.textContent).toContain("5.6 Sol");
		expect(trigger.textContent).toContain("Low");
		expect(screen.queryByRole("button", { name: "Choose agent model" })).toBeNull();
		openSettingsMenu();
		expect(screen.queryByRole("button", { name: "Choose agent speed" })).toBeNull();
		fireEvent.click(trigger);

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
		expect(trigger.textContent).toContain("5.6 Terra");
		expect(trigger.textContent).toContain("Medium");
	});

	it("drills into Model in place and returns to the root menu", () => {
		const { onModelChange } = renderControls(balancedModel);

		openSettingsMenu();

		expect(document.body.style.overflow).toBe("");
		expect(screen.queryByText("Advanced")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Choose agent model" }));
		expect(screen.getByRole("button", { name: "Back to agent settings" }).textContent).toContain(
			"Model",
		);
		expect(screen.queryByRole("button", { name: "Choose reasoning effort" })).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Use GPT-5.6-Terra" }));
		expect(onModelChange).toHaveBeenCalledWith("fast-model");
		expect(screen.getByRole("button", { name: "Back to agent settings" })).not.toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Back to agent settings" }));
		expect(screen.getByRole("button", { name: "Choose reasoning effort" })).not.toBeNull();
	});

	it("selects explicit efforts and maps the model default back to provider control", () => {
		const { onReasoningEffortChange } = renderControls(balancedModel);

		openSettingsMenu();
		fireEvent.click(screen.getByRole("button", { name: "Choose reasoning effort" }));
		fireEvent.click(screen.getByRole("button", { name: "Use High reasoning" }));
		expect(onReasoningEffortChange).toHaveBeenCalledWith("high");

		fireEvent.click(screen.getByRole("button", { name: "Use Low reasoning" }));
		expect(onReasoningEffortChange).toHaveBeenLastCalledWith(null);
	});

	it("maps every discovered speed option to its provider tier id", () => {
		const { onServiceTierChange } = renderControls(fastModel);

		openSettingsMenu();
		fireEvent.click(screen.getByRole("button", { name: "Choose agent speed" }));
		fireEvent.click(screen.getByRole("button", { name: "Use fast speed" }));
		expect(onServiceTierChange).toHaveBeenCalledWith("priority");

		fireEvent.click(screen.getByRole("button", { name: "Use economy speed" }));
		expect(onServiceTierChange).toHaveBeenLastCalledWith("economy");

		fireEvent.click(screen.getByRole("button", { name: "Use standard speed" }));
		expect(onServiceTierChange).toHaveBeenLastCalledWith(null);
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
		expect(screen.queryByRole("button", { name: "Choose model, effort, and speed" })).toBeNull();
	});
});
