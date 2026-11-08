CREATE TABLE `notifications` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`case_id` char(36),
	`kind` varchar(24) NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` varchar(500) NOT NULL,
	`dedupe_key` varchar(191) NOT NULL,
	`read_at` datetime(3),
	`emailed_at` datetime(3),
	`email_attempts` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `notifications_user_dedupe_uq` UNIQUE(`user_id`,`dedupe_key`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `email_notifications` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `digest_enabled` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `digest_hour` int DEFAULT 9 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_digest_date` varchar(10);--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `notifications_user_created_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_email_idx` ON `notifications` (`emailed_at`,`email_attempts`);