-- Unified categories:
--   groceries, dining, delivery, coffee, transport, shopping, subscriptions,
--   entertainment, travel, health, housing, debt_payment, income, transfer, other
-- Lookup order in ingest code: (source, detailed) then (source, primary), else 'other'.
-- Delivery apps are promoted to 'delivery' by merchant name in code, regardless of source category.

insert into category_map (source, source_category, category) values
  -- Plaid personal_finance_category.primary
  ('plaid', 'INCOME',                    'income'),
  ('plaid', 'TRANSFER_IN',               'transfer'),
  ('plaid', 'TRANSFER_OUT',              'transfer'),
  ('plaid', 'LOAN_PAYMENTS',             'debt_payment'),
  ('plaid', 'BANK_FEES',                 'other'),
  ('plaid', 'ENTERTAINMENT',             'entertainment'),
  ('plaid', 'FOOD_AND_DRINK',            'dining'),
  ('plaid', 'GENERAL_MERCHANDISE',       'shopping'),
  ('plaid', 'HOME_IMPROVEMENT',          'housing'),
  ('plaid', 'MEDICAL',                   'health'),
  ('plaid', 'PERSONAL_CARE',             'health'),
  ('plaid', 'GENERAL_SERVICES',          'other'),
  ('plaid', 'GOVERNMENT_AND_NON_PROFIT', 'other'),
  ('plaid', 'TRANSPORTATION',            'transport'),
  ('plaid', 'TRAVEL',                    'travel'),
  ('plaid', 'RENT_AND_UTILITIES',        'housing'),
  -- Plaid personal_finance_category.detailed overrides
  ('plaid', 'FOOD_AND_DRINK_GROCERIES',                   'groceries'),
  ('plaid', 'FOOD_AND_DRINK_COFFEE',                      'coffee'),
  ('plaid', 'FOOD_AND_DRINK_RESTAURANT',                  'dining'),
  ('plaid', 'FOOD_AND_DRINK_FAST_FOOD',                   'dining'),
  ('plaid', 'ENTERTAINMENT_TV_AND_MOVIES',                'subscriptions'),
  ('plaid', 'ENTERTAINMENT_MUSIC_AND_AUDIO',              'subscriptions'),
  ('plaid', 'GENERAL_SERVICES_SUBSCRIPTION',              'subscriptions'),
  ('plaid', 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES',    'shopping'),
  ('plaid', 'TRANSPORTATION_GAS',                         'transport'),
  ('plaid', 'TRANSPORTATION_TAXIS_AND_RIDE_SHARES',       'transport'),
  -- Apple Card CSV categories
  ('apple_csv', 'Restaurants',     'dining'),
  ('apple_csv', 'Grocery',         'groceries'),
  ('apple_csv', 'Shopping',        'shopping'),
  ('apple_csv', 'Entertainment',   'entertainment'),
  ('apple_csv', 'Travel',          'travel'),
  ('apple_csv', 'Transportation',  'transport'),
  ('apple_csv', 'Gas',             'transport'),
  ('apple_csv', 'Health',          'health'),
  ('apple_csv', 'Hotels',          'travel'),
  ('apple_csv', 'Airlines',        'travel'),
  ('apple_csv', 'Services',        'other'),
  ('apple_csv', 'Payment',         'debt_payment'),
  ('apple_csv', 'Other',           'other');
