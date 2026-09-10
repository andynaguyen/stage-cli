// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentAnswer } from "../agent-message";

afterEach(cleanup);

describe("AgentAnswer file links", () => {
	it("opens a local source link in the matching changed file", () => {
		const onSelectFile = vi.fn();
		render(
			<AgentAnswer
				content="See [the route](/Users/reviewer/stage-cli/packages/web/src/routes/files-page.tsx:24)."
				filePaths={[
					"packages/web/src/routes/files-page.tsx",
					"packages/web/src/routes/pull-request-layout.tsx",
				]}
				onSelectFile={onSelectFile}
			/>,
		);

		fireEvent.click(screen.getByRole("link", { name: "the route" }));

		expect(onSelectFile).toHaveBeenCalledOnce();
		expect(onSelectFile).toHaveBeenCalledWith("packages/web/src/routes/files-page.tsx");
	});

	it("leaves external links as normal new-tab links", () => {
		const onSelectFile = vi.fn();
		render(
			<AgentAnswer
				content="Read the [router docs](https://tanstack.com/router)."
				filePaths={["packages/web/src/router.tsx"]}
				onSelectFile={onSelectFile}
			/>,
		);

		const link = screen.getByRole("link", { name: "router docs" });
		fireEvent.click(link);

		expect(onSelectFile).not.toHaveBeenCalled();
		expect(link.getAttribute("href")).toBe("https://tanstack.com/router");
		expect(link.getAttribute("target")).toBe("_blank");
	});
});
