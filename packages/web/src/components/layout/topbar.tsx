import { useChapters } from "@/lib/use-chapters";
import { DisplaySettingsButton } from "./display-settings-button";

export function Topbar({ runId }: { runId: string | null }) {
	const { data } = useChapters(runId);
	const repoName = data?.run.repoName;

	return (
		<header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between border-border border-b bg-background px-6 lg:px-8">
			<div className="flex min-w-0 items-center gap-2 text-sm">
				{repoName && <span className="truncate font-medium text-foreground">{repoName}</span>}
			</div>
			<DisplaySettingsButton />
		</header>
	);
}
