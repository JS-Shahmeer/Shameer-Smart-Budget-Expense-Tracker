# Smart Budget & Expense Tracker

A personal finance app for tracking income and expenses, keeping category budgets, planning savings and knowing how much you can safely spend each day. Amounts default to PKR.

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS 4 and Supabase (auth, Postgres and Row Level Security).

## Status

| Step | Scope | State |
| --- | --- | --- |
| 1 | Foundation: layout, components, auth, database schema with RLS, live dashboard | Done |
| 2 | Transactions, transfers, accounts and categories, budgets, recurring bills | Done |
| 3 | Savings goals, daily spending limit, affordability calculator | Done |
| 4 | Charts, monthly reports and CSV export, settings, final hardening | Done |

## Getting started

1. Install dependencies: `npm install`
2. Create a Supabase project at [supabase.com](https://supabase.com).
3. Apply the schema. Either run `npx supabase link --project-ref <ref>` then `npx supabase db push`, or paste `supabase/migrations/*.sql` into the Supabase SQL editor in order.
4. Copy `.env.example` to `.env.local` and fill in the project URL and publishable (anon) key from Project Settings → API.
5. In Supabase, go to Authentication → URL Configuration. Set the Site URL to your app's URL and add `<your-url>/auth/callback` to the redirect URLs.
6. `npm run dev` and open http://localhost:3000.

### Local Supabase (optional)

With Docker running, `npx supabase start` starts a local stack and applies the migrations. Put the printed API URL and publishable key in `.env.local`. Email confirmation is off locally.

## Deploying to Vercel

Import the repository in Vercel, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as environment variables, and deploy. Then add the Vercel URL to the Supabase redirect URLs as in step 5. The service-role key is never needed and must not be added.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript checks |
| `npm test` | Unit tests for money, dates, validation and the finance calculations (Vitest) |
| `npm run test:db` | Applies the migrations to a throwaway Postgres and runs the RLS and integrity tests in `db-tests/`. Needs Postgres server binaries installed. |

## How the money is modelled

- **Amounts** are integers in minor units (paisa) and always positive. The kind of transaction gives the direction.
- **Transaction kinds:** `income`, `expense` and `transfer`. A transfer moves money between your own accounts and never counts as income or spending.
- **Savings:** a transfer into a savings account (or one tagged with a savings goal) counts as saving, not spending. Withdrawing from savings reduces what you saved that month.
- **Available balance** is the total in everyday accounts (cash, bank, mobile wallets and credit cards), excluding savings.
- **Budget months** can start on any day from 1 to 28. "Today" is worked out in your timezone (Asia/Karachi by default), so month boundaries do not shift with the server's clock.
- **Recurring transactions** record which rule and occurrence date they came from. You mark each occurrence as paid (or skip it) when it happens; `post_recurring_occurrence` records it and advances the rule in one database transaction, and a unique index makes posting the same occurrence twice impossible. Monthly items keep their day, falling back to the month's last day in shorter months.
- **Savings goals** track money moved in and out with transfers tagged to the goal, plus anything saved before tracking started. Each goal shows the monthly amount needed to reach its target date and what is still to put aside this month.
- **Daily spending limit** = (money in everyday accounts at the start of today − unpaid bills due before payday − savings still to put aside) ÷ days until payday, rounded down to whole rupees. It is worked out from the start of the day, so spending today lowers "left today" rather than the limit itself.
- **Affordability** shows how a purchase today would change the daily limit, whether it eats into bill or savings money, how far it would push savings goals back, and the effect on the category budget. Nothing is saved.
- **Budgets** are per category per budget month. Spending in a category without a budget is shown separately, and last month's limits can be copied forward.
- **Analytics** cover the last 3, 6 or 12 budget months. Averages only count months that have something recorded, and the savings rate is money saved divided by income.
- **Reports** compare a budget month with the one before it. The CSV export (one month, or everything) has one row per transaction with names instead of ids. Text that a spreadsheet would run as a formula is prefixed with an apostrophe.
- **Changing currency** only changes how amounts are labelled. Nothing is converted.

## Security

- Every table has Row Level Security. Each user can only read and change their own rows.
- Child rows reference accounts, categories and goals through composite `(id, user_id)` foreign keys, so a row cannot point at another user's data even if its id is known.
- Signed-out visitors have no table privileges at all.
- Input is validated with Zod in the browser and again in server actions, and by database constraints.
- Ids sent to server actions are checked before any query runs.
- Responses carry security headers: no framing, no MIME sniffing, a strict referrer policy and HSTS.
- Only the public URL and publishable key are used in the app.

## Project structure

```
src/
  app/
    (auth)/          sign in, sign up and their server actions
    (app)/           signed-in pages; each section keeps its server actions in actions.ts
    auth/            email confirmation callbacks
  components/
    layout/          sidebar, mobile navigation, user menu
    ui/              buttons, cards, inputs, alerts, dialogs, progress, skeletons
  lib/
    data/            server-only data loaders (always scoped to the signed-in user)
    finance/         pure calculations, unit tested
    supabase/        browser, server and proxy clients plus database types
    validation/      Zod schemas shared by forms and server actions
  proxy.ts           refreshes the session and redirects signed-out visitors
supabase/migrations  database schema, RLS policies and the new-user trigger
db-tests/            SQL tests for RLS, data integrity and recurring posting
```
