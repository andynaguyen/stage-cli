import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_DISPLAY_SETTINGS } from "@stagereview/types/user-settings";
import { afterEach, beforeEach, expect, it } from "vitest";
import { closeDb, getDb } from "../db/client.js";
import { getUserSettingsDbPath } from "../db/path.js";
import { userSettings } from "../db/schema/index.js";

let directory: string;
const originalCwd = process.cwd();

beforeEach(async () => {
	directory = await fs.mkdtemp(path.join(os.tmpdir(), "stage-global-settings-"));
});

afterEach(async () => {
	process.chdir(originalCwd);
	closeDb();
	await fs.rm(directory, { recursive: true, force: true });
});

it("uses the same user settings path outside the repository", () => {
	const settingsPath = getUserSettingsDbPath();
	process.chdir(directory);
	expect(getUserSettingsDbPath()).toBe(settingsPath);
	expect(settingsPath).toBe(path.join(os.homedir(), ".stage", "user-settings.sqlite"));
});

it("keeps review databases usable while the shared settings database is open", () => {
	const firstReview = getDb({ dbPath: path.join(directory, "first.sqlite") });
	const shared = getDb({ dbPath: path.join(directory, "settings.sqlite") });
	const secondReview = getDb({ dbPath: path.join(directory, "second.sqlite") });
	shared.insert(userSettings).values({ userId: "local", display: DEFAULT_DISPLAY_SETTINGS }).run();

	expect(firstReview.query.chapterRun.findMany().sync()).toEqual([]);
	expect(secondReview.query.chapterRun.findMany().sync()).toEqual([]);
	expect(shared.query.userSettings.findFirst().sync()?.display).toEqual(DEFAULT_DISPLAY_SETTINGS);
	expect(getDb({ dbPath: path.join(directory, "first.sqlite") })).toBe(firstReview);
});
