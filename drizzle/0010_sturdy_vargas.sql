ALTER TABLE "app_state" ADD COLUMN "password_min_length" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_state" ADD COLUMN "password_max_length" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_state" ADD COLUMN "password_require_uppercase" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_state" ADD COLUMN "password_min_uppercase" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_state" ADD COLUMN "password_require_number" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_state" ADD COLUMN "password_min_numbers" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_state" ADD COLUMN "password_require_special" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_state" ADD COLUMN "password_min_special" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_state" ADD CONSTRAINT "app_state_password_min_length" CHECK ("app_state"."password_min_length" between 8 and 16);--> statement-breakpoint
ALTER TABLE "app_state" ADD CONSTRAINT "app_state_password_max_length" CHECK ("app_state"."password_max_length" between 15 and 20);--> statement-breakpoint
ALTER TABLE "app_state" ADD CONSTRAINT "app_state_password_length_order" CHECK ("app_state"."password_min_length" <= "app_state"."password_max_length");--> statement-breakpoint
ALTER TABLE "app_state" ADD CONSTRAINT "app_state_password_class_minimums" CHECK ("app_state"."password_min_uppercase" between 1 and 20 and "app_state"."password_min_numbers" between 1 and 20 and "app_state"."password_min_special" between 1 and 20);--> statement-breakpoint
ALTER TABLE "app_state" ADD CONSTRAINT "app_state_password_feasible" CHECK ((case when "app_state"."password_require_uppercase" then "app_state"."password_min_uppercase" else 0 end)
        + (case when "app_state"."password_require_number" then "app_state"."password_min_numbers" else 0 end)
        + (case when "app_state"."password_require_special" then "app_state"."password_min_special" else 0 end) <= "app_state"."password_max_length");