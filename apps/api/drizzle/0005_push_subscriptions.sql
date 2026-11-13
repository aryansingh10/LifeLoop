CREATE TABLE `push_subscriptions` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`endpoint_hash` char(64) NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` varchar(255) NOT NULL,
	`auth` varchar(255) NOT NULL,
	`user_agent` varchar(255),
	`failure_count` int NOT NULL DEFAULT 0,
	`last_success_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `push_subscriptions_endpoint_uq` UNIQUE(`endpoint_hash`)
);
--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`user_id`);