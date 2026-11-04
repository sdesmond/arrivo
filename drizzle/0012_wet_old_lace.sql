ALTER TABLE "app_state" ADD COLUMN "mfa_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_required" boolean DEFAULT false NOT NULL;