import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { FilesPage } from "@/routes/files-page";

const FilesSearchSchema = z.object({
	file: z.string().min(1).optional(),
	thread: z.string().min(1).optional(),
});

export const Route = createFileRoute("/runs/$runId/files")({
	component: FilesRoute,
	validateSearch: (search) => FilesSearchSchema.parse(search),
});

function FilesRoute() {
	const { runId } = Route.useParams();
	const { file, thread } = Route.useSearch();
	return <FilesPage runId={runId} focusedFilePath={file} focusedThreadId={thread} />;
}
