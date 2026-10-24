-- Halt before any schema change when several legacy accounts exist: there is no safe way to pick the admin.
DO $$
DECLARE
  account_count integer;
BEGIN
  SELECT count(*) INTO account_count FROM "users";
  IF account_count > 1 THEN
    RAISE EXCEPTION 'Cannot upgrade: found % existing accounts and Arrivo cannot choose which one is the instance admin. Reduce the database to the single account that should be admin (delete the others), then restart to re-run this migration.', account_count;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE "instance_state" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"initialized_at" timestamp with time zone,
	CONSTRAINT "instance_state_singleton" CHECK ("instance_state"."id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
-- Create the singleton. A sole legacy account becomes admin and marks the instance initialized; an empty
-- database stays uninitialized so the first sign-up becomes admin.
INSERT INTO "instance_state" ("id", "initialized_at")
  SELECT true, CASE WHEN EXISTS (SELECT 1 FROM "users") THEN now() ELSE NULL END
  ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "users" SET "role" = 'admin' WHERE (SELECT count(*) FROM "users") = 1;
