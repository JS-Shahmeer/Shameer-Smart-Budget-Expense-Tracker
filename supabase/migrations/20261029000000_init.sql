-- Smart Budget & Expense Tracker: initial schema.
--
-- Conventions
--   * Every amount is stored as a positive bigint in minor units (paisa for PKR).
--     The direction of money comes from the transaction kind, never from the sign.
--   * Every user-owned table has user_id defaulting to auth.uid() and an RLS
--     policy that limits all access to the owner.
--   * Child rows reference parents through composite (id, user_id) foreign keys,
--     so a row can never point at another user's account, category or goal even
--     if someone guesses its id. Foreign key checks bypass RLS, so this matters.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.account_type as enum ('cash', 'bank', 'mobile_wallet', 'credit_card', 'savings');
create type public.category_kind as enum ('income', 'expense');
-- transfer: money moving between the user's own accounts. Not income, not spending.
-- A transfer with savings_goal_id set is a savings contribution.
create type public.transaction_kind as enum ('income', 'expense', 'transfer');
create type public.payment_method as enum ('cash', 'debit_card', 'credit_card', 'bank_transfer', 'mobile_wallet', 'other');
create type public.recurrence_frequency as enum ('weekly', 'monthly', 'yearly');
create type public.goal_status as enum ('active', 'completed', 'archived');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user, holds settings)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  currency char(3) not null default 'PKR' check (currency ~ '^[A-Z]{3}$'),
  -- IANA zone used to decide what "today" is for month boundaries and paydays.
  timezone text not null default 'Asia/Karachi' check (char_length(timezone) between 1 and 64),
  -- Day of the month the budget month starts on. Capped at 28 so every month has it.
  month_start_day smallint not null default 1 check (month_start_day between 1 and 28),
  -- Day of the month salary arrives. Clamped to the month's last day in app code.
  payday_day smallint not null default 1 check (payday_day between 1 and 31),
  -- Warn when a category budget reaches this percentage.
  budget_warning_percent smallint not null default 80 check (budget_warning_percent between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Accounts (where money lives)
-- ---------------------------------------------------------------------------

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  type public.account_type not null,
  -- Balance before the first recorded transaction. May be negative for credit cards.
  opening_balance_minor bigint not null default 0 check (abs(opening_balance_minor) < 1000000000000000),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index accounts_user_name_idx on public.accounts (user_id, lower(name));

create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  kind public.category_kind not null,
  -- Lucide icon name and a hex colour, both purely presentational.
  icon text not null default 'circle' check (icon ~ '^[a-z0-9-]{1,40}$'),
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index categories_user_kind_name_idx on public.categories (user_id, kind, lower(name));

create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Savings goals
-- ---------------------------------------------------------------------------

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  target_minor bigint not null check (target_minor > 0 and target_minor < 1000000000000000),
  -- Money already saved before tracking started.
  starting_minor bigint not null default 0 check (starting_minor >= 0 and starting_minor < 1000000000000000),
  target_date date,
  -- Planned monthly contribution. Treated as committed money by the daily limit.
  monthly_contribution_minor bigint check (monthly_contribution_minor > 0 and monthly_contribution_minor < 1000000000000000),
  -- Account the savings are kept in, if any.
  account_id uuid,
  status public.goal_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete set null (account_id)
);

create trigger savings_goals_updated_at before update on public.savings_goals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Recurring rules (salary, rent, subscriptions, monthly savings transfers)
-- ---------------------------------------------------------------------------

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  kind public.transaction_kind not null,
  amount_minor bigint not null check (amount_minor > 0 and amount_minor < 1000000000000000),
  account_id uuid not null,
  to_account_id uuid,
  category_id uuid,
  savings_goal_id uuid,
  payment_method public.payment_method,
  frequency public.recurrence_frequency not null default 'monthly',
  interval_count smallint not null default 1 check (interval_count between 1 and 12),
  start_on date not null,
  end_on date,
  -- The next occurrence that has not been posted yet.
  next_due_on date not null,
  -- Bills show up in reminders and are treated as committed money.
  is_bill boolean not null default false,
  remind_days_before smallint not null default 3 check (remind_days_before between 0 and 30),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (end_on is null or end_on >= start_on),
  check (next_due_on >= start_on),
  check (
    (kind = 'transfer' and to_account_id is not null and to_account_id <> account_id and category_id is null)
    or (kind <> 'transfer' and to_account_id is null and category_id is not null and savings_goal_id is null)
  ),
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (to_account_id, user_id) references public.accounts (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id),
  foreign key (savings_goal_id, user_id) references public.savings_goals (id, user_id) on delete set null (savings_goal_id)
);

create index recurring_rules_user_due_idx on public.recurring_rules (user_id, next_due_on) where is_active;

create trigger recurring_rules_updated_at before update on public.recurring_rules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.transaction_kind not null,
  amount_minor bigint not null check (amount_minor > 0 and amount_minor < 1000000000000000),
  occurred_on date not null,
  -- Source account for expenses and transfers, destination for income.
  account_id uuid not null,
  -- Destination account for transfers only.
  to_account_id uuid,
  category_id uuid,
  savings_goal_id uuid,
  payment_method public.payment_method,
  description text check (char_length(description) <= 120),
  note text check (char_length(note) <= 500),
  -- Set when this row was posted from a recurring rule. The unique index below
  -- makes posting the same occurrence twice impossible.
  recurring_rule_id uuid,
  recurrence_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind = 'transfer' and to_account_id is not null and to_account_id <> account_id and category_id is null)
    or (kind <> 'transfer' and to_account_id is null and category_id is not null and savings_goal_id is null)
  ),
  -- recurrence_date stays behind if the rule is later deleted, which is fine.
  check (recurring_rule_id is null or recurrence_date is not null),
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (to_account_id, user_id) references public.accounts (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id),
  foreign key (savings_goal_id, user_id) references public.savings_goals (id, user_id) on delete set null (savings_goal_id),
  foreign key (recurring_rule_id, user_id) references public.recurring_rules (id, user_id) on delete set null (recurring_rule_id)
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc, created_at desc);
create index transactions_user_category_idx on public.transactions (user_id, category_id) where category_id is not null;
create index transactions_goal_idx on public.transactions (savings_goal_id) where savings_goal_id is not null;
create unique index transactions_recurrence_once_idx
  on public.transactions (recurring_rule_id, recurrence_date)
  where recurring_rule_id is not null;

create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Budgets (one limit per expense category per budget month)
-- ---------------------------------------------------------------------------

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null,
  -- First day of the calendar month the budget month starts in. The actual period
  -- runs from profiles.month_start_day in that month to the day before it in the next.
  month date not null check (extract(day from month) = 1),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor < 1000000000000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, month),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

create trigger budgets_updated_at before update on public.budgets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Category kind must match how it is used
-- ---------------------------------------------------------------------------

create function public.check_category_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expected public.category_kind;
  actual public.category_kind;
begin
  if new.category_id is null then
    return new;
  end if;

  if tg_table_name = 'budgets' then
    expected := 'expense';
  elsif new.kind = 'transfer' then
    return new;
  else
    expected := new.kind::text::public.category_kind;
  end if;

  select c.kind into actual from public.categories c where c.id = new.category_id;
  if actual is distinct from expected then
    raise exception 'category % is not an % category', new.category_id, expected
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger transactions_category_kind before insert or update of kind, category_id on public.transactions
  for each row execute function public.check_category_kind();
create trigger recurring_rules_category_kind before insert or update of kind, category_id on public.recurring_rules
  for each row execute function public.check_category_kind();
create trigger budgets_category_kind before insert or update of category_id on public.budgets
  for each row execute function public.check_category_kind();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.savings_goals enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;

-- Profiles are created by the signup trigger and deleted with the auth user.
create policy "profiles: owner can read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: owner can update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "accounts: owner only" on public.accounts
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "categories: owner only" on public.categories
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "savings_goals: owner only" on public.savings_goals
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "recurring_rules: owner only" on public.recurring_rules
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "transactions: owner only" on public.transactions
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "budgets: owner only" on public.budgets
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Account balances. security_invoker makes the view obey the caller's RLS.
-- ---------------------------------------------------------------------------

create view public.account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.user_id,
  a.name,
  a.type,
  a.is_archived,
  a.opening_balance_minor
    + coalesce(sum(case
        when t.kind = 'income' and t.account_id = a.id then t.amount_minor
        when t.kind = 'expense' and t.account_id = a.id then -t.amount_minor
        when t.kind = 'transfer' and t.account_id = a.id then -t.amount_minor
        when t.kind = 'transfer' and t.to_account_id = a.id then t.amount_minor
        else 0
      end), 0)::bigint as balance_minor
from public.accounts a
left join public.transactions t
  on t.user_id = a.user_id and (t.account_id = a.id or t.to_account_id = a.id)
group by a.id;

-- Signed-out visitors get nothing, even before RLS is consulted.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- New user setup: profile, starter accounts and categories
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''));

  insert into public.accounts (user_id, name, type) values
    (new.id, 'Cash', 'cash'),
    (new.id, 'Bank account', 'bank'),
    (new.id, 'Savings', 'savings');

  insert into public.categories (user_id, name, kind, icon, color) values
    (new.id, 'Salary', 'income', 'briefcase', '#22c55e'),
    (new.id, 'Freelance', 'income', 'laptop', '#14b8a6'),
    (new.id, 'Other income', 'income', 'plus-circle', '#84cc16'),
    (new.id, 'Food', 'expense', 'utensils', '#f97316'),
    (new.id, 'Transport', 'expense', 'car', '#3b82f6'),
    (new.id, 'Rent', 'expense', 'home', '#a855f7'),
    (new.id, 'Utilities', 'expense', 'zap', '#eab308'),
    (new.id, 'Subscriptions', 'expense', 'repeat', '#ec4899'),
    (new.id, 'Shopping', 'expense', 'shopping-bag', '#06b6d4'),
    (new.id, 'Health', 'expense', 'heart-pulse', '#ef4444'),
    (new.id, 'Miscellaneous', 'expense', 'circle', '#64748b');

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
