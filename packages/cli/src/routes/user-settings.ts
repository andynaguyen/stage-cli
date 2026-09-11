import {
	DEFAULT_DISPLAY_SETTINGS,
	patchUserSettings,
	type UserSettings,
	UserSettingsPatchSchema,
	UserSettingsSchema,
} from "@stagereview/types/user-settings";
import { eq } from "drizzle-orm";
import type { StageDb } from "../db/client.js";
import { LOCAL_USER_ID } from "../db/local-user.js";
import { userSettings } from "../db/schema/index.js";
import type { Route } from "../server.js";
import { parseJsonBody, writeJson } from "./json.js";
import { enforceSameOrigin } from "./pull-request-shared.js";

function readSettings(db: StageDb): UserSettings | null {
	const row = db.query.userSettings
		.findFirst({
			where: eq(userSettings.userId, LOCAL_USER_ID),
		})
		.sync();
	if (!row) return null;
	return { display: row.display, agent: row.agent };
}

export function userSettingsRoutes(db: StageDb): Route[] {
	return [
		{
			method: "GET",
			pattern: "/api/user-settings",
			handler: (_req, res) => writeJson(res, 200, readSettings(db)),
		},
		{
			method: "PUT",
			pattern: "/api/user-settings",
			handler: async (req, res) => {
				if (!enforceSameOrigin(req, res)) return;
				const settings = await parseJsonBody(req, res, UserSettingsSchema);
				if (!settings) return;
				// Initialize once so an older browser cannot overwrite the user's saved choices.
				db.insert(userSettings)
					.values({ userId: LOCAL_USER_ID, ...settings })
					.onConflictDoNothing()
					.run();
				writeJson(res, 200, readSettings(db));
			},
		},
		{
			method: "PATCH",
			pattern: "/api/user-settings",
			handler: async (req, res) => {
				if (!enforceSameOrigin(req, res)) return;
				const patch = await parseJsonBody(req, res, UserSettingsPatchSchema);
				if (!patch) return;
				const settings = db.transaction(
					(tx) => {
						const current = readSettings(tx) ?? { display: DEFAULT_DISPLAY_SETTINGS, agent: null };
						const next = patchUserSettings(current, patch);
						tx.insert(userSettings)
							.values({ userId: LOCAL_USER_ID, ...next })
							.onConflictDoUpdate({ target: userSettings.userId, set: next })
							.run();
						return next;
					},
					{ behavior: "immediate" },
				);
				writeJson(res, 200, settings);
			},
		},
	];
}
