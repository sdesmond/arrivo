CREATE TABLE "credential_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	CONSTRAINT "credential_authorizations_digest_unique" UNIQUE("digest"),
	CONSTRAINT "credential_authorizations_purpose" CHECK ("credential_authorizations"."purpose" in ('setup', 'reset', 'recovery'))
);
--> statement-breakpoint
ALTER TABLE "credential_authorizations" ADD CONSTRAINT "credential_authorizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credential_authorizations_user_purpose_idx" ON "credential_authorizations" USING btree ("user_id","purpose");