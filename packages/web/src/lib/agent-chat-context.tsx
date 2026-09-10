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
	type RefCallback,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
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

interface AskAgentPanelContextValue {
	isOpen: boolean;
	open: () => void;
	close: () => void;
	openWithSelection: (selection: AgentSelection) => void;
	composerRef: RefCallback<HTMLTextAreaElement>;
}

interface AskAgentConfigurationContextValue {
	capability: AgentProviderCapability | null;
	isCapabilityLoading: boolean;
	models: AgentModel[];
	selectedModel: AgentModel | null;
	reasoningEffort: string | null;
	serviceTier: string | null;
	refreshCapability: () => void;
	selectModel: (modelId: string) => void;
	selectReasoningEffort: (effort: string | null) => void;
	selectServiceTier: (tier: string | null) => void;
}

interface AskAgentConversationContextValue {
	fileNavigation: AskAgentFileNavigation;
	messages: AgentChatMessage[];
	pendingSelection: AgentSelection | null;
	pendingPermissions: AgentPendingPermission[];
	isStreaming: boolean;
	clearSelection: () => void;
	send: (question: string) => Promise<void>;
	stop: () => void;
	reset: () => void;
	respondToPermission: (
		requestId: string | number,
		decision: AgentPermissionDecision,
	) => Promise<void>;
}

export interface AskAgentFileNavigation {
	filePaths: readonly string[];
	onSelectFile: (filePath: string) => void;
}

interface AskAgentSelectionContextValue {
	openWithSelection: (selection: AgentSelection) => void;
}

const AskAgentPanelContext = createContext<AskAgentPanelContextValue | null>(null);
const AskAgentConfigurationContext = createContext<AskAgentConfigurationContextValue | null>(null);
const AskAgentConversationContext = createContext<AskAgentConversationContextValue | null>(null);
const AskAgentSelectionContext = createContext<AskAgentSelectionContextValue | null>(null);
const EMPTY_MODELS: AgentModel[] = [];
const DEFAULT_MODEL_CONFIGURATION = {
	reasoningEffort: null,
	serviceTier: null,
} as const;

interface AgentModelConfiguration {
	reasoningEffort: string | null;
	serviceTier: string | null;
}

interface AskAgentProviderProps {
	runId: string;
	fileNavigation: AskAgentFileNavigation;
	providerId?: AgentProviderId;
	children: ReactNode;
}

export function AskAgentProvider({
	runId,
	fileNavigation,
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
	const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
	const [configurationByModel, setConfigurationByModel] = useState<
		Map<string, AgentModelConfiguration>
	>(() => new Map());
	const composerElementRef = useRef<HTMLTextAreaElement | null>(null);
	const shouldFocusComposerRef = useRef(false);
	const sessionController = useMemo(() => new AgentSessionController(runId), [runId]);
	const models = capability?.models ?? EMPTY_MODELS;
	const selectedModel = useMemo(() => {
		const selected = models.find((model) => model.id === selectedModelId);
		if (selected) return selected;
		return models.find((model) => model.isDefault) ?? models[0] ?? null;
	}, [models, selectedModelId]);
	const selectedConfiguration = selectedModel
		? (configurationByModel.get(selectedModel.id) ?? DEFAULT_MODEL_CONFIGURATION)
		: DEFAULT_MODEL_CONFIGURATION;
	const { reasoningEffort, serviceTier } = selectedConfiguration;

	useEffect(() => () => sessionController.dispose(), [sessionController]);

	const composerRef = useCallback<RefCallback<HTMLTextAreaElement>>((element) => {
		composerElementRef.current = element;
		if (!element || !shouldFocusComposerRef.current) return;
		shouldFocusComposerRef.current = false;
		element.focus();
	}, []);
	const focusComposer = useCallback(() => {
		const element = composerElementRef.current;
		if (element) {
			element.focus();
			return;
		}
		shouldFocusComposerRef.current = true;
	}, []);

	const open = useCallback(() => {
		setIsOpen(true);
		focusComposer();
	}, [focusComposer]);

	const close = useCallback(() => {
		shouldFocusComposerRef.current = false;
		setIsOpen(false);
	}, []);
	const handleSelectFile = useCallback(
		(filePath: string) => {
			close();
			fileNavigation.onSelectFile(filePath);
		},
		[close, fileNavigation],
	);
	const conversationFileNavigation = useMemo<AskAgentFileNavigation>(
		() => ({ filePaths: fileNavigation.filePaths, onSelectFile: handleSelectFile }),
		[fileNavigation.filePaths, handleSelectFile],
	);

	const openWithSelection = useCallback(
		(selection: AgentSelection) => {
			setPendingSelection(selection);
			setIsOpen(true);
			focusComposer();
		},
		[focusComposer],
	);

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
		focusComposer();
	}, [focusComposer, sessionController]);

	const selectModel = useCallback(
		(modelId: string) => {
			if (selectedModel?.id === modelId) return;
			reset();
			setSelectedModelId(modelId);
		},
		[reset, selectedModel],
	);

	const updateModelConfiguration = useCallback(
		(modelId: string, configuration: AgentModelConfiguration) => {
			reset();
			setConfigurationByModel((current) => {
				const next = new Map(current);
				if (configuration.reasoningEffort === null && configuration.serviceTier === null) {
					next.delete(modelId);
				} else {
					next.set(modelId, configuration);
				}
				return next;
			});
		},
		[reset],
	);

	const selectReasoningEffort = useCallback(
		(effort: string | null) => {
			if (!selectedModel || reasoningEffort === effort) return;
			updateModelConfiguration(selectedModel.id, {
				...selectedConfiguration,
				reasoningEffort: effort,
			});
		},
		[reasoningEffort, selectedConfiguration, selectedModel, updateModelConfiguration],
	);

	const selectServiceTier = useCallback(
		(tier: string | null) => {
			if (!selectedModel || serviceTier === tier) return;
			updateModelConfiguration(selectedModel.id, {
				...selectedConfiguration,
				serviceTier: tier,
			});
		},
		[selectedConfiguration, selectedModel, serviceTier, updateModelConfiguration],
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

	const panelValue = useMemo<AskAgentPanelContextValue>(
		() => ({ isOpen, open, close, openWithSelection, composerRef }),
		[close, composerRef, isOpen, open, openWithSelection],
	);
	const configurationValue = useMemo<AskAgentConfigurationContextValue>(
		() => ({
			capability,
			isCapabilityLoading,
			models,
			selectedModel,
			reasoningEffort,
			serviceTier,
			refreshCapability,
			selectModel,
			selectReasoningEffort,
			selectServiceTier,
		}),
		[
			capability,
			isCapabilityLoading,
			models,
			reasoningEffort,
			refreshCapability,
			selectedModel,
			selectModel,
			selectReasoningEffort,
			selectServiceTier,
			serviceTier,
		],
	);
	const conversationValue = useMemo<AskAgentConversationContextValue>(
		() => ({
			fileNavigation: conversationFileNavigation,
			messages,
			pendingSelection,
			pendingPermissions,
			isStreaming,
			clearSelection,
			send,
			stop,
			reset,
			respondToPermission,
		}),
		[
			clearSelection,
			conversationFileNavigation,
			isStreaming,
			messages,
			pendingPermissions,
			pendingSelection,
			reset,
			respondToPermission,
			send,
			stop,
		],
	);
	const selectionValue = useMemo<AskAgentSelectionContextValue>(
		() => ({ openWithSelection }),
		[openWithSelection],
	);

	return (
		<AskAgentPanelContext.Provider value={panelValue}>
			<AskAgentConfigurationContext.Provider value={configurationValue}>
				<AskAgentConversationContext.Provider value={conversationValue}>
					<AskAgentSelectionContext.Provider value={selectionValue}>
						{children}
					</AskAgentSelectionContext.Provider>
				</AskAgentConversationContext.Provider>
			</AskAgentConfigurationContext.Provider>
		</AskAgentPanelContext.Provider>
	);
}

export function useAskAgentPanel(): AskAgentPanelContextValue {
	const value = useContext(AskAgentPanelContext);
	if (!value) throw new Error("useAskAgentPanel must be used within an AskAgentProvider");
	return value;
}

export function useAskAgentConfiguration(): AskAgentConfigurationContextValue {
	const value = useContext(AskAgentConfigurationContext);
	if (!value) {
		throw new Error("useAskAgentConfiguration must be used within an AskAgentProvider");
	}
	return value;
}

export function useAskAgentConversation(): AskAgentConversationContextValue {
	const value = useContext(AskAgentConversationContext);
	if (!value) throw new Error("useAskAgentConversation must be used within an AskAgentProvider");
	return value;
}

export function useOptionalAskAgentSelection(): AskAgentSelectionContextValue | null {
	return useContext(AskAgentSelectionContext);
}
