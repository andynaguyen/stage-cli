import type { DiffIndicators, LineDiffType, ViewMode } from "@stagereview/types/user-settings";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useUserSettings } from "./user-settings-context";

export type { DiffIndicators, LineDiffType, ViewMode } from "@stagereview/types/user-settings";
export { DIFF_INDICATORS, LINE_DIFF_TYPE, VIEW_MODE } from "@stagereview/types/user-settings";

interface DiffSettingsContextValue {
	viewMode: ViewMode;
	setViewMode: (mode: ViewMode) => void;
	diffIndicators: DiffIndicators;
	setDiffIndicators: (indicators: DiffIndicators) => void;
	lineDiffType: LineDiffType;
	setLineDiffType: (type: LineDiffType) => void;
	backgrounds: boolean;
	setBackgrounds: (enabled: boolean) => void;
	wrap: boolean;
	setWrap: (wrap: boolean) => void;
	lineNumbers: boolean;
	setLineNumbers: (enabled: boolean) => void;
	syntaxTheme: string;
	setSyntaxTheme: (theme: string) => void;
}

const DiffSettingsContext = createContext<DiffSettingsContextValue | null>(null);

export function DiffSettingsProvider({ children }: { children: ReactNode }) {
	const { settings, updateSettings } = useUserSettings();
	const setters = useMemo(
		() => ({
			setViewMode: (viewMode: ViewMode) => updateSettings({ display: { viewMode } }),
			setDiffIndicators: (diffIndicators: DiffIndicators) =>
				updateSettings({ display: { diffIndicators } }),
			setLineDiffType: (lineDiffType: LineDiffType) =>
				updateSettings({ display: { lineDiffType } }),
			setBackgrounds: (backgrounds: boolean) => updateSettings({ display: { backgrounds } }),
			setWrap: (wrap: boolean) => updateSettings({ display: { wrap } }),
			setLineNumbers: (lineNumbers: boolean) => updateSettings({ display: { lineNumbers } }),
			setSyntaxTheme: (syntaxTheme: string) => updateSettings({ display: { syntaxTheme } }),
		}),
		[updateSettings],
	);
	const value = useMemo(() => ({ ...settings.display, ...setters }), [settings.display, setters]);

	return <DiffSettingsContext.Provider value={value}>{children}</DiffSettingsContext.Provider>;
}

export function useDiffSettings(): DiffSettingsContextValue {
	const context = useContext(DiffSettingsContext);
	if (!context) {
		throw new Error("useDiffSettings must be used within a DiffSettingsProvider");
	}
	return context;
}
