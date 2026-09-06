CREATE TABLE `notebooks` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`source_path` text NOT NULL,
	`title` text NOT NULL,
	`language` text NOT NULL,
	`visibility` text NOT NULL,
	`imported_at` text NOT NULL,
	`analysis_status` text NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_notebooks_repository_path` ON `notebooks` (`repository_id`,`source_path`);--> statement-breakpoint
CREATE INDEX `idx_notebooks_repository_id` ON `notebooks` (`repository_id`);--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_url` text NOT NULL,
	`platform` text NOT NULL,
	`external_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`authors_json` text NOT NULL,
	`license` text NOT NULL,
	`doi` text,
	`keywords_json` text NOT NULL,
	`metadata_completeness` integer NOT NULL,
	`default_branch` text,
	`source_updated_at` text,
	`imported_at` text NOT NULL,
	`import_status` text NOT NULL,
	`warnings_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_repositories_canonical_url` ON `repositories` (`canonical_url`);--> statement-breakpoint
CREATE INDEX `idx_repositories_platform` ON `repositories` (`platform`);--> statement-breakpoint
CREATE INDEX `idx_repositories_imported_at` ON `repositories` (`imported_at`);