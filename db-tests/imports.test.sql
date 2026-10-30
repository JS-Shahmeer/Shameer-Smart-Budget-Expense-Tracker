-- Import keys: each source row is saved once per user. Run with scripts/test-db.sh.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'e@example.com'),
  ('00000000-0000-0000-0000-0000000000f1', 'f@example.com');

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);

insert into public.transactions (kind, amount_minor, occurred_on, account_id, category_id, import_ref)
select 'expense', 235050, date '2026-10-05', a.id, c.id, 'stmt:abc'
from public.accounts a, public.categories c where a.name = 'Bank account' and c.name = 'Food';

-- Importing the same row again does nothing.
insert into public.transactions (kind, amount_minor, occurred_on, account_id, category_id, import_ref)
select 'expense', 235050, date '2026-10-05', a.id, c.id, 'stmt:abc'
from public.accounts a, public.categories c where a.name = 'Bank account' and c.name = 'Food'
on conflict (user_id, import_ref) do nothing;
select public.test_assert((select count(*) = 1 from public.transactions), 'duplicate import ignored');

select public.test_expect_error($$
  insert into public.transactions (kind, amount_minor, occurred_on, account_id, category_id, import_ref)
  select 'expense', 1, date '2026-10-05', a.id, c.id, 'stmt:abc'
  from public.accounts a, public.categories c where a.name = 'Bank account' and c.name = 'Food'
$$, 'plain insert of a duplicate import key');

-- Hand-entered rows have no key and never collide.
insert into public.transactions (kind, amount_minor, occurred_on, account_id, category_id)
select 'expense'::public.transaction_kind, 235050, date '2026-10-05', a.id, c.id
from public.accounts a, public.categories c where a.name = 'Bank account' and c.name = 'Food'
union all
select 'expense'::public.transaction_kind, 235050, date '2026-10-05', a.id, c.id
from public.accounts a, public.categories c where a.name = 'Bank account' and c.name = 'Food';
select public.test_assert((select count(*) = 3 from public.transactions), 'manual rows unaffected');
commit;

-- Another user can use the same key for their own row, and cannot see the first user's.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
select public.test_assert((select count(*) = 0 from public.transactions where import_ref = 'stmt:abc'), 'other user sees no keys');
insert into public.transactions (kind, amount_minor, occurred_on, account_id, category_id, import_ref)
select 'expense', 100, date '2026-10-05', a.id, c.id, 'stmt:abc'
from public.accounts a, public.categories c where a.name = 'Bank account' and c.name = 'Food';
select public.test_assert((select count(*) = 1 from public.transactions), 'same key allowed for another user');
commit;

delete from auth.users where email in ('e@example.com', 'f@example.com');
