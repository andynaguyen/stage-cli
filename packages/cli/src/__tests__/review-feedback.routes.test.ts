import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { type CommentThread, CommentThreadSchema } from "@stagereview/types/comments";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../db/client.js";
import { formatReviewGitRef, ReviewFeedbackSession } from "../review-feedback.js";
import { commentRoutes } from "../routes/comments.js";
import { reviewFeedbackRoutes } from "../routes/review-feedback.js";
import { insertChaptersFile } from "../runs/import-chapters.js";
import { type ChaptersFile, SCOPE_KIND, type Scope } from "../schema.js";
import { LOOPBACK_HOST, type ServerHandle, startServer } from "../server.js";
import { makeFixture, makeRepoContext } from "./fixtures.js";

let tmpDir: string;
let dbPath: string;
let webDist: string;
let handle: ServerHandle | undefined;

beforeEach(async () => {
	tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stage-cli-feedback-"));
	dbPath = path.join(tmpDir, "db.sqlite");
	webDist = path.join(tmpDir, "web-dist");
	await fs.mkdir(webDist);
	await fs.writeFile(path.join(webDist, "index.html"), "<html></html>");
	closeDb();
});

afterEach(async () => {
	if (handle !== undefined) await handle.close();
	handle = undefined;
	closeDb();
	await fs.rm(tmpDir, { recursive: true, force: true });
});

async function start(
	runId: string,
	scope: Scope = makeFixture().scope,
): Promise<{ port: number; session: ReviewFeedbackSession }> {
	const db = getDb({ dbPath });
	const session = new ReviewFeedbackSession(scope);
	handle = await startServer({
		webDistPath: webDist,
		routes: [...commentRoutes(db), ...reviewFeedbackRoutes(db, runId, session)],
	});
	return { port: handle.port, session };
}

function seedRun(over: Partial<ChaptersFile> = {}): string {
	return insertChaptersFile(getDb({ dbPath }), makeFixture(over), makeRepoContext()).runId;
}

interface JsonResponse {
	status: number;
	body: unknown;
}

function send(
	port: number,
	method: string,
	requestPath: string,
	body?: unknown,
	headers?: Record<string, string>,
): Promise<JsonResponse> {
	const payload = body === undefined ? "" : JSON.stringify(body);
	return new Promise((resolve, reject) => {
		const request = http.request(
			{
				host: LOOPBACK_HOST,
				port,
				method,
				path: requestPath,
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(payload),
					...headers,
				},
			},
			(response) => {
				const chunks: Buffer[] = [];
				response.on("data", (chunk: Buffer) => chunks.push(chunk));
				response.on("end", () => {
					const text = Buffer.concat(chunks).toString("utf8");
					resolve({ status: response.statusCode ?? 0, body: text ? JSON.parse(text) : null });
				});
			},
		);
		request.on("error", reject);
		if (payload.length > 0) request.write(payload);
		request.end();
	});
}

async function createThread(port: number, runId: string, body: string): Promise<CommentThread> {
	const response = await send(port, "POST", `/api/runs/${runId}/comment-threads`, {
		filePath: "src/example.ts",
		side: "additions",
		startLine: 4,
		endLine: 4,
		body,
	});
	expect(response.status).toBe(201);
	return CommentThreadSchema.parse(response.body);
}

describe("review feedback API", () => {
	it("enforces same-origin before resolving a run", async () => {
		const runId = seedRun();
		const { port } = await start(runId);
		const headers = {
			Origin: "http://evil.example",
		};

		expect((await send(port, "POST", "/api/feedback", undefined, headers)).status).toBe(403);
	});

	it("returns 409 when the active run has no unresolved comments", async () => {
		const runId = seedRun();
		const { port } = await start(runId);

		expect((await send(port, "POST", "/api/feedback")).status).toBe(409);
	});

	it("submits unresolved comments once", async () => {
		const runId = seedRun();
		const { port, session } = await start(runId);
		const open = await createThread(port, runId, "Submit me");
		await send(port, "POST", `/api/comment-threads/${open.id}/replies`, { body: "Reply" });
		const resolved = await createThread(port, runId, "Hide me");
		await send(port, "PATCH", `/api/comment-threads/${resolved.id}`, { resolved: true });

		const first = await send(port, "POST", "/api/feedback");
		expect(first).toEqual({ status: 204, body: null });
		const result = await session.result;
		expect(result).toMatchObject({
			gitRef: formatReviewGitRef(makeFixture().scope),
			approved: false,
			annotations: [
				{ type: "comment", side: "new", text: "Submit me" },
				{ type: "comment", side: "new", text: "Reply" },
			],
		});
		expect(result.feedback).toContain("Submit me\n\nReply");
		expect(result.feedback).not.toContain("Hide me");

		const repeated = await send(port, "POST", "/api/feedback");
		expect(repeated.status).toBe(409);
	});

	it("submits only the run bound to the active review session", async () => {
		const inactiveScope: Scope = {
			kind: SCOPE_KIND.COMMITTED,
			baseSha: "1".repeat(40),
			headSha: "2".repeat(40),
			mergeBaseSha: "1".repeat(40),
		};
		const activeScope: Scope = {
			kind: SCOPE_KIND.COMMITTED,
			baseSha: "3".repeat(40),
			headSha: "4".repeat(40),
			mergeBaseSha: "3".repeat(40),
		};
		const inactiveRunId = seedRun({ scope: inactiveScope });
		const activeRunId = seedRun({ scope: activeScope });
		const { port, session } = await start(activeRunId, activeScope);
		await createThread(port, inactiveRunId, "Do not submit");
		await createThread(port, activeRunId, "Submit active review");

		expect((await send(port, "POST", "/api/feedback")).status).toBe(204);

		const result = await session.result;
		expect(result.feedback).toContain("Submit active review");
		expect(result.feedback).not.toContain("Do not submit");
	});
});
