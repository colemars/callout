-- Views the routines query. Keep the SQL deterministic here, not in prompts.

-- Month-to-date spend per budgeted category vs prorated cap.
create view v_budget_status as
with mtd as (
  select category, sum(amount) as spent
  from transactions
  where posted_at >= date_trunc('month', current_date)::date
    and amount > 0
    and category not in ('transfer','debt_payment','income')
  group by category
)
select
  b.category,
  b.monthly_cap,
  coalesce(m.spent, 0) as spent_mtd,
  round(b.monthly_cap * extract(day from current_date)::numeric
        / extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'))::numeric, 2)
    as prorated_cap,
  round(100 * coalesce(m.spent, 0) / nullif(b.monthly_cap, 0), 1) as pct_of_monthly_cap
from budgets b
left join mtd m using (category)
where b.active;

-- Merchants appearing >= 3 times at roughly monthly spacing with similar amounts.
create view v_recurring_candidates as
with m as (
  select merchant,
         count(*) as hits,
         avg(amount) as avg_amount,
         stddev_samp(amount) as amount_stddev,
         min(posted_at) as first_seen,
         max(posted_at) as last_seen,
         (max(posted_at) - min(posted_at))::numeric / nullif(count(*) - 1, 0) as avg_gap_days
  from transactions
  where merchant is not null and amount > 0 and not pending
  group by merchant
)
select merchant, hits, round(avg_amount, 2) as avg_amount, first_seen, last_seen,
       round(avg_gap_days, 1) as avg_gap_days
from m
where hits >= 3
  and avg_gap_days between 25 and 35
  and coalesce(amount_stddev, 0) < greatest(avg_amount * 0.15, 2);

-- 30/60/90-day balance deltas for credit + loan accounts (from snapshots).
create view v_debt_trajectory as
select
  a.id as account_id, a.name, a.institution, a.type, a.subtype,
  a.current_balance,
  a.current_balance - d30.current_balance as delta_30d,
  a.current_balance - d60.current_balance as delta_60d,
  a.current_balance - d90.current_balance as delta_90d
from accounts a
left join lateral (select current_balance from balance_snapshots
  where account_id = a.id and as_of <= current_date - 30
  order by as_of desc limit 1) d30 on true
left join lateral (select current_balance from balance_snapshots
  where account_id = a.id and as_of <= current_date - 60
  order by as_of desc limit 1) d60 on true
left join lateral (select current_balance from balance_snapshots
  where account_id = a.id and as_of <= current_date - 90
  order by as_of desc limit 1) d90 on true
where a.type in ('credit','loan') and a.is_active;

-- Data-freshness check every routine runs first.
create view v_sync_health as
select
  (select max(last_synced_at) from plaid_items) as last_plaid_sync,
  (select count(*) from plaid_items where status <> 'ok') as items_needing_attention,
  (select max(posted_at) from transactions where source = 'apple_csv') as newest_apple_txn,
  (select max(posted_at) from transactions) as newest_txn;
