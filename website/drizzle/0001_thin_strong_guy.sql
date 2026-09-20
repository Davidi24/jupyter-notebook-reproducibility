CREATE TABLE `analysis_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`runner_job_id` text NOT NULL,
	`status` text NOT NULL,
	`stage` text NOT NULL,
	`progress` integer NOT NULL,
	`message` text NOT NULL,
	`error` text,
	`result_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_analysis_jobs_runner_job_id` ON `analysis_jobs` (`runner_job_id`);--> statement-breakpoint
CREATE INDEX `idx_analysis_jobs_repository_created` ON `analysis_jobs` (`repository_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_analysis_jobs_status` ON `analysis_jobs` (`status`);--> statement-breakpoint
CREATE TABLE `notebook_analyses` (
	`notebook_id` text PRIMARY KEY NOT NULL,
	`analysis_job_id` text NOT NULL,
	`score` integer,
	`rule_category` text,
	`ai_category` text,
	`confidence_permille` integer,
	`agreement` text,
	`final_category` text,
	`human_review` integer NOT NULL,
	`execution_status` text NOT NULL,
	`execution_duration_seconds` integer,
	`execution_note` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`analysis_job_id`) REFERENCES `analysis_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notebook_analyses_job_id` ON `notebook_analyses` (`analysis_job_id`);