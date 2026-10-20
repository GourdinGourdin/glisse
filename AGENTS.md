# AGENTS.md · Glisse

## The project · YOURS

Glisse: booking and management platform for surf and sailing schools (later: kitesurf, paddle, wing…).
Landing page in `landing/` (static HTML/CSS/JS), live on https://glisse.vercel.app.

•  *What our lead magnet does*: a 2-minute diagnostic quiz with an instant result. Two paths:
   - **Pratiquant (rider)**: gets their level and the type of course that fits them, in their region.
   - **École (school)**: gets an estimate of what its current way of handling bookings costs it
     (time lost on the phone, empty spots, lost revenue), plus a report by email.
•  *Who it is for*:
   - **Schools (priority)**: surf, sailing and kitesurf schools in France (Bretagne, Landes/Pays basque,
     Méditerranée, Normandie/Nord, Charente/Vendée) still managing bookings on paper, Excel or by phone.
   - **Riders**: beginners to intermediate people who want to book a surf/sailing course, often on holiday.
•  *What we want from a lead*:
   - School: a demo call (`DEMO_URL`) and, ultimately, signing up as a pilot school.
   - Rider: joining the waiting list (first 100 sign-ups get a free course).
•  *What our form collects*: `email` (required), `school` (school name, school path only), `audience`
   (`ecole` | `pratiquant`), plus the quiz answers and computed result, saved in `answers`:
   - rider: `sport`, `sessions`, `skill`, `goal`, `format`, `region`
   - school: `sport`, `courses`, `tool`, `calls`, `empty`, `price`, `visibility`, `season`
   - `result`: the computed result shown to the visitor
   ⚠️ The form has no consent checkbox yet: it must be added before any email is sent.
•  *A good lead for us*: a surf school in the Landes, 30–60 courses a week, managed by phone and Excel,
   3–4 empty spots per course, that left its school name.
   · *A lead we ignore*: a school that already uses booking software and is almost always full, or a
   fake / disposable email.

## How you work with us · KEEP

1. *Plan first.* For every request, propose a short plan (files, tables, variables) and wait for our OK.
2. *Small steps.* After each step, tell us exactly how to check that it works.
3. *Secrets.* Never print, log or commit a secret. When we give you one in the chat, set it yourself in `.env.local`
   and in Vercel (`vercel env add`, value piped so it is never displayed, for every environment), then redeploy.
   Generate `CRON_SECRET` yourself.
4. *Ship.* When a step works, commit with a clear message and push to `main`: Vercel deploys on every push.
5. *Tools.* Supabase MCP for tables and rows, Vercel MCP for deployments and logs, the terminal for git and `vercel`.
6. *Ask before* adding a service, a library we did not mention or a paid plan.
7. *When something breaks*, read the error and the Vercel logs first, explain the cause, then fix.

## Infrastructure · KEEP

| Piece | What we use | Notes |
|---|---|---|
| Front + back-end | Our app on Vercel | Static site in `landing/` (Vercel Root Directory = `landing`): back-end = Vercel Functions in `landing/api` (Node.js). |
| Database | Supabase, created from Vercel › Storage | The integration sets the Supabase variables in Vercel. Locally: `vercel link`, then `vercel env pull .env.local`. |
| Send emails | Our project Gmail, SMTP with Nodemailer | `smtp.gmail.com`, port 465, `secure: true`, an app password (not the account password). |
| Read replies | Same Gmail, IMAP with ImapFlow | `imap.gmail.com`, port 993, TLS, same app password. |
| Daily robot | Vercel Cron in `vercel.json` | Free plan: once a day, within the hour. |

*Back-end rules*: the browser never talks to Supabase or Gmail, every read and write goes through our server routes.
`/admin` is protected by `ADMIN_PASSWORD`, checked on the server. The robot is a server route called by Vercel Cron,
which refuses any call without `Authorization: Bearer <CRON_SECRET>`.

## Environment variables · KEEP (names only, never the values)

| Variable | Set by | Used for |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Vercel › Storage › Supabase | Server routes only: the service role key never reaches the browser. |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | We create them in Google, you set them | SMTP and IMAP. |
| `ADMIN_PASSWORD` | We choose it, you set it | Login of `/admin`. |
| `CRON_SECRET` | You generate it (long random text) | Vercel sends it to the robot route. |
| `FOLLOW_UP_DAYS` | You, 3 by default | Days without reply before the follow-up; 0 to test. |

`.env.local` stays in `.gitignore`. After changing a variable in Vercel, redeploy.

## Database · KEEP the shape, adapt the fields

```sql
create table leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text,
  email text not null,
  consent boolean not null,
  audience text not null check (audience in ('ecole', 'pratiquant')),
  school text,                  -- school name (school path only)
  answers jsonb,                -- quiz answers + computed result
  status text not null default 'new'
    check (status in ('new', 'contacted', 'followed_up', 'replied', 'meeting', 'won', 'lost')),
  notes text,
  last_email_at timestamptz,
  follow_ups int not null default 0
);

create table emails (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  direction text not null check (direction in ('out', 'in')),
  subject text,
  body text,
  message_id text unique,       -- the same email is never saved twice
  sent_at timestamptz not null default now()
);

alter table leads enable row level security;   -- no policy: only the server, with the service role key
alter table emails enable row level security;
```

## Emails · KEEP the settings, YOURS the words

•  *KEEP*: sent from `"Glisse" <GMAIL_USER>`, plain text plus a short HTML version, one line saying why the
  person receives it, only to leads with `consent = true`, at most 100 emails a day, tested on our own addresses first.
  Every email sent or received is saved in `emails`, and email 1 moves the lead to `contacted` with `last_email_at`.
•  *YOURS · Email 1*: <TO WRITE — school: the cost report + proposal of a demo call; rider: welcome to the waiting list>
•  *YOURS · The follow-up*: <TO WRITE>

We write the texts: ask us for them, do not invent them.

## The follow-up robot · KEEP

At every run:

1. Take the waiting leads: `status` is `contacted` or `followed_up`. Never touch `replied`, `meeting`, `won`, `lost`.
2. Over IMAP, look for an email *from* the lead's address received after `last_email_at`. IMAP `SINCE` works by
   day: filter on the message date after fetching.
3. Reply found: save it in `emails` (`direction = 'in'`), set `status = 'replied'`. The robot never writes to this lead again.
4. No reply, `status = 'contacted'`, `last_email_at` older than `FOLLOW_UP_DAYS` days: send *one* follow-up
   (same subject with « Re: »), save it, set `status = 'followed_up'`, `follow_ups = 1`, `last_email_at = now()`.
5. Never a second follow-up, never after a reply: running the robot twice in a row sends nothing more.
6. Return a summary: leads checked, replies found, follow-ups sent, errors.

Scheduled once a day in `vercel.json` (`"schedule": "0 7 * * *"` is 7:00 UTC, 9:00 in Paris), with a « Run robot
now » button in `/admin` for tests.

## Out of scope today · KEEP

The LLM (Thursday), mass emailing, open tracking, any paid service.
