import { Settings2 } from "lucide-react";
import { DiffSettingsForm } from "@/components/diff/diff-settings-form";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function DisplaySettingsButton() {
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className="h-8 px-2.5"
							aria-label="Display settings"
						>
							<Settings2 className="size-3.5" />
							<span className="text-xs">Display</span>
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>Display settings</TooltipContent>
			</Tooltip>
			<PopoverContent align="end" className="w-80">
				<DiffSettingsForm compact />
			</PopoverContent>
		</Popover>
	);
}
