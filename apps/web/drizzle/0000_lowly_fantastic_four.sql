CREATE TABLE IF NOT EXISTS `account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `api_token` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	`created_by_user_id` text NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_api_token_org` ON `api_token` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_api_token_hash` ON `api_token` (`token_hash`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `contractor` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`sponsor_user_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`external_ref` text,
	`attributes` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`created_by_user_id` text NOT NULL,
	`updated_by_user_id` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sponsor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_contractor_org_deleted` ON `contractor` (`organization_id`,`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_contractor_org_email_active` ON `contractor` (`organization_id`,`email`) WHERE "contractor"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_contractor_org_sponsor` ON `contractor` (`organization_id`,`sponsor_user_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `explanation_cache` (
	`scope_key` text NOT NULL,
	`source_hash` text NOT NULL,
	`explanation` text NOT NULL,
	`model` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`scope_key`, `source_hash`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `identity_attribute_drift_snapshot` (
	`attribute_name` text PRIMARY KEY NOT NULL,
	`populated_count` integer NOT NULL,
	`total_count` integer NOT NULL,
	`null_ratio` real NOT NULL,
	`tier` text NOT NULL,
	`mapping_profile_ids` text NOT NULL,
	`captured_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_drift_snapshot_tier` ON `identity_attribute_drift_snapshot` (`tier`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expiresAt` integer NOT NULL,
	`inviterId` text NOT NULL,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviterId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `member` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text NOT NULL,
	`userId` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`createdAt` integer NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	`activeOrganizationId` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `source_audit_event` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`source_name` text NOT NULL,
	`action` text NOT NULL,
	`severity` text NOT NULL,
	`actor_user_id` text,
	`actor_label_fallback` text,
	`summary` text NOT NULL,
	`before_snapshot` text,
	`after_snapshot` text,
	`metadata` text,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_source_audit_source` ON `source_audit_event` (`source_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_source_audit_action` ON `source_audit_event` (`action`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_source_audit_actor` ON `source_audit_event` (`actor_user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_source_audit_occurred_at` ON `source_audit_event` (`occurred_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `source_meta` (
	`user_id` text NOT NULL,
	`source_id` text NOT NULL,
	`schema_baseline_at` integer,
	`last_fetched_at` integer,
	PRIMARY KEY(`user_id`, `source_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `source_schema_snapshot` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_id` text NOT NULL,
	`schema_name` text NOT NULL,
	`attr_name` text NOT NULL,
	`attr_type` text,
	`is_multi` integer DEFAULT 0 NOT NULL,
	`is_entitlement` integer DEFAULT 0 NOT NULL,
	`is_required` integer DEFAULT 0 NOT NULL,
	`correlation_key` integer DEFAULT 0 NOT NULL,
	`description` text,
	`tier` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`changed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_source_schema_snapshot_uniq` ON `source_schema_snapshot` (`user_id`,`source_id`,`schema_name`,`attr_name`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_source_schema_snapshot_source` ON `source_schema_snapshot` (`user_id`,`source_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_source_schema_snapshot_tier` ON `source_schema_snapshot` (`user_id`,`source_id`,`tier`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tenant_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`aggregation_freshness_threshold_hours` integer,
	`explain_notice_dismissed` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `transform_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`transform_id` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_transform_samples_user_transform` ON `transform_samples` (`user_id`,`transform_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `transform_test_fixture` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`transform_id` text NOT NULL,
	`name` text NOT NULL,
	`input_value` text DEFAULT '' NOT NULL,
	`simulated_values` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_transform_test_fixture_uniq` ON `transform_test_fixture` (`user_id`,`transform_id`,`name`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_transform_test_fixture_by_transform` ON `transform_test_fixture` (`user_id`,`transform_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer NOT NULL,
	`image` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer,
	`updatedAt` integer
);
