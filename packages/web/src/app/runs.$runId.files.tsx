import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { FILE_NAVIGATION_TARGET, type FileNavigationTarget, FilesPage } from "@/routes/files-page";

const FilesSearchSchema = z
	.object({
		file: z.string().min(1).optional(),
		thread: z.string().min(1).optional(),
	})
	.refine((search) => search.file === undefined || search.thread === undefined, {
		message: "File navigation accepts either file or thread, not both",
	});

export const Route = createFileRoute("/runs/$runId/files")({
	component: FilesRoute,
	validateSearch: (search) => FilesSearchSchema.parse(search),
});

function FilesRoute() {
	const { runId } = Route.useParams();
	const { file, thread } = Route.useSearch();
	let navigationTarget: FileNavigationTarget | undefined;
	if (file !== undefined) {
		navigationTarget = { type: FILE_NAVIGATION_TARGET.FILE, filePath: file };
	} else if (thread !== undefined) {
		navigationTarget = { type: FILE_NAVIGATION_TARGET.THREAD, threadId: thread };
	}
	return <FilesPage runId={runId} navigationTarget={navigationTarget} />;
}
