// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextSelectionPopup } from "../text-selection-popup";

afterEach(cleanup);

const lineRange = {
	start: 4,
	side: "additions",
	end: 7,
	endSide: "additions",
} as const;

describe("TextSelectionPopup", () => {
	it("offers comment and Ask Agent actions for the same selected range", () => {
		const onComment = vi.fn();
		const onAskAgent = vi.fn();
		render(
			<TextSelectionPopup
				selectionRect={new DOMRect(100, 200, 80, 20)}
				lineRange={lineRange}
				onComment={onComment}
				onAskAgent={onAskAgent}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Comment on lines 4–7" }));
		fireEvent.click(screen.getByRole("button", { name: "Ask Agent about lines 4–7" }));

		expect(onComment).toHaveBeenCalledWith(lineRange);
		expect(onAskAgent).toHaveBeenCalledWith(lineRange);
	});

	it("keeps Ask Agent optional outside the run layout", () => {
		render(
			<TextSelectionPopup
				selectionRect={new DOMRect(100, 200, 80, 20)}
				lineRange={lineRange}
				onComment={vi.fn()}
			/>,
		);

		expect(screen.queryByRole("button", { name: /Ask Agent/ })).toBeNull();
	});
});
