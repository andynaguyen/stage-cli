import {
	AGENT_CAPABILITY_STATUS,
	AGENT_PERMISSION_DECISION,
	AGENT_PROVIDER,
	type AgentModel,
	type AgentPermissionDecision,
	type AgentProviderCapability,
	type AgentProviderId,
	type AgentSelection,
	type AgentStreamEvent,
} from "@stagereview/types/agent";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	abortAgentSession,
	createAgentSession,
	deleteAgentSession,
	getAgentCapabilities,
	respondToAgentPermission,
	streamAgentQuery,
} from "./agent-api";

export const AGENT_MESSAGE_STATUS = {
	STREAMING: "streaming",
	COMPLETED: "completed",
	STOPPED: "stopped",
	ERROR: "error",
} as const;
export type AgentMessageStatus = (typeof AGENT_MESSAGE_STATUS)[keyof typeof AGENT_MESSAGE_STATUS];

export const AGENT_ACTIVITY_PHASE = {
	STARTED: "started",
	COMPLETED: "completed",
} as const;

export interface AgentChatActivity {
	id: string;
	label: string;
	phase: (typeof AGENT_ACTIVITY_PHASE)[keyof typeof AGENT_ACTIVITY_PHASE];
	detail: string | null;
	exitCode: number | null;
}

export interface AgentChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	selection: AgentSelection | null;
	activities: AgentChatActivity[];
	notices: string[];
	status: AgentMessageStatus;
}

export interface AgentPendingPermission {
	requestId: string | number;
	title: string;
	description: string | null;
}

interface AskAgentContextValue {
	isOpen: boolean;
	capability: AgentProviderCapability | null;
	isCapabilityLoading: boolean;
	messages: AgentChatMessage[];
	pendingSelection: AgentSelection | null;
	pendingPermissions: AgentPendingPermission[];
	isStreaming: boolean;
	focusRequest: number;
	models: AgentModel[];
	selectedModel: AgentModel | null;
	reasoningEffort: string | null;
	serviceTier: string | null;
	open: () => void;
	close: () => void;
	openWithSelection: (selection: AgentSelection) => void;
	clearSelection: () => void;
	refreshCapability: () => void;
	selectModel: (modelId: string) => void;
	selectReasoningEffort: (effort: string | null) => void;
	selectServiceTier: (tier: string | null) => void;
	send: (question: string) => Promise<void>;
	stop: () => void;
	reset: () => void;
	respondToPermission: (
		requestId: string | number,
		decision: AgentPermissionDecision,
	) => Promise<void>;
}

const AskAgentContext = createContext<AskAgentContextValue | null>(null);
const EMPTY_MODELS: AgentModel[] = [];

function newMessage(
	role: AgentChatMessage["role"],
	content: string,
	selection: AgentSelection | null,
	status: AgentMessageStatus,
): AgentChatMessage {
	return {
		id: crypto.randomUUID(),
		role,
		content,
		selection,
		activities: [],
		notices: [],
		status,
	};
}

function describeError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return "Ask Agent encountered an unexpected error";
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === "AbortError";
}

function applyStreamEvent(message: AgentChatMessage, event: AgentStreamEvent): AgentChatMessage {
	switch (event.type) {
		case "text_delta":
			return { ...message, content: message.content + event.text };
		case "activity": {
			const activity: AgentChatActivity = {
				id: event.activityId,
				label: event.label,
				phase: event.phase,
				detail: event.detail,
				exitCode: event.exitCode,
			};
			const existingIndex = message.activities.findIndex((item) => item.id === event.activityId);
			if (existingIndex === -1) {
				return { ...message, activities: [...message.activities, activity] };
			}
			return {
				...message,
				activities: message.activities.map((item, index) =>
					index === existingIndex ? activity : item,
				),
			};
		}
		case "write_blocked":
			return { ...message, notices: [...message.notices, event.message] };
		case "error":
			return {
				...message,
				notices: [...message.notices, event.message],
				status: AGENT_MESSAGE_STATUS.ERROR,
			};
		case "turn_completed":
			return {
				...message,
				status:
					event.outcome === "completed"
						? AGENT_MESSAGE_STATUS.COMPLETED
						: event.outcome === "stopped"
							? AGENT_MESSAGE_STATUS.STOPPED
							: AGENT_MESSAGE_STATUS.ERROR,
			};
		case "permission_request":
			return message;
	}
}

interface AskAgentProviderProps {
	runId: string;
	providerId?: AgentProviderId;
	children: ReactNode;
}

export function AskAgentProvider({
	runId,
	providerId = AGENT_PROVIDER.CODEX,
	children,
}: AskAgentProviderProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [capability, setCapability] = useState<AgentProviderCapability | null>(null);
	const [isCapabilityLoading, setIsCapabilityLoading] = useState(true);
	const [messages, setMessages] = useState<AgentChatMessage[]>([]);
	const [pendingSelection, setPendingSelection] = useState<AgentSelection | null>(null);
	const [pendingPermissions, setPendingPermissions] = useState<AgentPendingPermission[]>([]);
	const [isStreaming, setIsStreaming] = useState(false);
	const [focusRequest, setFocusRequest] = useState(0);
	const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
	const [reasoningEffortByModel, setReasoningEffortByModel] = useState<Map<string, string>>(
		() => new Map(),
	);
	const [serviceTierByModel, setServiceTierByModel] = useState<Map<string, string>>(
		() => new Map(),
	);
	const capabilityGenerationRef = useRef(0);
	const sessionIdRef = useRef<string | null>(null);
	const sessionPromiseRef = useRef<Promise<string> | null>(null);
	const streamControllerRef = useRef<AbortController | null>(null);
	const streamingRef = useRef(false);
	const generationRef = useRef(0);
	const sessionGenerationRef = useRef(0);
	const models = capability?.models ?? EMPTY_MODELS;
	const selectedModel = useMemo(() => {
		const selected = models.find((model) => model.id === selectedModelId);
		if (selected) return selected;
		return models.find((model) => model.isDefault) ?? models[0] ?? null;
	}, [models, selectedModelId]);
	const reasoningEffort = selectedModel
		? (reasoningEffortByModel.get(selectedModel.id) ?? null)
		: null;
	const serviceTier = selectedModel ? (serviceTierByModel.get(selectedModel.id) ?? null) : null;

	const refreshCapability = useCallback(() => {
		const generation = capabilityGenerationRef.current + 1;
		capabilityGenerationRef.current = generation;
		setIsCapabilityLoading(true);
		void getAgentCapabilities(runId)
			.then(({ providers }) => {
				if (capabilityGenerationRef.current !== generation) return;
				const providerCapability =
					providers.find((provider) => provider.providerId === providerId) ?? null;
				setCapability(providerCapability);
			})
			.catch((error: unknown) => {
				if (capabilityGenerationRef.current !== generation) return;
				setCapability({
					providerId,
					label: "Local agent",
					status: AGENT_CAPABILITY_STATUS.ERROR,
					detail: describeError(error),
					models: [],
				});
			})
			.finally(() => {
				if (capabilityGenerationRef.current === generation) setIsCapabilityLoading(false);
			});
	}, [providerId, runId]);

	useEffect(() => {
		refreshCapability();
		return () => {
			capabilityGenerationRef.current += 1;
		};
	}, [refreshCapability]);

	useEffect(
		() => () => {
			generationRef.current += 1;
			sessionGenerationRef.current += 1;
			streamControllerRef.current?.abort();
			const sessionId = sessionIdRef.current;
			if (sessionId) void deleteAgentSession(runId, sessionId).catch(() => undefined);
		},
		[runId],
	);

	const ensureSession = useCallback(async (): Promise<string> => {
		if (sessionIdRef.current) return sessionIdRef.current;
		if (sessionPromiseRef.current) return sessionPromiseRef.current;

		const sessionGeneration = sessionGenerationRef.current;
		const sessionPromise = createAgentSession(runId, {
			providerId,
			...(selectedModel ? { model: selectedModel.id } : {}),
			...(reasoningEffort ? { reasoningEffort } : {}),
			...(serviceTier ? { serviceTier } : {}),
		}).then(async (session) => {
			if (sessionGenerationRef.current !== sessionGeneration) {
				await deleteAgentSession(runId, session.sessionId).catch(() => undefined);
				throw new DOMException("Session creation was superseded", "AbortError");
			}
			sessionIdRef.current = session.sessionId;
			return session.sessionId;
		});
		sessionPromiseRef.current = sessionPromise;
		try {
			return await sessionPromise;
		} finally {
			if (sessionPromiseRef.current === sessionPromise) sessionPromiseRef.current = null;
		}
	}, [providerId, reasoningEffort, runId, selectedModel, serviceTier]);

	const open = useCallback(() => {
		setIsOpen(true);
		setFocusRequest((request) => request + 1);
	}, []);

	const close = useCallback(() => setIsOpen(false), []);

	const openWithSelection = useCallback((selection: AgentSelection) => {
		setPendingSelection(selection);
		setIsOpen(true);
		setFocusRequest((request) => request + 1);
	}, []);

	const clearSelection = useCallback(() => setPendingSelection(null), []);

	const send = useCallback(
		async (question: string) => {
			const trimmedQuestion = question.trim();
			if (trimmedQuestion.length === 0 || streamingRef.current) return;

			const selection = pendingSelection;
			const userMessage = newMessage(
				"user",
				trimmedQuestion,
				selection,
				AGENT_MESSAGE_STATUS.COMPLETED,
			);
			const assistantMessage = newMessage("assistant", "", null, AGENT_MESSAGE_STATUS.STREAMING);
			const assistantMessageId = assistantMessage.id;
			const generation = generationRef.current + 1;
			generationRef.current = generation;
			setMessages((current) => [...current, userMessage, assistantMessage]);
			setPendingSelection(null);
			setPendingPermissions([]);
			streamingRef.current = true;
			setIsStreaming(true);

			const controller = new AbortController();
			streamControllerRef.current = controller;
			try {
				const sessionId = await ensureSession();
				await streamAgentQuery(
					runId,
					sessionId,
					trimmedQuestion,
					selection,
					(event) => {
						if (generationRef.current !== generation) return;
						if (event.type === "permission_request") {
							setPendingPermissions((current) => [
								...current.filter((item) => item.requestId !== event.requestId),
								{
									requestId: event.requestId,
									title: event.title,
									description: event.description,
								},
							]);
							return;
						}
						setMessages((current) =>
							current.map((message) =>
								message.id === assistantMessageId ? applyStreamEvent(message, event) : message,
							),
						);
					},
					controller.signal,
				);
			} catch (error) {
				if (generationRef.current !== generation || isAbortError(error)) return;
				setMessages((current) =>
					current.map((message) =>
						message.id === assistantMessageId
							? {
									...message,
									notices: [...message.notices, describeError(error)],
									status: AGENT_MESSAGE_STATUS.ERROR,
								}
							: message,
					),
				);
			} finally {
				if (generationRef.current === generation) {
					streamControllerRef.current = null;
					streamingRef.current = false;
					setIsStreaming(false);
					setPendingPermissions([]);
				}
			}
		},
		[ensureSession, pendingSelection, runId],
	);

	const stop = useCallback(() => {
		generationRef.current += 1;
		streamControllerRef.current?.abort();
		streamControllerRef.current = null;
		streamingRef.current = false;
		setIsStreaming(false);
		setPendingPermissions([]);
		setMessages((current) =>
			current.map((message) =>
				message.status === AGENT_MESSAGE_STATUS.STREAMING
					? { ...message, status: AGENT_MESSAGE_STATUS.STOPPED }
					: message,
			),
		);
		const sessionId = sessionIdRef.current;
		if (sessionId) void abortAgentSession(runId, sessionId).catch(() => undefined);
	}, [runId]);

	const reset = useCallback(() => {
		generationRef.current += 1;
		sessionGenerationRef.current += 1;
		streamControllerRef.current?.abort();
		streamControllerRef.current = null;
		streamingRef.current = false;
		const sessionId = sessionIdRef.current;
		sessionIdRef.current = null;
		sessionPromiseRef.current = null;
		if (sessionId) {
			void abortAgentSession(runId, sessionId)
				.catch(() => undefined)
				.then(() => deleteAgentSession(runId, sessionId))
				.catch(() => undefined);
		}
		setMessages([]);
		setPendingSelection(null);
		setPendingPermissions([]);
		setIsStreaming(false);
		setFocusRequest((request) => request + 1);
	}, [runId]);

	const selectModel = useCallback(
		(modelId: string) => {
			if (selectedModel?.id === modelId) return;
			reset();
			setSelectedModelId(modelId);
		},
		[reset, selectedModel],
	);

	const selectReasoningEffort = useCallback(
		(effort: string | null) => {
			if (!selectedModel || reasoningEffort === effort) return;
			reset();
			setReasoningEffortByModel((current) => {
				const next = new Map(current);
				if (effort) next.set(selectedModel.id, effort);
				else next.delete(selectedModel.id);
				return next;
			});
		},
		[reasoningEffort, reset, selectedModel],
	);

	const selectServiceTier = useCallback(
		(tier: string | null) => {
			if (!selectedModel || serviceTier === tier) return;
			reset();
			setServiceTierByModel((current) => {
				const next = new Map(current);
				if (tier) next.set(selectedModel.id, tier);
				else next.delete(selectedModel.id);
				return next;
			});
		},
		[reset, selectedModel, serviceTier],
	);

	const respondToPermission = useCallback(
		async (requestId: string | number, decision: AgentPermissionDecision) => {
			const sessionId = sessionIdRef.current;
			if (!sessionId) return;
			await respondToAgentPermission(runId, sessionId, requestId, decision);
			setPendingPermissions((current) =>
				current.filter((permission) => permission.requestId !== requestId),
			);
		},
		[runId],
	);

	const value = useMemo<AskAgentContextValue>(
		() => ({
			isOpen,
			capability,
			isCapabilityLoading,
			messages,
			pendingSelection,
			pendingPermissions,
			isStreaming,
			focusRequest,
			models,
			selectedModel,
			reasoningEffort,
			serviceTier,
			open,
			close,
			openWithSelection,
			clearSelection,
			refreshCapability,
			selectModel,
			selectReasoningEffort,
			selectServiceTier,
			send,
			stop,
			reset,
			respondToPermission,
		}),
		[
			isOpen,
			capability,
			isCapabilityLoading,
			messages,
			pendingSelection,
			pendingPermissions,
			isStreaming,
			focusRequest,
			models,
			selectedModel,
			reasoningEffort,
			serviceTier,
			open,
			close,
			openWithSelection,
			clearSelection,
			refreshCapability,
			selectModel,
			selectReasoningEffort,
			selectServiceTier,
			send,
			stop,
			reset,
			respondToPermission,
		],
	);

	return <AskAgentContext.Provider value={value}>{children}</AskAgentContext.Provider>;
}

export function useAskAgent(): AskAgentContextValue {
	const value = useContext(AskAgentContext);
	if (!value) throw new Error("useAskAgent must be used within an AskAgentProvider");
	return value;
}

export function useOptionalAskAgent(): AskAgentContextValue | null {
	return useContext(AskAgentContext);
}

export { AGENT_PERMISSION_DECISION };
