CREATE TABLE "platform"."account_liabilities" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"apr_bps" integer,
	"apr_type" text,
	"min_payment_minor" bigint,
	"next_due_date" date,
	"is_overdue" boolean,
	"last_payment_minor" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform"."account_liabilities" ADD CONSTRAINT "account_liabilities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "platform"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_liabilities_user_ix" ON "platform"."account_liabilities" USING btree ("user_id");