import { USER_THEME, type UserTheme } from "@stagereview/types/user-settings";
import {
	createContext,
	type ReactNode,
	use,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";

import { useUserSettings } from "./user-settings-context";

export type { UserTheme } from "@stagereview/types/user-settings";
export { USER_THEME } from "@stagereview/types/user-settings";

export const APP_THEME = {
	LIGHT: "light",
	DARK: "dark",
} as const;
export type AppTheme = (typeof APP_THEME)[keyof typeof APP_THEME];

function getSystemTheme(): AppTheme {
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? APP_THEME.DARK
		: APP_THEME.LIGHT;
}

function applyThemeToDOM(userTheme: UserTheme): void {
	const root = document.documentElement;
	root.classList.remove(APP_THEME.LIGHT, APP_THEME.DARK);
	const resolved = userTheme === USER_THEME.SYSTEM ? getSystemTheme() : userTheme;
	root.classList.add(resolved);
}

interface ThemeContextValue {
	userTheme: UserTheme;
	appTheme: AppTheme;
	setTheme: (theme: UserTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
	const { settings, updateSettings } = useUserSettings();
	const { userTheme } = settings.display;
	const [systemTheme, setSystemTheme] = useState<AppTheme>(getSystemTheme);

	useEffect(() => {
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = () => {
			const next = mq.matches ? APP_THEME.DARK : APP_THEME.LIGHT;
			setSystemTheme(next);
			if (userTheme === USER_THEME.SYSTEM) {
				applyThemeToDOM(USER_THEME.SYSTEM);
			}
		};
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, [userTheme]);

	const appTheme: AppTheme = userTheme === USER_THEME.SYSTEM ? systemTheme : userTheme;

	useEffect(() => {
		applyThemeToDOM(userTheme);
		try {
			localStorage.setItem("ui-theme", userTheme);
		} catch {
			// Keep the pre-paint browser cache optional when storage is disabled.
		}
	}, [userTheme]);

	const setTheme = useCallback(
		(next: UserTheme) => {
			updateSettings({ display: { userTheme: next } });
		},
		[updateSettings],
	);

	const contextValue = useMemo(
		() => ({ userTheme, appTheme, setTheme }),
		[userTheme, appTheme, setTheme],
	);

	return <ThemeContext value={contextValue}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
	const ctx = use(ThemeContext);
	if (!ctx) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return ctx;
}
