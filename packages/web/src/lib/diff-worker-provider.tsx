import {
	useWorkerPool,
	type WorkerInitializationRenderOptions,
	WorkerPoolContextProvider,
	type WorkerPoolOptions,
} from "@pierre/diffs/react";
import DiffWorker from "@pierre/diffs/worker/worker.js?worker";
import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef } from "react";
import { resolveSyntaxTheme } from "./syntax-themes";
import { useDiffSettings } from "./use-diff-settings";

const POOL_OPTIONS: WorkerPoolOptions = {
	workerFactory: () => new DiffWorker(),
	poolSize: 2,
};

export function DiffWorkerProvider({ children }: { children: ReactNode }) {
	const { syntaxTheme, lineDiffType } = useDiffSettings();
	const deferredSyntaxTheme = useDeferredValue(syntaxTheme);
	const deferredLineDiffType = useDeferredValue(lineDiffType);
	const highlighterOptions = useMemo<WorkerInitializationRenderOptions>(
		() => ({
			theme: {
				dark: resolveSyntaxTheme(deferredSyntaxTheme, "dark"),
				light: resolveSyntaxTheme(deferredSyntaxTheme, "light"),
			},
			lineDiffType: deferredLineDiffType,
		}),
		[deferredSyntaxTheme, deferredLineDiffType],
	);

	return (
		<WorkerPoolContextProvider poolOptions={POOL_OPTIONS} highlighterOptions={highlighterOptions}>
			<SyncWorkerOptions options={highlighterOptions} />
			{children}
		</WorkerPoolContextProvider>
	);
}

function SyncWorkerOptions({ options }: { options: WorkerInitializationRenderOptions }) {
	const pool = useWorkerPool();
	const pendingUpdate = useRef(Promise.resolve());

	useEffect(() => {
		if (!pool) return;
		let canceled = false;
		// Theme loading is asynchronous. Apply updates in order so a slow earlier
		// theme cannot replace the reviewer's latest choice.
		pendingUpdate.current = pendingUpdate.current
			.then(async () => {
				if (!canceled) await pool.setRenderOptions(options);
			})
			.catch((error: unknown) => {
				console.error("Failed to update diff highlighting settings", error);
			});
		return () => {
			canceled = true;
		};
	}, [pool, options]);

	return null;
}
