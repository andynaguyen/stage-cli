import {
	DEFAULT_DISPLAY_SETTINGS,
	type DisplaySettings,
	DisplaySettingsSchema,
	type UserSettings,
	type UserSettingsPatch,
	UserSettingsSchema,
} from "@stagereview/types/user-settings";

async function settingsRequest(init?: RequestInit): Promise<unknown> {
	const response = await fetch("/api/user-settings", init);
	if (!response.ok) throw new Error(`User settings request failed: ${response.status}`);
	return response.json();
}

function readLegacySetting<K extends keyof DisplaySettings>(
	key: K,
	storageKey: string,
	json = true,
): DisplaySettings[K] {
	try {
		const raw = localStorage.getItem(storageKey);
		if (raw !== null) {
			const parsed = DisplaySettingsSchema.safeParse({
				...DEFAULT_DISPLAY_SETTINGS,
				[key]: json ? JSON.parse(raw) : raw,
			});
			if (parsed.success) return parsed.data[key];
		}
	} catch {
		// Browser storage may be disabled or contain malformed values.
	}
	return DEFAULT_DISPLAY_SETTINGS[key];
}

export async function loadUserSettings(): Promise<UserSettings> {
	const settings = UserSettingsSchema.nullable().parse(await settingsRequest());
	if (settings) return settings;
	const initial: UserSettings = {
		display: {
			userTheme: readLegacySetting("userTheme", "ui-theme", false),
			viewMode: readLegacySetting("viewMode", "diff-viewMode"),
			diffIndicators: readLegacySetting("diffIndicators", "diff-indicators"),
			lineDiffType: readLegacySetting("lineDiffType", "diff-lineDiffType"),
			backgrounds: readLegacySetting("backgrounds", "diff-backgrounds"),
			wrap: readLegacySetting("wrap", "diff-wrap"),
			lineNumbers: readLegacySetting("lineNumbers", "diff-lineNumbers"),
			syntaxTheme: readLegacySetting("syntaxTheme", "diff-syntaxTheme"),
		},
		agent: null,
	};
	return UserSettingsSchema.parse(
		await settingsRequest({
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(initial),
		}),
	);
}

export async function saveUserSettings(patch: UserSettingsPatch): Promise<UserSettings> {
	return UserSettingsSchema.parse(
		await settingsRequest({
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(patch),
			keepalive: true,
		}),
	);
}
