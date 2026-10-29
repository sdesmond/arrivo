ALTER TABLE "instance_state" RENAME TO "app_state";--> statement-breakpoint
ALTER TABLE "app_state" RENAME CONSTRAINT "instance_state_pkey" TO "app_state_pkey";--> statement-breakpoint
ALTER TABLE "app_state" RENAME CONSTRAINT "instance_state_singleton" TO "app_state_singleton";--> statement-breakpoint
ALTER TABLE "app_state" RENAME CONSTRAINT "instance_state_activity_retention_days" TO "app_state_activity_retention_days";
