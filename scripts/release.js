#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_PACKAGE_FILES = [
	"package.json",
	"dist/index.js",
	"web-dist/index.html",
	"skills/stage-chapters/SKILL.md",
];

class ReleasePublisher {
	#dryRun;
	#packageDirectory;
	#repositoryRoot;
	#tag;
	#temporaryDirectory;
	#version;

	constructor({ dryRun }) {
		this.#dryRun = dryRun;
		this.#repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
		this.#packageDirectory = join(this.#repositoryRoot, "packages", "cli");
		this.#temporaryDirectory = undefined;

		const packageJson = JSON.parse(
			readFileSync(join(this.#packageDirectory, "package.json"), "utf8"),
		);
		if (
			typeof packageJson.version !== "string" ||
			!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(packageJson.version)
		) {
			throw new Error("packages/cli/package.json must contain a valid semantic version");
		}

		this.#version = packageJson.version;
		this.#tag = `v${this.#version}`;
	}

	run() {
		try {
			this.#preflight();
			this.#verify();
			const tarballPath = this.#pack();

			if (this.#dryRun) {
				this.#write(`Dry run complete: ${this.#tag} is ready to release.\n`);
				return;
			}

			this.#publish(tarballPath);
		} finally {
			if (this.#temporaryDirectory !== undefined) {
				rmSync(this.#temporaryDirectory, { force: true, recursive: true });
			}
		}
	}

	#preflight() {
		this.#write(`Preparing ${this.#tag}${this.#dryRun ? " (dry run)" : ""}\n`);
		this.#run("git", ["--version"]);
		this.#run("pnpm", ["--version"]);
		this.#run("npm", ["--version"]);

		if (this.#dryRun) {
			return;
		}

		const status = this.#capture("git", ["status", "--porcelain"]);
		if (status !== "") {
			throw new Error("the working tree must be clean before creating a release");
		}

		const branch = this.#capture("git", ["symbolic-ref", "--quiet", "--short", "HEAD"]);
		const upstream = this.#capture("git", [
			"rev-parse",
			"--abbrev-ref",
			"--symbolic-full-name",
			"@{upstream}",
		]);
		const divergence = this.#capture("git", [
			"rev-list",
			"--left-right",
			"--count",
			"HEAD...@{upstream}",
		]).split(/\s+/);
		if (divergence.length !== 2) {
			throw new Error(`could not compare ${branch} with ${upstream}`);
		}

		const [ahead, behind] = divergence;
		if (ahead !== "0" || behind !== "0") {
			throw new Error(
				`${branch} must match ${upstream} before releasing (ahead ${ahead}, behind ${behind})`,
			);
		}

		this.#run("gh", ["auth", "status"]);
		if (this.#probe("git", ["show-ref", "--verify", "--quiet", `refs/tags/${this.#tag}`]) === 0) {
			throw new Error(`local tag ${this.#tag} already exists`);
		}

		const remote = this.#capture("git", ["config", `branch.${branch}.remote`]);
		const remoteTagStatus = this.#probe("git", [
			"ls-remote",
			"--exit-code",
			"--tags",
			remote,
			`refs/tags/${this.#tag}`,
		]);
		if (remoteTagStatus === 0) {
			throw new Error(`remote tag ${this.#tag} already exists`);
		}
		if (remoteTagStatus !== 2) {
			throw new Error(`could not check whether remote tag ${this.#tag} exists`);
		}
	}

	#verify() {
		this.#run("pnpm", ["typecheck"]);
		this.#run("pnpm", ["lint"]);
		this.#run("pnpm", ["test"]);
		this.#run("pnpm", ["build"]);
	}

	#pack() {
		this.#temporaryDirectory = mkdtempSync(join(tmpdir(), "stagereview-release-"));
		const output = this.#capture(
			"npm",
			["pack", "--json", "--silent", "--pack-destination", this.#temporaryDirectory],
			this.#packageDirectory,
			this.#npmEnvironment(),
		);
		const packResults = JSON.parse(output);
		if (!Array.isArray(packResults) || packResults.length !== 1) {
			throw new Error("npm pack did not produce exactly one package");
		}

		const packageResult = packResults[0];
		if (
			typeof packageResult !== "object" ||
			packageResult === null ||
			typeof packageResult.filename !== "string" ||
			!Array.isArray(packageResult.files)
		) {
			throw new Error("npm pack returned an unexpected result");
		}

		const filePaths = new Set(
			packageResult.files.map((file) =>
				typeof file === "object" && file !== null && typeof file.path === "string" ? file.path : "",
			),
		);
		const missingFiles = REQUIRED_PACKAGE_FILES.filter((file) => !filePaths.has(file));
		if (![...filePaths].some((file) => file.startsWith("drizzle/"))) {
			missingFiles.push("drizzle/*");
		}
		if (missingFiles.length > 0) {
			throw new Error(`release package is missing: ${missingFiles.join(", ")}`);
		}

		this.#write(`Packed ${packageResult.filename}\n`);
		return join(this.#temporaryDirectory, packageResult.filename);
	}

	#publish(tarballPath) {
		const commit = this.#capture("git", ["rev-parse", "HEAD"]);
		this.#run("gh", [
			"release",
			"create",
			this.#tag,
			tarballPath,
			"--target",
			commit,
			"--title",
			this.#tag,
			"--generate-notes",
		]);

		const releaseUrl = this.#capture("gh", [
			"release",
			"view",
			this.#tag,
			"--json",
			"url",
			"--jq",
			".url",
		]);
		this.#write(`Released ${this.#tag}: ${releaseUrl}\n`);
	}

	#run(command, args, cwd = this.#repositoryRoot) {
		const result = spawnSync(command, args, { cwd, stdio: "inherit" });
		if (result.error !== undefined) {
			throw result.error;
		}
		if (result.status !== 0) {
			throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
		}
	}

	#capture(command, args, cwd = this.#repositoryRoot, env = process.env) {
		return execFileSync(command, args, { cwd, encoding: "utf8", env }).trim();
	}

	#npmEnvironment() {
		return Object.fromEntries(
			Object.entries(process.env).filter(([name]) => !name.toLowerCase().startsWith("npm_config_")),
		);
	}

	#probe(command, args) {
		const result = spawnSync(command, args, {
			cwd: this.#repositoryRoot,
			stdio: "ignore",
		});
		if (result.error !== undefined) {
			throw result.error;
		}
		return result.status;
	}

	#write(message) {
		process.stdout.write(message);
	}
}

function printUsage() {
	process.stdout.write(`Usage: pnpm release [--dry-run]\n
Build, package, and publish packages/cli as a GitHub Release tagged from its package version.

Options:
  --dry-run  Run verification and packaging without creating a tag or release
  --help     Show this help
`);
}

const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.includes("--help")) {
	printUsage();
	process.exit(0);
}

const unknownArgs = args.filter((arg) => arg !== "--dry-run");
if (unknownArgs.length > 0) {
	process.stderr.write(`Unknown option: ${unknownArgs.join(", ")}\n`);
	printUsage();
	process.exit(1);
}

try {
	new ReleasePublisher({ dryRun: args.includes("--dry-run") }).run();
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`Release failed: ${message}\n`);
	process.exit(1);
}
