// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Storage } from "happy-dom";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "../theme";
import { useUserSettings } from "../user-settings-context";
import {
	createSettingsWrapper,
	makeUserSettings,
	mockSettingsRequests,
} from "./user-settings-test-helpers";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

it("applies rapid choices immediately and saves them in selection order", async () => {
	const initial = makeUserSettings();
	const fetchMock = mockSettingsRequests(initial);
	let finishFirst: (response: Response) => void = () => {
		throw new Error("Save has not started");
	};
	fetchMock.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finishFirst = resolve;
			}),
	);
	const { result } = renderHook(useUserSettings, { wrapper: createSettingsWrapper(initial) });

	act(() => {
		result.current.updateSettings({ display: { wrap: false } });
		result.current.updateSettings({ display: { wrap: true } });
		result.current.updateSettings({ display: { lineNumbers: false } });
	});
	expect(result.current.settings.display).toMatchObject({ wrap: true, lineNumbers: false });
	await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
	await act(async () =>
		finishFirst(Response.json({ ...initial, display: { ...initial.display, wrap: false } })),
	);
	await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
	expect(fetchMock.mock.calls.map(([, init]) => init?.body)).toEqual([
		JSON.stringify({ display: { wrap: false } }),
		JSON.stringify({ display: { wrap: true } }),
		JSON.stringify({ display: { lineNumbers: false } }),
	]);
	expect(result.current.settings.display).toMatchObject({ wrap: true, lineNumbers: false });
});

it("restores the last saved settings after a failed write", async () => {
	const initial = makeUserSettings();
	const fetchMock = mockSettingsRequests(initial);
	fetchMock.mockResolvedValueOnce(new Response("Unavailable", { status: 500 }));
	const { result } = renderHook(useUserSettings, { wrapper: createSettingsWrapper(initial) });
	act(() => result.current.updateSettings({ display: { wrap: false } }));
	expect(result.current.settings.display.wrap).toBe(false);

	await waitFor(() => expect(result.current.settings.display.wrap).toBe(true));
});

it("applies the saved appearance over the browser cache and persists appearance changes", async () => {
	vi.stubGlobal("localStorage", new Storage());
	localStorage.setItem("ui-theme", "light");
	const initial = makeUserSettings();
	initial.display.userTheme = "dark";
	const fetchMock = mockSettingsRequests(initial);
	const SettingsWrapper = createSettingsWrapper(initial);
	const { result } = renderHook(useTheme, {
		wrapper: ({ children }: { children: ReactNode }) => (
			<SettingsWrapper>
				<ThemeProvider>{children}</ThemeProvider>
			</SettingsWrapper>
		),
	});
	expect(result.current.userTheme).toBe("dark");
	expect(document.documentElement.classList.contains("dark")).toBe(true);
	expect(localStorage.getItem("ui-theme")).toBe("dark");

	act(() => result.current.setTheme("light"));
	await waitFor(() =>
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/user-settings",
			expect.objectContaining({
				method: "PATCH",
				body: JSON.stringify({ display: { userTheme: "light" } }),
			}),
		),
	);
	expect(document.documentElement.classList.contains("light")).toBe(true);
});
