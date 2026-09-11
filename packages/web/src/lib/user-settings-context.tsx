import {
	patchUserSettings,
	type UserSettings,
	type UserSettingsPatch,
} from "@stagereview/types/user-settings";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "@/components/ui/sonner";
import { loadUserSettings, saveUserSettings } from "./user-settings-api";

interface UserSettingsContextValue {
	settings: UserSettings;
	updateSettings: (patch: UserSettingsPatch) => void;
}

const UserSettingsContext = createContext<UserSettingsContextValue | null>(null);

export function UserSettingsProvider({ children }: { children: ReactNode }) {
	const query = useQuery({
		queryKey: ["user-settings"],
		queryFn: loadUserSettings,
		networkMode: "always",
		staleTime: Number.POSITIVE_INFINITY,
	});
	if (query.data) {
		return <LoadedUserSettingsProvider initial={query.data}>{children}</LoadedUserSettingsProvider>;
	}
	return (
		<div role="status" className="p-6 text-sm text-muted-foreground">
			{query.isError ? (
				<>
					<p>Couldn't load your settings. {query.error.message}</p>
					<button type="button" className="mt-2 underline" onClick={() => void query.refetch()}>
						Retry
					</button>
				</>
			) : (
				"Loading settings…"
			)}
		</div>
	);
}

function LoadedUserSettingsProvider({
	initial,
	children,
}: {
	initial: UserSettings;
	children: ReactNode;
}) {
	const queryClient = useQueryClient();
	const [settings, setSettings] = useState(initial);
	const saved = useRef(initial);
	const version = useRef(0);
	const { mutate } = useMutation({
		scope: { id: "user-settings" },
		networkMode: "always",
		mutationFn: ({ patch }: { patch: UserSettingsPatch; version: number }) =>
			saveUserSettings(patch),
		onSuccess: (next, request) => {
			saved.current = next;
			queryClient.setQueryData(["user-settings"], next);
			if (request.version === version.current) setSettings(next);
		},
		onError: (error, request) => {
			if (request.version === version.current) setSettings(saved.current);
			toast.error("Couldn't save your settings", { description: error.message });
		},
	});
	const updateSettings = useCallback(
		(patch: UserSettingsPatch) => {
			version.current += 1;
			setSettings((current) => patchUserSettings(current, patch));
			mutate({ patch, version: version.current });
		},
		[mutate],
	);
	const value = useMemo(() => ({ settings, updateSettings }), [settings, updateSettings]);
	return <UserSettingsContext value={value}>{children}</UserSettingsContext>;
}

export function useUserSettings(): UserSettingsContextValue {
	const value = useContext(UserSettingsContext);
	if (!value) throw new Error("useUserSettings must be used within a UserSettingsProvider");
	return value;
}
