CREATE SCHEMA "platform";
--> statement-breakpoint
CREATE TABLE "platform"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"connection_id" uuid,
	"name" text NOT NULL,
	"institution" text NOT NULL,
	"kind" text NOT NULL,
	"subtype" text,
	"mask" text,
	"balance_minor" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"credit_limit_minor" bigint,
	"balance_as_of" date,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."balance_snapshots" (
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"balance_minor" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	CONSTRAINT "balance_snapshots_account_id_as_of_pk" PRIMARY KEY("account_id","as_of")
);
--> statement-breakpoint
CREATE TABLE "platform"."budgets" (
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"monthly_cap_minor" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "budgets_user_id_category_pk" PRIMARY KEY("user_id","category")
);
--> statement-breakpoint
CREATE TABLE "platform"."category_rules" (
	"source" text NOT NULL,
	"source_category" text NOT NULL,
	"category" text NOT NULL,
	CONSTRAINT "category_rules_source_source_category_pk" PRIMARY KEY("source","source_category")
);
--> statement-breakpoint
CREATE TABLE "platform"."events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"account_id" uuid,
	"target_amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"target_date" date,
	"started_at" date,
	"baseline_amount_minor" bigint,
	"note" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."metric_snapshots" (
	"user_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metric_snapshots_user_id_as_of_pk" PRIMARY KEY("user_id","as_of")
);
--> statement-breakpoint
CREATE TABLE "platform"."provider_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_item_id" text NOT NULL,
	"institution_name" text,
	"access_token_secret_id" uuid NOT NULL,
	"cursor" text,
	"status" text DEFAULT 'ok' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_txn_id" text NOT NULL,
	"posted_at" date NOT NULL,
	"authorized_at" date,
	"description" text NOT NULL,
	"merchant" text,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"pending" boolean DEFAULT false NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"source_category" text
);
--> statement-breakpoint
ALTER TABLE "platform"."accounts" ADD CONSTRAINT "accounts_connection_id_provider_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "platform"."provider_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."balance_snapshots" ADD CONSTRAINT "balance_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "platform"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."goals" ADD CONSTRAINT "goals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "platform"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "platform"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_ix" ON "platform"."accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_source_external_ux" ON "platform"."accounts" USING btree ("user_id","source","external_id") WHERE external_id is not null;--> statement-breakpoint
CREATE INDEX "balance_snapshots_user_ix" ON "platform"."balance_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "events_user_created_ix" ON "platform"."events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "goals_user_ix" ON "platform"."goals" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_connections_user_item_ux" ON "platform"."provider_connections" USING btree ("user_id","provider","external_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_user_source_txn_ux" ON "platform"."transactions" USING btree ("user_id","source","source_txn_id");--> statement-breakpoint
CREATE INDEX "transactions_user_posted_ix" ON "platform"."transactions" USING btree ("user_id","posted_at");--> statement-breakpoint
CREATE INDEX "transactions_user_category_posted_ix" ON "platform"."transactions" USING btree ("user_id","category","posted_at");