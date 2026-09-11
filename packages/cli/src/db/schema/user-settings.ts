import type { AgentSettings, DisplaySettings } from "@stagereview/types/user-settings";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userSettings = sqliteTable("user_settings", {
	userId: text().primaryKey(),
	display: text({ mode: "json" }).$type<DisplaySettings>().notNull(),
	agent: text({ mode: "json" }).$type<AgentSettings>(),
});
