-- Automation: daily Plaid sync via pg_cron + email trigger on reports INSERT.
-- Both read tokens/URL from app_config at execution time (no secrets in this file).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Daily sync at 09:00 UTC (= 5 AM ET during DST; drifts +1h in winter — fine for a nag bot).
select cron.schedule(
  'plaid-sync-daily',
  '0 9 * * *',
  $$
  select net.http_post(
    url := (select value from app_config where key = 'project_url') || '/functions/v1/plaid-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-app-token', (select value from app_config where key = 'sync_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  )
  $$
);

-- Email on report insert: the routine's INSERT is the delivery mechanism.
create or replace function notify_report()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform net.http_post(
    url := (select value from app_config where key = 'project_url') || '/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-app-token', (select value from app_config where key = 'webhook_token')
    ),
    body := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
end
$$;

create trigger reports_notify
  after insert on reports
  for each row execute function notify_report();
