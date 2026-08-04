CREATE TABLE "platform"."product_state" (
	"user_id" uuid NOT NULL,
	"product" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_state_user_id_product_pk" PRIMARY KEY("user_id","product")
);
