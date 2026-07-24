import { MessageSquareCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAskAgent } from "@/lib/agent-chat-context";

export function AskAgentButton() {
	const { isOpen, open } = useAskAgent();

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant={isOpen ? "secondary" : "outline"}
					size="sm"
					className="h-7 px-2"
					aria-label="Ask Agent"
					aria-pressed={isOpen}
					onClick={open}
				>
					<MessageSquareCode className="size-3.5" />
					<span className="ml-1 hidden text-xs @7xl:inline">Ask Agent</span>
				</Button>
			</TooltipTrigger>
			<TooltipContent>{isOpen ? "Ask Agent is open" : "Ask Agent"}</TooltipContent>
		</Tooltip>
	);
}
