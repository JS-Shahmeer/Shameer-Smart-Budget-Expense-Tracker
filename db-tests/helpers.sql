-- Assertion helpers shared by the *.test.sql files. Loaded by scripts/test-db.sh.

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
