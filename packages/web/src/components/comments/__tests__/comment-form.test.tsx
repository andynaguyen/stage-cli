// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommentForm } from "../comment-form";

afterEach(cleanup);

describe("CommentForm", () => {
	it("shows a multiline selection in a new-comment composer", () => {
		render(
			<CommentForm
				label="Comment"
				lineRange={{ startLine: 4, endLine: 7 }}
				onSubmit={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);

		expect(screen.getByText("L4-7 selected")).toBeTruthy();
	});

	it("shows a single selected line", () => {
		render(
			<CommentForm
				label="Comment"
				lineRange={{ startLine: 9, endLine: 9 }}
				onSubmit={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);

		expect(screen.getByText("L9 selected")).toBeTruthy();
	});
});
