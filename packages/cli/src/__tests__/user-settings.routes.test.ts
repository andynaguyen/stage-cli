import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { closeDb, getDb } from "../db/client.js";
import { userSettingsRoutes } from "../routes/user-settings.js";
import { type ServerHandle, startServer } from "../server.js";

let directory: string;
let server: ServerHandle;

function makeSettings() {
	return {
		display: {
			userTheme: "dark",
			syntaxTheme: "github",
			viewMode: "unified",
			diffIndicators: "bars",
			lineDiffType: "char",
			backgrounds: false,
			wrap: false,
			lineNumbers: false,
		},
		agent: {
			providerId: "codex",
			model: "test-model",
			reasoningEffort: "high",
			serviceTier: "priority",
		},
	};
}

async function start() {
	return startServer({
		routes: userSettingsRoutes(getDb({ dbPath: path.join(directory, "db.sqlite") })),
	});
}

async function request(method = "GET", body?: unknown, origin?: string) {
	return fetch(`http://127.0.0.1:${server.port}/api/user-settings`, {
		method,
		headers: {
			"Content-Type": "application/json",
			Connection: "close",
			...(origin ? { Origin: origin } : {}),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}

beforeEach(async () => {
	directory = await fs.mkdtemp(path.join(os.tmpdir(), "stage-settings-"));
	server = await start();
});

afterEach(async () => {
	await server.close();
	closeDb();
	await fs.rm(directory, { recursive: true, force: true });
});

it("retains display and agent preferences after reopening SQLite and the server", async () => {
	const settings = makeSettings();
	expect(await (await request()).json()).toBeNull();
	expect((await request("PUT", settings)).status).toBe(200);
	await server.close();
	closeDb();
	server = await start();

	expect(await (await request()).json()).toEqual(settings);
});

it("does not replace saved preferences when another browser initializes them", async () => {
	const settings = makeSettings();
	await request("PUT", settings);
	const response = await request("PUT", { ...settings, agent: null });

	expect(await response.json()).toEqual(settings);
});

it("merges display patches and preserves the agent choice", async () => {
	const settings = makeSettings();
	await request("PUT", settings);
	await request("PATCH", { display: { wrap: true } });
	await request("PATCH", { display: { userTheme: "light" } });

	expect(await (await request()).json()).toEqual({
		...settings,
		display: { ...settings.display, wrap: true, userTheme: "light" },
	});
});

it("remembers returning to automatic effort and standard speed", async () => {
	const settings = makeSettings();
	await request("PUT", settings);
	const agent = { ...settings.agent, reasoningEffort: null, serviceTier: null };
	await request("PATCH", { agent });

	expect(await (await request()).json()).toEqual({ ...settings, agent });
});

it.each([
	{ display: { wrap: "false" } },
	{ display: { viewMode: "invalid" } },
	{ display: { userTheme: "invalid" } },
	{ agent: { providerId: "codex", reasoningEffort: "high" } },
	{ runId: "run-1" },
])("rejects invalid settings without changing saved values: %j", async (patch) => {
	const settings = makeSettings();
	await request("PUT", settings);
	expect((await request("PATCH", patch)).status).toBe(400);
	expect(await (await request()).json()).toEqual(settings);
});

it("rejects cross-origin writes", async () => {
	expect((await request("PUT", makeSettings(), "https://example.com")).status).toBe(403);
	expect((await request("PATCH", { agent: null }, "https://example.com")).status).toBe(403);
	expect(await (await request()).json()).toBeNull();
});
