CREATE TABLE `user_identities` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`provider` varchar(16) NOT NULL,
	`provider_subject` varchar(255) NOT NULL,
	`email_at_link` varchar(320) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `user_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_identities_provider_subject_uq` UNIQUE(`provider`,`provider_subject`),
	CONSTRAINT `user_identities_user_provider_uq` UNIQUE(`user_id`,`provider`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` datetime(3);--> statement-breakpoint
ALTER TABLE `user_identities` ADD CONSTRAINT `user_identities_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;