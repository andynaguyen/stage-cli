import { createInterface } from "node:readline";
import {
	type CodexAppServerProcess,
	type CodexProcessFactory,
	NodeCodexProcessFactory,
} from "./process.js";
import {
	type CodexNotification,
	CodexNotificationSchema,
	type CodexRequestId,
	CodexResponseSchema,
	type CodexServerRequest,
	CodexServerRequestSchema,
} from "./protocol.js";

const REQUEST_TIMEOUT_MS = 15_000;

interface CodexAppServerClientOptions {
	requestTimeoutMs?: number;
}

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout;
}

type NotificationListener = (notification: CodexNotification) => void;
type ServerRequestListener = (request: CodexServerRequest) => void;
type FatalListener = (error: Error) => void;

export class CodexAppServerClient {
	private readonly process: CodexAppServerProcess;
	private readonly lines;
	private readonly pending = new Map<number, PendingRequest>();
	private readonly notificationListeners = new Set<NotificationListener>();
	private readonly serverRequestListeners = new Set<ServerRequestListener>();
	private readonly fatalListeners = new Set<FatalListener>();
	private readonly removeTerminationListener: () => void;
	private readonly requestTimeoutMs: number;
	private nextRequestId = 1;
	private disposed = false;

	private constructor(process: CodexAppServerProcess, requestTimeoutMs: number) {
		this.process = process;
		this.requestTimeoutMs = requestTimeoutMs;
		this.lines = createInterface({ input: process.stdout });
		this.lines.on("line", (line) => this.handleLine(line));
		this.removeTerminationListener = process.onTermination((error) => this.fail(error));
	}

	static async start(
		factory: CodexProcessFactory = new NodeCodexProcessFactory(),
		options: CodexAppServerClientOptions = {},
	): Promise<CodexAppServerClient> {
		const client = new CodexAppServerClient(
			factory.start(),
			options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
		);
		try {
			await client.request("initialize", {
				clientInfo: {
					name: "stagereview",
					title: "Stage",
					version: "0.1.0",
				},
				capabilities: null,
			});
			client.notify("initialized", {});
			return client;
		} catch (error) {
			client.dispose();
			throw error;
		}
	}

	request(method: string, params: unknown, timeoutMs = this.requestTimeoutMs): Promise<unknown> {
		if (this.disposed) return Promise.reject(new Error("Codex app-server is closed"));
		const id = this.nextRequestId++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Codex app-server request timed out: ${method}`));
			}, timeoutMs);
			timer.unref();
			this.pending.set(id, { resolve, reject, timer });
			try {
				this.send({ method, id, params });
			} catch (error) {
				clearTimeout(timer);
				this.pending.delete(id);
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}

	notify(method: string, params: unknown): void {
		if (this.disposed) return;
		this.send({ method, params });
	}

	respond(id: CodexRequestId, result: unknown): void {
		if (this.disposed) return;
		this.send({ id, result });
	}

	respondError(id: CodexRequestId, code: number, message: string): void {
		if (this.disposed) return;
		this.send({ id, error: { code, message } });
	}

	onNotification(listener: NotificationListener): () => void {
		this.notificationListeners.add(listener);
		return () => this.notificationListeners.delete(listener);
	}

	onServerRequest(listener: ServerRequestListener): () => void {
		this.serverRequestListeners.add(listener);
		return () => this.serverRequestListeners.delete(listener);
	}

	onFatal(listener: FatalListener): () => void {
		this.fatalListeners.add(listener);
		return () => this.fatalListeners.delete(listener);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.removeTerminationListener();
		this.lines.close();
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(new Error("Codex app-server was disposed"));
		}
		this.pending.clear();
		this.notificationListeners.clear();
		this.serverRequestListeners.clear();
		this.fatalListeners.clear();
		this.process.terminate();
	}

	private handleLine(line: string): void {
		let raw: unknown;
		try {
			raw = JSON.parse(line);
		} catch {
			this.fail(new Error("Codex app-server emitted malformed JSON"));
			return;
		}

		const serverRequest = CodexServerRequestSchema.safeParse(raw);
		if (serverRequest.success) {
			for (const listener of this.serverRequestListeners) listener(serverRequest.data);
			return;
		}

		const response = CodexResponseSchema.safeParse(raw);
		if (response.success) {
			this.handleResponse(response.data);
			return;
		}

		const notification = CodexNotificationSchema.safeParse(raw);
		if (notification.success) {
			for (const listener of this.notificationListeners) listener(notification.data);
			return;
		}

		this.fail(new Error("Codex app-server emitted an unsupported message"));
	}

	private handleResponse(response: ReturnType<typeof CodexResponseSchema.parse>): void {
		if (typeof response.id !== "number") return;
		const pending = this.pending.get(response.id);
		if (!pending) return;
		clearTimeout(pending.timer);
		this.pending.delete(response.id);
		if ("error" in response) {
			pending.reject(new Error(`Codex app-server error: ${response.error.message}`));
			return;
		}
		pending.resolve(response.result);
	}

	private send(message: unknown): void {
		this.process.writeLine(JSON.stringify(message));
	}

	private fail(error: Error): void {
		if (this.disposed) return;
		for (const listener of this.fatalListeners) listener(error);
		this.disposed = true;
		this.removeTerminationListener();
		this.lines.close();
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.pending.clear();
		this.process.terminate();
	}
}
