// @vitest-environment happy-dom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DIFF_SIDE } from "@/lib/diff-types";
import { LineHighlightOverlay } from "../hunk-highlight-overlay";

const mutationCallbacks = new Map<MutationObserver, MutationCallback>();

class ControlledMutationObserver extends MutationObserver {
	constructor(callback: MutationCallback) {
		super(() => {});
		mutationCallbacks.set(this, callback);
	}

	override disconnect() {
		super.disconnect();
		mutationCallbacks.delete(this);
	}
}

beforeEach(() => {
	vi.stubGlobal("MutationObserver", ControlledMutationObserver);
	vi.useFakeTimers({
		toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
	});
});

afterEach(() => {
	cleanup();
	document.body.replaceChildren();
	mutationCallbacks.clear();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

async function settleMeasurements() {
	await act(async () => {
		for (const [observer, callback] of mutationCallbacks) {
			const records = observer.takeRecords();
			if (records.length > 0) callback(records, observer);
		}
		await vi.advanceTimersByTimeAsync(100);
	});
}

async function mountOverlay() {
	const container = document.createElement("div");
	const host = document.createElement("diffs-container");
	const shadow = host.attachShadow({ mode: "open" });
	shadow.innerHTML = `<pre><code data-additions>
		<div data-line="1"><span data-column-number>1</span></div>
		<div data-line="2"><span data-column-number>2</span></div>
	</code></pre>`;
	container.append(host);
	document.body.append(container);
	const measure = vi.spyOn(container, "getBoundingClientRect");
	render(
		<LineHighlightOverlay
			allLineRefs={[
				{
					filePath: "example.ts",
					side: DIFF_SIDE.ADDITIONS,
					startLine: 1,
					endLine: 2,
					keyChangeId: "change-1",
				},
			]}
			focusedLineRefs={undefined}
			focusedKeyChangeId={null}
			isKeyChangeChecked={() => false}
			onMarkKeyChangeChecked={vi.fn()}
			onUnmarkKeyChangeChecked={vi.fn()}
			onFocusKeyChange={vi.fn()}
			containerRef={{ current: container }}
		/>,
	);
	await settleMeasurements();
	expect(measure).toHaveBeenCalled();
	measure.mockClear();
	return { shadow, measure };
}

describe("highlight measurements", () => {
	it("does not remeasure when the gutter comment button is inserted, moved, or removed", async () => {
		const { shadow, measure } = await mountOverlay();
		const hoverButton = document.createElement("div");
		hoverButton.setAttribute("data-gutter-utility-slot", "");
		shadow.append(hoverButton);
		await settleMeasurements();
		shadow.prepend(hoverButton);
		await settleMeasurements();
		hoverButton.remove();
		await settleMeasurements();
		expect(measure).not.toHaveBeenCalled();
	});

	it("remeasures when rendered lines change alongside a gutter mutation", async () => {
		const { shadow, measure } = await mountOverlay();
		const hoverButton = document.createElement("div");
		hoverButton.setAttribute("data-gutter-utility-slot", "");
		const annotation = document.createElement("div");
		annotation.setAttribute("data-line-annotation", "");
		shadow.append(hoverButton, annotation);
		await settleMeasurements();
		expect(measure).toHaveBeenCalled();
	});

	it("remeasures when annotations are removed", async () => {
		const { shadow, measure } = await mountOverlay();
		const annotation = document.createElement("div");
		annotation.setAttribute("data-line-annotation", "");
		shadow.append(annotation);
		await settleMeasurements();
		measure.mockClear();
		annotation.remove();
		await settleMeasurements();
		expect(measure).toHaveBeenCalled();
	});
});
