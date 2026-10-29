-- Imported transactions (bank statements, and later SMS alerts) carry a key
-- derived from the source row, so importing the same statement twice, or two
-- statements that overlap, saves each row once.

alter table public.transactions
  add column import_ref text check (char_length(import_ref) between 1 and 200);

-- NULLs never collide, so hand-entered transactions are unaffected.
alter table public.transactions
  add constraint transactions_import_ref_key unique (user_id, import_ref);
