import {
	AGENT_PROVIDER,
	type AgentModel,
	type AgentPermissionDecision,
	type AgentProviderCapability,
	type AgentProviderId,
	type AgentSelection,
} from "@stagereview/types/agent";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	AGENT_MESSAGE_STATUS,
	type AgentChatMessage,
	type AgentPendingPermission,
	applyAgentStreamEvent,
	describeAgentError,
	isAgentAbortError,
	newAgentMessage,
} from "./agent-chat-message";
import { AgentSessionController } from "./agent-session-controller";
import { useAgentCapability } from "./use-agent-capability";

export {
	AGENT_ACTIVITY_PHASE,
	AGENT_MESSAGE_STATUS,
	type AgentChatActivity,
	type AgentChatMessage,
} from "./agent-chat-message";

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
interface AskAgentPanelContextValue {
	isOpen: boolean;
	open: () => void;
}

interface AskAgentSelectionContextValue {
	openWithSelection: (selection: AgentSelection) => void;
}

const AskAgentPanelContext = createContext<AskAgentPanelContextValue | null>(null);
const AskAgentSelectionContext = createContext<AskAgentSelectionContextValue | null>(null);
const EMPTY_MODELS: AgentModel[] = [];

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
	const {
		capability,
		isLoading: isCapabilityLoading,
		refresh: refreshCapability,
	} = useAgentCapability(runId, providerId);
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
	const sessionController = useMemo(() => new AgentSessionController(runId), [runId]);
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

	useEffect(() => () => sessionController.dispose(), [sessionController]);

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
			if (trimmedQuestion.length === 0) return;

			const selection = pendingSelection;
			const assistantMessage = newAgentMessage(
				"assistant",
				"",
				null,
				AGENT_MESSAGE_STATUS.STREAMING,
			);
			const assistantMessageId = assistantMessage.id;
			const stream = sessionController.startQuery({
				configuration: {
					providerId,
					...(selectedModel ? { model: selectedModel.id } : {}),
					...(reasoningEffort ? { reasoningEffort } : {}),
					...(serviceTier ? { serviceTier } : {}),
				},
				question: trimmedQuestion,
				selection,
				onEvent: (event) => {
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
							message.id === assistantMessageId ? applyAgentStreamEvent(message, event) : message,
						),
					);
				},
			});
			if (!stream) return;
			const userMessage = newAgentMessage(
				"user",
				trimmedQuestion,
				selection,
				AGENT_MESSAGE_STATUS.COMPLETED,
			);
			setMessages((current) => [...current, userMessage, assistantMessage]);
			setPendingSelection(null);
			setPendingPermissions([]);
			setIsStreaming(true);

			try {
				await stream;
			} catch (error) {
				if (isAgentAbortError(error)) return;
				setMessages((current) =>
					current.map((message) =>
						message.id === assistantMessageId
							? {
									...message,
									notices: [...message.notices, describeAgentError(error)],
									status: AGENT_MESSAGE_STATUS.ERROR,
								}
							: message,
					),
				);
			} finally {
				setIsStreaming(sessionController.isStreaming);
				if (!sessionController.isStreaming) setPendingPermissions([]);
			}
		},
		[pendingSelection, providerId, reasoningEffort, selectedModel, serviceTier, sessionController],
	);

	const stop = useCallback(() => {
		sessionController.stop();
		setIsStreaming(false);
		setPendingPermissions([]);
		setMessages((current) =>
			current.map((message) =>
				message.status === AGENT_MESSAGE_STATUS.STREAMING
					? { ...message, status: AGENT_MESSAGE_STATUS.STOPPED }
					: message,
			),
		);
	}, [sessionController]);

	const reset = useCallback(() => {
		sessionController.reset();
		setMessages([]);
		setPendingSelection(null);
		setPendingPermissions([]);
		setIsStreaming(false);
		setFocusRequest((request) => request + 1);
	}, [sessionController]);

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
			const responded = await sessionController.respondToPermission(requestId, decision);
			if (!responded) return;
			setPendingPermissions((current) =>
				current.filter((permission) => permission.requestId !== requestId),
			);
		},
		[sessionController],
	);

	const panelValue = useMemo<AskAgentPanelContextValue>(() => ({ isOpen, open }), [isOpen, open]);
	const selectionValue = useMemo<AskAgentSelectionContextValue>(
		() => ({ openWithSelection }),
		[openWithSelection],
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

	return (
		<AskAgentPanelContext.Provider value={panelValue}>
			<AskAgentSelectionContext.Provider value={selectionValue}>
				<AskAgentContext.Provider value={value}>{children}</AskAgentContext.Provider>
			</AskAgentSelectionContext.Provider>
		</AskAgentPanelContext.Provider>
	);
}

export function useAskAgent(): AskAgentContextValue {
	const value = useContext(AskAgentContext);
	if (!value) throw new Error("useAskAgent must be used within an AskAgentProvider");
	return value;
}

export function useOptionalAskAgent(): AskAgentContextValue | null {
	return useContext(AskAgentContext);
}

export function useAskAgentPanel(): AskAgentPanelContextValue {
	const value = useContext(AskAgentPanelContext);
	if (!value) throw new Error("useAskAgentPanel must be used within an AskAgentProvider");
	return value;
}

export function useOptionalAskAgentSelection(): AskAgentSelectionContextValue | null {
	return useContext(AskAgentSelectionContext);
}

export { AGENT_PERMISSION_DECISION } from "@stagereview/types/agent";
