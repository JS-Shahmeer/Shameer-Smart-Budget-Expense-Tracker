-- Row Level Security and data integrity checks. Run with scripts/test-db.sh.
-- Each failed expectation raises, which stops the run with ON_ERROR_STOP.

create function public.test_assert(ok boolean, message text) returns void
language plpgsql as $$
begin
  if ok is not true then
    raise exception 'assertion failed: %', message;
  end if;
end;
$$;

-- Runs a statement and asserts that it fails.
create function public.test_expect_error(statement text, message text) returns void
language plpgsql as $$
begin
  execute statement;
  raise exception 'expected an error: %', message;
exception
  -- Only integrity and permission errors count. A typo in a test statement
  -- (syntax error, unknown column) must not pass as an expected failure.
  when check_violation or foreign_key_violation or unique_violation
    or not_null_violation or insufficient_privilege then null;
end;
$$;

-- Two users. The signup trigger gives each a profile, accounts and categories.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', '{"display_name":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{}');

select public.test_assert((select count(*) = 2 from public.profiles), 'a profile per user');
select public.test_assert((select display_name = 'Alice' from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'display name copied');
select public.test_assert((select currency = 'PKR' from public.profiles limit 1), 'PKR is the default currency');
select public.test_assert((select count(*) = 6 from public.accounts), 'three starter accounts each');
select public.test_assert((select count(*) = 22 from public.categories), 'eleven starter categories each');

-- ---------------------------------------------------------------------------
-- As user A
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

select public.test_assert((select count(*) = 1 from public.profiles), 'A sees only their profile');
select public.test_assert((select count(*) = 3 from public.accounts), 'A sees only their accounts');
select public.test_assert((select count(*) = 11 from public.categories), 'A sees only their categories');

insert into public.transactions (kind, amount_minor, occurred_on, account_id, category_id, payment_method, description)
select 'expense', 150000, date '2026-10-05', a.id, c.id, 'cash', 'Groceries'
from public.accounts a, public.categories c
where a.name = 'Cash' and c.name = 'Food';

select public.test_assert((select user_id = '00000000-0000-0000-0000-00000000000a' from public.transactions), 'user_id defaults to the caller');

-- Invalid rows are rejected by constraints.
select public.test_expect_error($$
  insert into public.transactions (kind, amount_minor, occurred_on, account_id, category_id)
  select 'expense', 0, current_date, a.id, c.id from public.accounts a, public.categories c where a.name = 'Cash' and c.name = 'Food'
$$, 'zero amount');
select public.test_expect_error($$
  insert into public.transactions (kind, amount_minor, occurred_on, account_id, category_id)
  select 'expense', -500, current_date, a.id, c.id from public.accounts a, public.categories c where a.name = 'Cash' and c.name = 'Food'
$$, 'negative amount');
select public.test_expect_error($$
  insert into public.transactions (kind, amount_minor, occurred_on, account_id, category_id)
  select 'expense', 500, current_date, a.id, c.id from public.accounts a, public.categories c where a.name = 'Cash' and c.name = 'Salary'
$$, 'expense with an income category');
select public.test_expect_error($$
  insert into public.transactions (kind, amount_minor, occurred_on, account_id, to_account_id)
  select 'transfer', 500, current_date, a.id, a.id from public.accounts a where a.name = 'Cash'
$$, 'transfer to the same account');
select public.test_expect_error($$
  insert into public.transactions (kind, amount_minor, occurred_on, account_id)
  select 'expense', 500, current_date, a.id from public.accounts a where a.name = 'Cash'
$$, 'expense without a category');

-- A transfer to savings is valid and needs no category.
insert into public.transactions (kind, amount_minor, occurred_on, account_id, to_account_id)
select 'transfer', 1000000, date '2026-10-06', s.id, d.id
from public.accounts s, public.accounts d
where s.name = 'Bank account' and d.name = 'Savings';

-- A recurring occurrence can only be posted once.
insert into public.recurring_rules (name, kind, amount_minor, account_id, category_id, start_on, next_due_on, is_bill)
select 'Rent', 'expense', 4500000, a.id, c.id, date '2026-10-01', date '2026-10-01', true
from public.accounts a, public.categories c where a.name = 'Bank account' and c.name = 'Rent';

insert into public.transactions (kind, amount_minor, occurred_on, account_id, category_id, recurring_rule_id, recurrence_date)
select 'expense', r.amount_minor, r.next_due_on, r.account_id, r.category_id, r.id, r.next_due_on from public.recurring_rules r;

select public.test_expect_error($$
  insert into public.transactions (kind, amount_minor, occurred_on, account_id, category_id, recurring_rule_id, recurrence_date)
  select 'expense', r.amount_minor, r.next_due_on, r.account_id, r.category_id, r.id, r.next_due_on from public.recurring_rules r
$$, 'same recurring occurrence twice');

select public.test_expect_error($$
  insert into public.budgets (category_id, month, amount_minor)
  select c.id, date '2026-10-15', 100 from public.categories c where c.name = 'Food'
$$, 'budget month must be the first of a month');
select public.test_expect_error($$
  insert into public.budgets (category_id, month, amount_minor)
  select c.id, date '2026-10-01', 100 from public.categories c where c.name = 'Salary'
$$, 'budget on an income category');
insert into public.budgets (category_id, month, amount_minor)
select c.id, date '2026-10-01', 3000000 from public.categories c where c.name = 'Food';

-- Balances: transfers move money between accounts without creating or destroying it.
select public.test_assert((select balance_minor = -150000 from public.account_balances where name = 'Cash'), 'cash balance after an expense');
select public.test_assert((select balance_minor = -5500000 from public.account_balances where name = 'Bank account'), 'bank balance after rent and a savings transfer');
select public.test_assert((select balance_minor = 1000000 from public.account_balances where name = 'Savings'), 'savings balance after a transfer in');
select public.test_assert((select count(*) = 3 from public.account_balances), 'A sees only their balances');

-- A cannot hand their rows to B.
select public.test_expect_error($$
  update public.accounts set user_id = '00000000-0000-0000-0000-00000000000b' where name = 'Cash'
$$, 'moving a row to another user');
commit;

-- ---------------------------------------------------------------------------
-- As user B
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);

select public.test_assert((select count(*) = 0 from public.transactions), 'B cannot read A''s transactions');
select public.test_assert((select count(*) = 0 from public.budgets), 'B cannot read A''s budgets');
select public.test_assert((select count(*) = 0 from public.recurring_rules), 'B cannot read A''s recurring rules');
select public.test_assert((select sum(balance_minor) = 0 from public.account_balances), 'B sees only their own zero balances');

update public.transactions set amount_minor = 1;
delete from public.transactions;
commit;

select public.test_assert((select count(*) = 3 from public.transactions), 'B could not change or delete A''s rows');
select public.test_assert((select min(amount_minor) > 1 from public.transactions), 'B could not change A''s amounts');

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);

select public.test_expect_error($$
  insert into public.accounts (user_id, name, type) values ('00000000-0000-0000-0000-00000000000a', 'Sneaky', 'cash')
$$, 'inserting a row for another user');
commit;

-- Known ids from A, used directly so RLS cannot hide them from the lookup.
do $$
declare
  a_account uuid := (select id from public.accounts where user_id = '00000000-0000-0000-0000-00000000000a' and name = 'Cash');
  b_category uuid := (select id from public.categories where user_id = '00000000-0000-0000-0000-00000000000b' and name = 'Food');
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
  set local role authenticated;
  begin
    insert into public.transactions (kind, amount_minor, occurred_on, account_id, category_id)
    values ('expense', 100, current_date, a_account, b_category);
    raise exception 'B attached a transaction to A''s account';
  exception
    when foreign_key_violation then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Signed-out visitors
-- ---------------------------------------------------------------------------
begin;
set local role anon;
select public.test_expect_error('select * from public.transactions', 'anon reading transactions');
select public.test_expect_error('select * from public.profiles', 'anon reading profiles');
commit;

-- Deleting the auth user removes everything they own.
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select public.test_assert((select count(*) = 0 from public.transactions), 'user data deleted with the account');
select public.test_assert((select count(*) = 3 from public.accounts), 'other user untouched');

drop function public.test_assert(boolean, text);
drop function public.test_expect_error(text, text);
