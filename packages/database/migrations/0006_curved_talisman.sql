ALTER TABLE "platform"."events" ADD COLUMN "seq" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "platform"."events" ADD COLUMN "dedup_key" text;--> statement-breakpoint
CREATE INDEX "events_user_seq_ix" ON "platform"."events" USING btree ("user_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "events_user_natural_ux" ON "platform"."events" USING btree ("user_id","type","occurred_on","dedup_key");