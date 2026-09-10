import {
	DEFAULT_DISPLAY_SETTINGS,
	patchUserSettings,
	type UserSettings,
	UserSettingsPatchSchema,
	UserSettingsSchema,
} from "@stagereview/types/user-settings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { UserSettingsProvider } from "../user-settings-context";

export function makeUserSettings(overrides: Partial<UserSettings> = {}): UserSettings {
	return { display: { ...DEFAULT_DISPLAY_SETTINGS }, agent: null, ...overrides };
}

export function mockSettingsRequests(initial: UserSettings | null = makeUserSettings()) {
	let saved = initial;
	const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
		if (init?.body && typeof init.body === "string") {
			const body: unknown = JSON.parse(init.body);
			if (init.method === "PUT" && !saved) saved = UserSettingsSchema.parse(body);
			if (init.method === "PATCH") {
				if (!saved) throw new Error("Settings must be initialized");
				saved = patchUserSettings(saved, UserSettingsPatchSchema.parse(body));
			}
		}
		return Response.json(saved);
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

export function createSettingsWrapper(initial?: UserSettings) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	if (initial) client.setQueryData(["user-settings"], initial);
	return function Wrapper({ children }: { children: ReactNode }) {
		return (
			<QueryClientProvider client={client}>
				<UserSettingsProvider>{children}</UserSettingsProvider>
			</QueryClientProvider>
		);
	};
}
