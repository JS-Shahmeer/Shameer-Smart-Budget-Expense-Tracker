-- Recurring rules: occurrence arithmetic and atomic posting.

-- The occurrence after `current_due` for a rule anchored on `start_on`.
-- Monthly and yearly rules keep the start day where the month has it and use
-- the month's last day otherwise (a rule starting on the 31st falls on 28 or
-- 29 February, then back on the 31st in March).
create function public.next_occurrence(
  current_due date,
  start_on date,
  frequency public.recurrence_frequency,
  interval_count integer
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  months integer;
  target_month date;
  last_day integer;
begin
  if frequency = 'weekly' then
    return current_due + 7 * interval_count;
  end if;

  months := case when frequency = 'yearly' then 12 * interval_count else interval_count end;
  target_month := (date_trunc('month', current_due) + make_interval(months => months))::date;
  last_day := extract(day from (target_month + interval '1 month - 1 day'))::integer;
  return target_month + (least(extract(day from start_on)::integer, last_day) - 1);
end;
$$;

-- Records the rule's next due occurrence as a transaction (or skips it when
-- `skip` is true) and advances the rule. Runs as the caller, so RLS applies:
-- a rule the caller does not own is simply not found. The row lock and the
-- unique (recurring_rule_id, recurrence_date) index together make it safe to
-- call twice for the same occurrence: the second call posts nothing.
create function public.post_recurring_occurrence(rule_id uuid, skip boolean default false)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  rule public.recurring_rules;
  new_id uuid;
  following date;
begin
  select * into rule from public.recurring_rules r where r.id = rule_id for update;
  if not found then
    raise exception 'recurring rule not found' using errcode = 'no_data_found';
  end if;
  if not rule.is_active then
    raise exception 'recurring rule is paused or finished' using errcode = 'check_violation';
  end if;

  if not skip then
    insert into public.transactions (
      user_id, kind, amount_minor, occurred_on, account_id, to_account_id, category_id,
      savings_goal_id, payment_method, description, recurring_rule_id, recurrence_date
    ) values (
      rule.user_id, rule.kind, rule.amount_minor, rule.next_due_on, rule.account_id, rule.to_account_id,
      rule.category_id, rule.savings_goal_id, rule.payment_method, rule.name, rule.id, rule.next_due_on
    )
    on conflict (recurring_rule_id, recurrence_date) where recurring_rule_id is not null do nothing
    returning id into new_id;
  end if;

  following := public.next_occurrence(rule.next_due_on, rule.start_on, rule.frequency, rule.interval_count);
  update public.recurring_rules r
  set next_due_on = following,
      is_active = rule.end_on is null or following <= rule.end_on
  where r.id = rule.id;

  return new_id;
end;
$$;

revoke execute on function public.post_recurring_occurrence(uuid, boolean) from public, anon;
grant execute on function public.post_recurring_occurrence(uuid, boolean) to authenticated;
