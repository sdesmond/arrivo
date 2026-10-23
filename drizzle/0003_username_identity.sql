-- Accounts sign in with a username instead of an email; sharing keys on user ids. Existing accounts get the
-- part of their email before the "@" (sanitized to the username rules in src/lib/username.ts), with -2, -3…
-- on collisions.
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
DO $$
DECLARE
  account record;
  stem text;
  candidate text;
  attempt integer;
BEGIN
  FOR account IN SELECT "id", "email" FROM "users" ORDER BY "email" NULLS LAST, "id" LOOP
    stem := regexp_replace(lower(split_part(coalesce(account."email", ''), '@', 1)), '[^a-z0-9._-]', '', 'g');
    stem := regexp_replace(stem, '^[._-]+', '');
    IF stem = '' THEN stem := 'user'; END IF;
    IF length(stem) < 3 THEN stem := rpad(stem, 3, '0'); END IF;
    stem := left(stem, 25);
    candidate := stem;
    attempt := 1;
    WHILE EXISTS (SELECT 1 FROM "users" WHERE "username" = candidate) LOOP
      attempt := attempt + 1;
      candidate := stem || '-' || attempt;
    END LOOP;
    UPDATE "users" SET "username" = candidate WHERE "id" = account."id";
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "invitee_id" uuid;--> statement-breakpoint
UPDATE "invitations" SET "invitee_id" = "users"."id" FROM "users"
  WHERE lower(trim("invitations"."email")) = lower(trim("users"."email"));--> statement-breakpoint
-- Invitations could only be sent to existing accounts, so an unmatched row belonged to a since-deleted user.
DELETE FROM "invitations" WHERE "invitee_id" IS NULL;--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "invitee_id" SET NOT NULL;--> statement-breakpoint
UPDATE "collaborators" SET "user_id" = "users"."id" FROM "users"
  WHERE "collaborators"."user_id" IS NULL
    AND lower(trim("collaborators"."email")) = lower(trim("users"."email"))
    AND NOT EXISTS (
      SELECT 1 FROM "collaborators" AS "existing"
      WHERE "existing"."trip_id" = "collaborators"."trip_id" AND "existing"."user_id" = "users"."id"
    );--> statement-breakpoint
-- Sign-in failure counters were keyed by the typed email; they're keyed by username from now on.
DELETE FROM "auth_throttle" WHERE "key" LIKE 'email:%';--> statement-breakpoint
ALTER TABLE "collaborators" DROP CONSTRAINT "collaborators_trip_id_email_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
DROP INDEX "invitations_pending_trip_email_unique";--> statement-breakpoint
DROP INDEX "invitations_normalized_email";--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitee_id_users_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_pending_trip_invitee_unique" ON "invitations" USING btree ("trip_id","invitee_id") WHERE "invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "invitations_invitee_id_idx" ON "invitations" USING btree ("invitee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_unique" ON "users" USING btree (lower("username"));--> statement-breakpoint
ALTER TABLE "collaborators" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "invitations" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "email_verified";--> statement-breakpoint
ALTER TABLE "collaborators" ADD CONSTRAINT "collaborators_trip_id_user_id_unique" UNIQUE("trip_id","user_id");
