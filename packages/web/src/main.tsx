import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DiffWorkerProvider } from "./lib/diff-worker-provider";
import { ThemeProvider } from "./lib/theme";
import { DiffSettingsProvider } from "./lib/use-diff-settings";
import { UserSettingsProvider } from "./lib/user-settings-context";
import { queryClient, router } from "./router";
import "./styles/globals.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<UserSettingsProvider>
				<ThemeProvider>
					<DiffSettingsProvider>
						<DiffWorkerProvider>
							<RouterProvider router={router} />
						</DiffWorkerProvider>
					</DiffSettingsProvider>
				</ThemeProvider>
			</UserSettingsProvider>
		</QueryClientProvider>
	</StrictMode>,
);
