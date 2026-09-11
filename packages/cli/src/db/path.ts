import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { readRepoRoot } from "../git.js";

const STAGE_HOME = ".stage";
const DB_FILE = "db.sqlite";
const REPO_HASH_LEN = 12;

export function getDbPath(): string {
	const dir = ensureRepoDir(readRepoRoot());
	return path.join(dir, DB_FILE);
}

export function getUserSettingsDbPath(): string {
	const dir = path.join(homedir(), STAGE_HOME);
	mkdirSync(dir, { recursive: true });
	return path.join(dir, "user-settings.sqlite");
}

function ensureRepoDir(repoRoot: string): string {
	const hash = createHash("sha256").update(repoRoot.trim()).digest("hex").slice(0, REPO_HASH_LEN);
	const dir = path.join(homedir(), STAGE_HOME, hash);
	mkdirSync(dir, { recursive: true });
	return dir;
}
