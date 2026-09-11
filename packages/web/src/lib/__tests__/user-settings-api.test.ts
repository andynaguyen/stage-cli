// @vitest-environment happy-dom
import { Storage } from "happy-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadUserSettings } from "../user-settings-api";
import { makeUserSettings, mockSettingsRequests } from "./user-settings-test-helpers";

beforeEach(() => vi.stubGlobal("localStorage", new Storage()));
afterEach(() => vi.unstubAllGlobals());

it("imports browser preferences only when SQLite has no settings", async () => {
	const fetchMock = mockSettingsRequests(null);
	localStorage.setItem("ui-theme", "dark");
	localStorage.setItem("diff-viewMode", JSON.stringify("unified"));
	localStorage.setItem("diff-wrap", "false");
	localStorage.setItem("diff-syntaxTheme", JSON.stringify("github"));
	const settings = await loadUserSettings();

	expect(settings.display).toMatchObject({
		userTheme: "dark",
		viewMode: "unified",
		wrap: false,
		syntaxTheme: "github",
	});
	expect(fetchMock).toHaveBeenCalledTimes(2);
	localStorage.setItem("ui-theme", "light");
	expect(await loadUserSettings()).toEqual(settings);
	expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("ignores malformed and invalid legacy values independently", async () => {
	mockSettingsRequests(null);
	localStorage.setItem("diff-viewMode", JSON.stringify("invalid"));
	localStorage.setItem("diff-wrap", "broken json");
	localStorage.setItem("diff-lineNumbers", "false");
	const { display } = await loadUserSettings();

	expect(display).toEqual({ ...makeUserSettings().display, lineNumbers: false });
});

it("loads server preferences when browser storage is unavailable", async () => {
	const settings = makeUserSettings({
		agent: {
			providerId: "codex",
			model: "saved-model",
			reasoningEffort: "high",
			serviceTier: "priority",
		},
	});
	mockSettingsRequests(settings);
	vi.stubGlobal("localStorage", {
		getItem() {
			throw new Error("Storage blocked");
		},
	});

	expect(await loadUserSettings()).toEqual(settings);
});

it("does not initialize over a failed database read", async () => {
	const fetchMock = vi.fn().mockResolvedValue(new Response("Unavailable", { status: 500 }));
	vi.stubGlobal("fetch", fetchMock);

	await expect(loadUserSettings()).rejects.toThrow("500");
	expect(fetchMock).toHaveBeenCalledOnce();
});
