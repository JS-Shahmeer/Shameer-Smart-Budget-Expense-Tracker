-- Recurring rule arithmetic and posting. Run with scripts/test-db.sh.

-- next_occurrence keeps the start day, clamping to short months.
select public.test_assert(public.next_occurrence('2026-01-31', '2026-01-31', 'monthly', 1) = '2026-02-28', 'Jan 31 -> Feb 28');
select public.test_assert(public.next_occurrence('2026-02-28', '2026-01-31', 'monthly', 1) = '2026-03-31', 'Feb 28 -> Mar 31 (back to the anchor)');
select public.test_assert(public.next_occurrence('2028-01-31', '2026-01-31', 'monthly', 1) = '2028-02-29', 'leap year February');
select public.test_assert(public.next_occurrence('2026-12-15', '2026-01-15', 'monthly', 1) = '2027-01-15', 'December -> January');
select public.test_assert(public.next_occurrence('2026-10-01', '2026-10-01', 'monthly', 3) = '2027-01-01', 'quarterly');
select public.test_assert(public.next_occurrence('2026-10-29', '2026-10-29', 'weekly', 2) = '2026-11-12', 'fortnightly');
select public.test_assert(public.next_occurrence('2028-02-29', '2028-02-29', 'yearly', 1) = '2029-02-28', 'yearly from Feb 29');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'c@example.com'),
  ('00000000-0000-0000-0000-0000000000d1', 'd@example.com');

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);

insert into public.recurring_rules (name, kind, amount_minor, account_id, category_id, start_on, next_due_on, end_on, is_bill)
select 'Internet', 'expense', 350000, a.id, c.id, date '2026-08-31', date '2026-08-31', date '2026-10-31', true
from public.accounts a, public.categories c where a.name = 'Bank account' and c.name = 'Utilities';

-- Post August, skip September, post October.
select public.post_recurring_occurrence((select id from public.recurring_rules));
select public.test_assert((select next_due_on = '2026-09-30' from public.recurring_rules), 'advanced to Sep 30');
select public.post_recurring_occurrence((select id from public.recurring_rules), true);
select public.test_assert((select next_due_on = '2026-10-31' from public.recurring_rules), 'skipped to Oct 31');
select public.test_assert((select count(*) = 1 from public.transactions), 'skipping posts nothing');
select public.post_recurring_occurrence((select id from public.recurring_rules));

select public.test_assert((select count(*) = 2 from public.transactions), 'two occurrences posted');
select public.test_assert(
  (select array_agg(occurred_on order by occurred_on) = array[date '2026-08-31', date '2026-10-31'] from public.transactions),
  'posted on their due dates');
select public.test_assert((select not is_active and next_due_on = '2026-11-30' from public.recurring_rules), 'finished after end_on');
select public.test_expect_error('select public.post_recurring_occurrence((select id from public.recurring_rules))', 'posting a finished rule');

-- Re-posting an occurrence that already exists (for example after the rule was
-- edited back to an earlier date) adds nothing.
update public.recurring_rules set next_due_on = '2026-10-31', is_active = true, end_on = null;
select public.test_assert(public.post_recurring_occurrence((select id from public.recurring_rules)) is null, 'duplicate occurrence returns no id');
select public.test_assert((select count(*) = 2 from public.transactions), 'no double count');
commit;

-- Another user cannot post someone else's rule.
do $$
declare
  rule uuid := (select id from public.recurring_rules where user_id = '00000000-0000-0000-0000-0000000000c1');
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
  set local role authenticated;
  begin
    perform public.post_recurring_occurrence(rule);
    raise exception 'D posted C''s rule';
  exception
    when no_data_found then null;
  end;
end;
$$;

-- Signed-out visitors cannot call it at all.
begin;
set local role anon;
select public.test_expect_error($$select public.post_recurring_occurrence('00000000-0000-0000-0000-000000000000')$$, 'anon calling the function');
commit;

select public.test_assert((select count(*) = 2 from public.transactions), 'C''s data untouched');
delete from auth.users where email in ('c@example.com', 'd@example.com');
