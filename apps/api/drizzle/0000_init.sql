CREATE TABLE `attachments` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`kind` varchar(16) NOT NULL,
	`storage_key` varchar(255) NOT NULL,
	`original_mime` varchar(64) NOT NULL,
	`stored_mime` varchar(64) NOT NULL,
	`size_bytes` int NOT NULL,
	`sha256` char(64) NOT NULL,
	`width` int,
	`height` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `captures` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`source` varchar(16) NOT NULL,
	`raw_text` mediumtext,
	`attachment_id` char(36),
	`note` varchar(500),
	`normalized_text` mediumtext,
	`edited_text` mediumtext,
	`ocr_confidence` double,
	`content_hash` char(64),
	`client_request_id` char(36) NOT NULL,
	`status` varchar(24) NOT NULL,
	`failure_code` varchar(64),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `captures_id` PRIMARY KEY(`id`),
	CONSTRAINT `captures_user_client_req_uq` UNIQUE(`user_id`,`client_request_id`)
);
--> statement-breakpoint
CREATE TABLE `case_captures` (
	`case_id` char(36) NOT NULL,
	`capture_id` char(36) NOT NULL,
	`suggestion_id` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `case_captures_case_id_capture_id_pk` PRIMARY KEY(`case_id`,`capture_id`)
);
--> statement-breakpoint
CREATE TABLE `case_events` (
	`id` char(36) NOT NULL,
	`case_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`type` varchar(32) NOT NULL,
	`actor` varchar(16) NOT NULL,
	`from_value` json,
	`to_value` json,
	`note` text,
	`capture_id` char(36),
	`source_suggestion_id` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `case_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `case_identifiers` (
	`id` char(36) NOT NULL,
	`case_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`kind` varchar(24) NOT NULL,
	`value_normalized` varchar(120) NOT NULL,
	`value_display` varchar(120) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `case_identifiers_id` PRIMARY KEY(`id`),
	CONSTRAINT `case_identifiers_uq` UNIQUE(`case_id`,`kind`,`value_normalized`)
);
--> statement-breakpoint
CREATE TABLE `cases` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text,
	`category` varchar(32) NOT NULL,
	`commitment_type` varchar(32) NOT NULL,
	`waiting_on` varchar(16) NOT NULL,
	`counterparty_name` varchar(200),
	`counterparty_normalized` varchar(200),
	`status` varchar(16) NOT NULL,
	`status_label` varchar(120),
	`lifecycle_stage` varchar(32),
	`next_action` varchar(300),
	`amount_minor` bigint,
	`currency` char(3),
	`deadline_at` datetime(3),
	`deadline_kind` varchar(16) NOT NULL DEFAULT 'NONE',
	`deadline_evidence` varchar(300),
	`followup_at` datetime(3),
	`snoozed_until` datetime(3),
	`resolved_at` datetime(3),
	`version` int NOT NULL DEFAULT 1,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `cases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `extraction_runs` (
	`id` char(36) NOT NULL,
	`capture_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`stage` varchar(16) NOT NULL,
	`provider` varchar(32) NOT NULL,
	`model` varchar(64),
	`prompt_version` varchar(32),
	`input_hash` char(64),
	`raw_output` json,
	`validated_output` json,
	`validation_issues` json,
	`tokens_in` int,
	`tokens_out` int,
	`latency_ms` int,
	`status` varchar(16) NOT NULL,
	`error` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `extraction_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` char(36) NOT NULL,
	`type` varchar(64) NOT NULL,
	`payload` json NOT NULL,
	`status` varchar(16) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`max_attempts` int NOT NULL DEFAULT 3,
	`run_at` datetime(3) NOT NULL,
	`locked_until` datetime(3),
	`locked_by` varchar(64),
	`last_error` text,
	`dedupe_key` varchar(191),
	`user_id` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `jobs_dedupe_uq` UNIQUE(`dedupe_key`)
);
--> statement-breakpoint
CREATE TABLE `suggestion_match_candidates` (
	`id` char(36) NOT NULL,
	`suggestion_id` char(36) NOT NULL,
	`case_id` char(36) NOT NULL,
	`score` double NOT NULL,
	`strength` varchar(8) NOT NULL,
	`reasons` json NOT NULL,
	`rank` int NOT NULL,
	CONSTRAINT `suggestion_match_candidates_id` PRIMARY KEY(`id`),
	CONSTRAINT `smc_suggestion_case_uq` UNIQUE(`suggestion_id`,`case_id`)
);
--> statement-breakpoint
CREATE TABLE `suggestion_reviews` (
	`id` char(36) NOT NULL,
	`suggestion_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`action` varchar(24) NOT NULL,
	`field_diff` json,
	`reject_reason` varchar(64),
	`resulting_case_id` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `suggestion_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suggestions` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`capture_id` char(36) NOT NULL,
	`extraction_run_id` char(36),
	`kind` varchar(24) NOT NULL,
	`proposed` json NOT NULL,
	`target_case_id` char(36),
	`duplicate_of_capture_id` char(36),
	`confidence_score` double NOT NULL,
	`confidence_band` varchar(8) NOT NULL,
	`confidence_factors` json NOT NULL,
	`scoring_version` varchar(16) NOT NULL,
	`status` varchar(16) NOT NULL,
	`resolved_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `suggestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(36) NOT NULL,
	`email` varchar(320) NOT NULL,
	`password_hash` varchar(255),
	`display_name` varchar(100) NOT NULL,
	`timezone` varchar(64) NOT NULL DEFAULT 'Asia/Kolkata',
	`default_currency` char(3) NOT NULL DEFAULT 'INR',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_uq` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `captures` ADD CONSTRAINT `captures_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `captures` ADD CONSTRAINT `captures_attachment_id_attachments_id_fk` FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `case_captures` ADD CONSTRAINT `case_captures_case_id_cases_id_fk` FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `case_captures` ADD CONSTRAINT `case_captures_capture_id_captures_id_fk` FOREIGN KEY (`capture_id`) REFERENCES `captures`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `case_events` ADD CONSTRAINT `case_events_case_id_cases_id_fk` FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `case_events` ADD CONSTRAINT `case_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `case_identifiers` ADD CONSTRAINT `case_identifiers_case_id_cases_id_fk` FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `case_identifiers` ADD CONSTRAINT `case_identifiers_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cases` ADD CONSTRAINT `cases_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `extraction_runs` ADD CONSTRAINT `extraction_runs_capture_id_captures_id_fk` FOREIGN KEY (`capture_id`) REFERENCES `captures`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `extraction_runs` ADD CONSTRAINT `extraction_runs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `suggestion_match_candidates` ADD CONSTRAINT `suggestion_match_candidates_suggestion_id_suggestions_id_fk` FOREIGN KEY (`suggestion_id`) REFERENCES `suggestions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `suggestion_match_candidates` ADD CONSTRAINT `suggestion_match_candidates_case_id_cases_id_fk` FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `suggestion_reviews` ADD CONSTRAINT `suggestion_reviews_suggestion_id_suggestions_id_fk` FOREIGN KEY (`suggestion_id`) REFERENCES `suggestions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `suggestion_reviews` ADD CONSTRAINT `suggestion_reviews_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `suggestions` ADD CONSTRAINT `suggestions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `suggestions` ADD CONSTRAINT `suggestions_capture_id_captures_id_fk` FOREIGN KEY (`capture_id`) REFERENCES `captures`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `suggestions` ADD CONSTRAINT `suggestions_extraction_run_id_extraction_runs_id_fk` FOREIGN KEY (`extraction_run_id`) REFERENCES `extraction_runs`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `suggestions` ADD CONSTRAINT `suggestions_target_case_id_cases_id_fk` FOREIGN KEY (`target_case_id`) REFERENCES `cases`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `attachments_user_idx` ON `attachments` (`user_id`);--> statement-breakpoint
CREATE INDEX `attachments_user_sha_idx` ON `attachments` (`user_id`,`sha256`);--> statement-breakpoint
CREATE INDEX `captures_user_created_idx` ON `captures` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `captures_user_hash_idx` ON `captures` (`user_id`,`content_hash`);--> statement-breakpoint
CREATE INDEX `case_events_case_created_idx` ON `case_events` (`case_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `case_identifiers_user_value_idx` ON `case_identifiers` (`user_id`,`value_normalized`);--> statement-breakpoint
CREATE INDEX `cases_user_status_followup_idx` ON `cases` (`user_id`,`status`,`followup_at`);--> statement-breakpoint
CREATE INDEX `cases_user_counterparty_idx` ON `cases` (`user_id`,`counterparty_normalized`,`status`);--> statement-breakpoint
CREATE INDEX `cases_user_amount_idx` ON `cases` (`user_id`,`amount_minor`);--> statement-breakpoint
CREATE INDEX `extraction_runs_capture_idx` ON `extraction_runs` (`capture_id`);--> statement-breakpoint
CREATE INDEX `jobs_status_run_at_idx` ON `jobs` (`status`,`run_at`);--> statement-breakpoint
CREATE INDEX `suggestion_reviews_suggestion_idx` ON `suggestion_reviews` (`suggestion_id`);--> statement-breakpoint
CREATE INDEX `suggestions_user_status_idx` ON `suggestions` (`user_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `suggestions_capture_idx` ON `suggestions` (`capture_id`);