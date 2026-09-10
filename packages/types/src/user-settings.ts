import { z } from "zod";
import { AgentProviderIdSchema } from "./agent.ts";

export const USER_THEME = {
	LIGHT: "light",
	DARK: "dark",
	SYSTEM: "system",
} as const;
export type UserTheme = (typeof USER_THEME)[keyof typeof USER_THEME];

export const VIEW_MODE = { SPLIT: "split", UNIFIED: "unified" } as const;
export type ViewMode = (typeof VIEW_MODE)[keyof typeof VIEW_MODE];

export const DIFF_INDICATORS = { CLASSIC: "classic", BARS: "bars", NONE: "none" } as const;
export type DiffIndicators = (typeof DIFF_INDICATORS)[keyof typeof DIFF_INDICATORS];

export const LINE_DIFF_TYPE = {
	WORD_ALT: "word-alt",
	WORD: "word",
	CHAR: "char",
	NONE: "none",
} as const;
export type LineDiffType = (typeof LINE_DIFF_TYPE)[keyof typeof LINE_DIFF_TYPE];

export const DisplaySettingsSchema = z.strictObject({
	userTheme: z.enum(USER_THEME),
	viewMode: z.enum(VIEW_MODE),
	diffIndicators: z.enum(DIFF_INDICATORS),
	lineDiffType: z.enum(LINE_DIFF_TYPE),
	backgrounds: z.boolean(),
	wrap: z.boolean(),
	lineNumbers: z.boolean(),
	syntaxTheme: z.string().min(1).max(128),
});
export type DisplaySettings = z.infer<typeof DisplaySettingsSchema>;

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
	userTheme: USER_THEME.SYSTEM,
	viewMode: VIEW_MODE.SPLIT,
	diffIndicators: DIFF_INDICATORS.CLASSIC,
	lineDiffType: LINE_DIFF_TYPE.WORD,
	backgrounds: true,
	wrap: true,
	lineNumbers: true,
	syntaxTheme: "pierre",
};

export const AgentSettingsSchema = z.strictObject({
	providerId: AgentProviderIdSchema,
	model: z.string().min(1).max(128),
	reasoningEffort: z.string().min(1).max(128).nullable(),
	serviceTier: z.string().min(1).max(128).nullable(),
});
export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

export const UserSettingsSchema = z.strictObject({
	display: DisplaySettingsSchema,
	agent: AgentSettingsSchema.nullable(),
});
export type UserSettings = z.infer<typeof UserSettingsSchema>;

export const UserSettingsPatchSchema = z.strictObject({
	display: DisplaySettingsSchema.partial().optional(),
	agent: AgentSettingsSchema.nullable().optional(),
});
export type UserSettingsPatch = z.infer<typeof UserSettingsPatchSchema>;

export function patchUserSettings(settings: UserSettings, patch: UserSettingsPatch): UserSettings {
	return {
		display: { ...settings.display, ...patch.display },
		agent: patch.agent === undefined ? settings.agent : patch.agent,
	};
}
