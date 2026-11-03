ALTER TABLE "app_state" DROP CONSTRAINT "app_state_password_class_minimums";--> statement-breakpoint
ALTER TABLE "app_state" DROP CONSTRAINT "app_state_password_feasible";--> statement-breakpoint
ALTER TABLE "app_state" ALTER COLUMN "password_min_uppercase" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "app_state" ALTER COLUMN "password_min_numbers" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "app_state" ALTER COLUMN "password_min_special" SET DEFAULT 0;--> statement-breakpoint
-- A class that was switched off becomes a minimum of 0 ("not required"); a switched-on class keeps its count.
UPDATE "app_state" SET
	"password_min_uppercase" = CASE WHEN "password_require_uppercase" THEN "password_min_uppercase" ELSE 0 END,
	"password_min_numbers" = CASE WHEN "password_require_number" THEN "password_min_numbers" ELSE 0 END,
	"password_min_special" = CASE WHEN "password_require_special" THEN "password_min_special" ELSE 0 END;--> statement-breakpoint
ALTER TABLE "app_state" DROP COLUMN "password_require_uppercase";--> statement-breakpoint
ALTER TABLE "app_state" DROP COLUMN "password_require_number";--> statement-breakpoint
ALTER TABLE "app_state" DROP COLUMN "password_require_special";--> statement-breakpoint
ALTER TABLE "app_state" ADD CONSTRAINT "app_state_password_class_minimums" CHECK ("app_state"."password_min_uppercase" between 0 and 20 and "app_state"."password_min_numbers" between 0 and 20 and "app_state"."password_min_special" between 0 and 20);--> statement-breakpoint
ALTER TABLE "app_state" ADD CONSTRAINT "app_state_password_feasible" CHECK ("app_state"."password_min_uppercase" + "app_state"."password_min_numbers" + "app_state"."password_min_special" <= "app_state"."password_max_length");