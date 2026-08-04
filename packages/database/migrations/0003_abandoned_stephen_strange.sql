CREATE TABLE "platform"."user_category_rules" (
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"match_key" text NOT NULL,
	"category" text NOT NULL,
	"origin" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_category_rules_user_id_source_match_key_pk" PRIMARY KEY("user_id","source","match_key")
);
--> statement-breakpoint
ALTER TABLE "platform"."transactions" ADD COLUMN "category_source" text DEFAULT 'rule' NOT NULL;