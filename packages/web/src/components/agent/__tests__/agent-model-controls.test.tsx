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

describe("AgentModelControls", () => {
	it("shows compact controls supported by the selected model", () => {
		const { rerender } = renderControls(balancedModel);

		expect(screen.getByRole("button", { name: "Choose agent model" }).textContent).toContain(
			"Balanced model",
		);
		expect(screen.getByRole("button", { name: "Choose reasoning effort" }).textContent).toContain(
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
		expect(screen.getByRole("button", { name: "Choose reasoning effort" }).textContent).toContain(
			"Medium",
		);
		expect(screen.getByRole("switch", { name: "Fast service tier" }).dataset.state).toBe(
			"unchecked",
		);
	});

	it("searches the Codex model group without locking page scroll", () => {
		const { onModelChange } = renderControls(balancedModel);

		fireEvent.click(screen.getByRole("button", { name: "Choose agent model" }));

		expect(document.body.style.overflow).toBe("");
		expect(screen.getByText("Codex")).not.toBeNull();
		fireEvent.change(screen.getByRole("textbox", { name: "Search models" }), {
			target: { value: "fast" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Use Fast model" }));
		expect(onModelChange).toHaveBeenCalledWith("fast-model");
	});

	it("offers icon-led reasoning options and maps Auto to provider defaults", () => {
		const { onReasoningEffortChange } = renderControls(balancedModel);

		fireEvent.click(screen.getByRole("button", { name: "Choose reasoning effort" }));
		fireEvent.click(screen.getByRole("button", { name: "Use High reasoning" }));
		expect(onReasoningEffortChange).toHaveBeenCalledWith("high");

		fireEvent.click(screen.getByRole("button", { name: "Choose reasoning effort" }));
		fireEvent.click(screen.getByRole("button", { name: "Use automatic reasoning" }));
		expect(onReasoningEffortChange).toHaveBeenLastCalledWith(null);
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
		expect(screen.queryByRole("button", { name: "Choose agent model" })).toBeNull();
	});
});
