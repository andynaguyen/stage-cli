import type { AgentSelection, AgentStreamEvent } from "@stagereview/types/agent";

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

export function newAgentMessage(
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

export function describeAgentError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return "Ask Agent encountered an unexpected error";
}

export function isAgentAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === "AbortError";
}

export function applyAgentStreamEvent(
	message: AgentChatMessage,
	event: AgentStreamEvent,
): AgentChatMessage {
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
