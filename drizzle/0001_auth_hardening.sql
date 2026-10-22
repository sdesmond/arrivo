CREATE TABLE "auth_throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone,
	"lock_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mfa_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "trusted_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"session_version" integer NOT NULL,
	"mfa_remembered_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trusted_devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_pending_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_last_step" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mfa_recovery_codes_user_id_idx" ON "mfa_recovery_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trusted_devices_user_id_idx" ON "trusted_devices" USING btree ("user_id");