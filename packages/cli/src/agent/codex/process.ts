import { type ChildProcessWithoutNullStreams, execFile, spawn } from "node:child_process";
import type { Readable } from "node:stream";

export interface CodexAppServerProcess {
	readonly stdout: Readable;
	writeLine(line: string): void;
	closeInput(): void;
	terminate(): void;
	onTermination(listener: (error: Error) => void): () => void;
}

export interface CodexProcessFactory {
	start(): CodexAppServerProcess;
}

class NodeCodexAppServerProcess implements CodexAppServerProcess {
	readonly stdout: Readable;
	private readonly child: ChildProcessWithoutNullStreams;
	private terminationTimer: NodeJS.Timeout | null = null;

	constructor() {
		this.child = spawn("codex", ["app-server"], {
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.stdout = this.child.stdout;
		this.child.stderr.resume();
	}

	writeLine(line: string): void {
		if (this.child.stdin.destroyed) {
			throw new Error("Codex app-server stdin is closed");
		}
		this.child.stdin.write(`${line}\n`);
	}

	closeInput(): void {
		if (!this.child.stdin.destroyed) this.child.stdin.end();
	}

	terminate(): void {
		if (this.child.exitCode !== null || this.child.signalCode !== null) return;
		this.closeInput();
		this.child.kill("SIGTERM");
		this.terminationTimer = setTimeout(() => {
			if (this.child.exitCode === null && this.child.signalCode === null) {
				this.child.kill("SIGKILL");
			}
		}, 1000);
		this.terminationTimer.unref();
	}

	onTermination(listener: (error: Error) => void): () => void {
		let handled = false;
		const finish = (error: Error) => {
			if (handled) return;
			handled = true;
			if (this.terminationTimer) clearTimeout(this.terminationTimer);
			listener(error);
		};
		const onError = (error: Error) => finish(error);
		const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
			const detail = signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
			finish(new Error(`Codex app-server exited with ${detail}`));
		};
		this.child.once("error", onError);
		this.child.once("exit", onExit);
		return () => {
			this.child.removeListener("error", onError);
			this.child.removeListener("exit", onExit);
		};
	}
}

export class NodeCodexProcessFactory implements CodexProcessFactory {
	start(): CodexAppServerProcess {
		return new NodeCodexAppServerProcess();
	}
}

export interface CodexCommandResult {
	stdout: string;
	stderr: string;
}

export interface CodexCommandRunner {
	run(args: string[]): Promise<CodexCommandResult>;
}

export class CodexCommandError extends Error {
	constructor(
		message: string,
		readonly code: string | null,
	) {
		super(message);
		this.name = "CodexCommandError";
	}
}

export class NodeCodexCommandRunner implements CodexCommandRunner {
	run(args: string[]): Promise<CodexCommandResult> {
		return new Promise((resolve, reject) => {
			execFile("codex", args, { encoding: "utf8" }, (error, stdout, stderr) => {
				if (error) {
					reject(
						new CodexCommandError(
							error.message,
							typeof error.code === "string" ? error.code : null,
						),
					);
					return;
				}
				resolve({ stdout, stderr });
			});
		});
	}
}
