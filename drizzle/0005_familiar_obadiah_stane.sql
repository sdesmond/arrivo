CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"type" text NOT NULL,
	"actor_id" uuid,
	"actor_username" text,
	"target_id" uuid,
	"target_username" text,
	"trip_id" uuid
);
--> statement-breakpoint
CREATE INDEX "activity_events_ended_at_id_idx" ON "activity_events" USING btree ("ended_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_events_actor_id_idx" ON "activity_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "activity_events_type_idx" ON "activity_events" USING btree ("type");