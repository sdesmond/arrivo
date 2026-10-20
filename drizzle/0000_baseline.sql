CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_unique" UNIQUE("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checklist_id" uuid NOT NULL,
	"content" text NOT NULL,
	"is_checked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "collaborators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"initials" text NOT NULL,
	"role" text NOT NULL,
	"is_creator" boolean DEFAULT false NOT NULL,
	"tint_bg" text,
	"tint_fg" text,
	CONSTRAINT "collaborators_trip_id_email_unique" UNIQUE("trip_id","email")
);
--> statement-breakpoint
CREATE TABLE "days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"day_number" integer NOT NULL,
	"date" date,
	"label" text NOT NULL,
	"subtitle" text,
	"weather" text,
	"travel_summary" text,
	CONSTRAINT "days_trip_id_day_number_unique" UNIQUE("trip_id","day_number")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid,
	"event_id" uuid,
	"reservation_id" uuid,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"size" text,
	"url" text,
	"preview_lines" jsonb,
	"added_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" uuid,
	"trip_id" uuid NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"displaced_date" date,
	"location_name" text,
	"location_address" text,
	"location_lat" double precision,
	"location_lng" double precision,
	"confirmation_number" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"event_id" uuid,
	"reservation_id" uuid,
	"category" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"converted_amount_trip" numeric(12, 2),
	"conversion_rate_trip" numeric(18, 8),
	"converted_currency_trip" text,
	"converted_amount_profile" numeric(12, 2),
	"conversion_rate_profile" numeric(18, 8),
	"converted_currency_profile" text,
	"date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text NOT NULL,
	"user_id" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_key_user_id_pk" PRIMARY KEY("key","user_id")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "itinerary_checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "itinerary_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text,
	"body" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "packing_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"list_id" uuid,
	"name" text NOT NULL,
	"done" boolean DEFAULT false,
	"is_label" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"label_id" uuid
);
--> statement-breakpoint
CREATE TABLE "packing_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"text" text NOT NULL,
	"is_label" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"label_id" uuid
);
--> statement-breakpoint
CREATE TABLE "packing_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"start_address" text,
	"start_location_name" text,
	"start_location_lat" double precision,
	"start_location_lng" double precision,
	"end_address" text,
	"end_location_name" text,
	"end_location_lat" double precision,
	"end_location_lng" double precision,
	"confirmation_code" text,
	"service_number" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "route_cache" (
	"origin_lat" double precision NOT NULL,
	"origin_lng" double precision NOT NULL,
	"destination_lat" double precision NOT NULL,
	"destination_lng" double precision NOT NULL,
	"transit_mode" text NOT NULL,
	"distance_meters" integer NOT NULL,
	"duration_seconds" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "route_cache_origin_lat_origin_lng_destination_lat_destination_lng_transit_mode_pk" PRIMARY KEY("origin_lat","origin_lng","destination_lat","destination_lng","transit_mode")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_packing_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"cover_image_url" text,
	"cover_photographer" text,
	"cover_photographer_url" text,
	"destination_name" text,
	"destination_country" text,
	"destination_country_code" text,
	"notes" text,
	"budget_currency" text,
	"budget_total" numeric(12, 2),
	"budget_per_person" numeric(12, 2),
	"tags" text[] DEFAULT '{}',
	"transit_mode" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_companions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"age" integer,
	"passport_number" text,
	"passport_expiry" date,
	"passport_nationality" text,
	"known_traveler_number" text,
	"username" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_loyalty_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"program_name" text NOT NULL,
	"member_number" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_wishlist_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp with time zone,
	"image" text,
	"password_hash" text,
	"date_format" text,
	"currency" text,
	"distance_unit" text,
	"transit_mode" text,
	"walk_threshold_meters" integer,
	"passport_number" text,
	"passport_expiry" date,
	"passport_nationality" text,
	"known_traveler_number" text,
	"default_cover_type" text,
	"warning_threshold" integer DEFAULT 80 NOT NULL,
	"danger_threshold" integer DEFAULT 90 NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_unique" UNIQUE("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklist_id_itinerary_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."itinerary_checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaborators" ADD CONSTRAINT "collaborators_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaborators" ADD CONSTRAINT "collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "days" ADD CONSTRAINT "days_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_checklists" ADD CONSTRAINT "itinerary_checklists_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_notes" ADD CONSTRAINT "itinerary_notes_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packing_items" ADD CONSTRAINT "packing_items_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packing_items" ADD CONSTRAINT "packing_items_list_id_trip_packing_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."trip_packing_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packing_items" ADD CONSTRAINT "packing_items_label_id_packing_items_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."packing_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packing_template_items" ADD CONSTRAINT "packing_template_items_template_id_packing_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."packing_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packing_template_items" ADD CONSTRAINT "packing_template_items_label_id_packing_template_items_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."packing_template_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packing_templates" ADD CONSTRAINT "packing_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_packing_lists" ADD CONSTRAINT "trip_packing_lists_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_companions" ADD CONSTRAINT "user_companions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_loyalty_numbers" ADD CONSTRAINT "user_loyalty_numbers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_wishlist_destinations" ADD CONSTRAINT "user_wishlist_destinations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklist_items_checklist_id_created_at_index" ON "checklist_items" USING btree ("checklist_id","created_at");--> statement-breakpoint
CREATE INDEX "events_day_id_position_index" ON "events" USING btree ("day_id","position");--> statement-breakpoint
CREATE INDEX "expenses_trip_id_index" ON "expenses" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "expenses_event_id_index" ON "expenses" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "expenses_reservation_id_index" ON "expenses" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_pending_trip_email_unique" ON "invitations" USING btree ("trip_id","email") WHERE "invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "invitations_normalized_email" ON "invitations" USING btree (lower(trim("email")));--> statement-breakpoint
CREATE INDEX "itinerary_checklists_day_id_position_index" ON "itinerary_checklists" USING btree ("day_id","position");--> statement-breakpoint
CREATE INDEX "itinerary_notes_day_id_position_index" ON "itinerary_notes" USING btree ("day_id","position");--> statement-breakpoint
CREATE INDEX "notes_trip_id_position_index" ON "notes" USING btree ("trip_id","position");--> statement-breakpoint
CREATE INDEX "packing_template_items_template_id_position_index" ON "packing_template_items" USING btree ("template_id","position");--> statement-breakpoint
CREATE INDEX "packing_template_items_label_id_idx" ON "packing_template_items" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "packing_templates_user_id_idx" ON "packing_templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trip_packing_lists_trip_id_position_index" ON "trip_packing_lists" USING btree ("trip_id","position");--> statement-breakpoint
CREATE INDEX "user_companions_user_id_position_index" ON "user_companions" USING btree ("user_id","position");--> statement-breakpoint
CREATE INDEX "user_loyalty_numbers_user_id_position_index" ON "user_loyalty_numbers" USING btree ("user_id","position");--> statement-breakpoint
CREATE INDEX "user_wishlist_destinations_user_id_position_index" ON "user_wishlist_destinations" USING btree ("user_id","position");