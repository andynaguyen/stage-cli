PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_comment_thread` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`scopeKey` text NOT NULL,
	`filePath` text NOT NULL,
	`anchor` text DEFAULT 'line' NOT NULL,
	`side` text,
	`startLine` integer,
	`endLine` integer,
	`resolvedAt` integer
);
--> statement-breakpoint
INSERT INTO `__new_comment_thread`("id", "createdAt", "updatedAt", "scopeKey", "filePath", "anchor", "side", "startLine", "endLine", "resolvedAt") SELECT "id", "createdAt", "updatedAt", "scopeKey", "filePath", 'line', "side", "startLine", "endLine", "resolvedAt" FROM `comment_thread`;--> statement-breakpoint
DROP TABLE `comment_thread`;--> statement-breakpoint
ALTER TABLE `__new_comment_thread` RENAME TO `comment_thread`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `comment_thread_scope_key_idx` ON `comment_thread` (`scopeKey`);
