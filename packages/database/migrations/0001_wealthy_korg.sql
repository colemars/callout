CREATE TABLE "platform"."investment_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_activity_id" text NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"kind" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"security_ticker" text,
	"quantity" text
);
--> statement-breakpoint
ALTER TABLE "platform"."investment_activity" ADD CONSTRAINT "investment_activity_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "platform"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "investment_activity_user_source_ux" ON "platform"."investment_activity" USING btree ("user_id","source","source_activity_id");--> statement-breakpoint
CREATE INDEX "investment_activity_user_date_ix" ON "platform"."investment_activity" USING btree ("user_id","date");