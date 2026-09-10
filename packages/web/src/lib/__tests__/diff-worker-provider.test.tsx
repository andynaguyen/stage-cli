// @vitest-environment happy-dom
import type { WorkerInitializationRenderOptions } from "@pierre/diffs/react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Storage } from "happy-dom";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DiffWorkerProvider } from "../diff-worker-provider";
import { DiffSettingsProvider, LINE_DIFF_TYPE, useDiffSettings } from "../use-diff-settings";

const { pool, setRenderOptions, initializeOptions } = vi.hoisted(() => {
	const setRenderOptions = vi.fn().mockResolvedValue(undefined);
	return { pool: { setRenderOptions }, setRenderOptions, initializeOptions: vi.fn() };
});

vi.mock("@pierre/diffs/react", () => ({
	WorkerPoolContextProvider: ({
		children,
		highlighterOptions,
	}: {
		children: ReactNode;
		highlighterOptions: WorkerInitializationRenderOptions;
	}) => {
		initializeOptions(highlighterOptions);
		return children;
	},
	useWorkerPool: () => pool,
}));

function Wrapper({ children }: { children: ReactNode }) {
	return (
		<DiffSettingsProvider>
			<DiffWorkerProvider>{children}</DiffWorkerProvider>
		</DiffSettingsProvider>
	);
}

beforeEach(() => {
	vi.stubGlobal("localStorage", new Storage());
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

it("applies the latest choice after an earlier theme finishes loading", async () => {
	let finishLoading: (() => void) | undefined;
	setRenderOptions.mockImplementationOnce(
		() =>
			new Promise<void>((resolve) => {
				finishLoading = resolve;
			}),
	);
	const { result } = renderHook(useDiffSettings, { wrapper: Wrapper });
	await waitFor(() => expect(setRenderOptions).toHaveBeenCalledTimes(1));

	act(() => result.current.setSyntaxTheme("github"));
	act(() => result.current.setSyntaxTheme("one"));
	expect(setRenderOptions).toHaveBeenCalledTimes(1);
	if (!finishLoading) throw new Error("Expected the initial theme update to start");
	finishLoading();

	await waitFor(() => expect(setRenderOptions).toHaveBeenCalledTimes(2));
	expect(setRenderOptions).toHaveBeenLastCalledWith({
		theme: { dark: "one-dark-pro", light: "one-light" },
		lineDiffType: LINE_DIFF_TYPE.WORD,
	});
});

it("keeps worker highlighting in sync with the reviewer's syntax and word diff settings", async () => {
	window.localStorage.setItem("diff-syntaxTheme", JSON.stringify("github"));
	window.localStorage.setItem("diff-lineDiffType", JSON.stringify(LINE_DIFF_TYPE.CHAR));
	const { result } = renderHook(useDiffSettings, { wrapper: Wrapper });
	expect(initializeOptions).toHaveBeenCalledWith({
		theme: { dark: "github-dark", light: "github-light" },
		lineDiffType: LINE_DIFF_TYPE.CHAR,
	});

	act(() => {
		result.current.setSyntaxTheme("one");
		result.current.setLineDiffType(LINE_DIFF_TYPE.NONE);
	});

	await waitFor(() =>
		expect(setRenderOptions).toHaveBeenLastCalledWith({
			theme: { dark: "one-dark-pro", light: "one-light" },
			lineDiffType: LINE_DIFF_TYPE.NONE,
		}),
	);
});
