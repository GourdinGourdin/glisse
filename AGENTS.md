# AGENTS.md · Glisse

## The project · YOURS

Glisse: booking and management platform for surf and sailing schools (later: kitesurf, paddle, wing…).
Landing page in `landing/` (static HTML/CSS/JS), live on https://glisse.vercel.app.

•  *What our lead magnet does*: a 2-minute diagnostic with open questions and a personal analysis written live by an LLM. Two paths:
   - **Pratiquant (rider)**: 5 questions; gets their profile, the course that fits them and 3 tips.
   - **École (school)**: 6 questions; gets what its answers reveal, a 3-step action plan and what Glisse changes.
   A chatbot (`chat.js`, `api/chat.js`) answers questions on every public page.
•  *Who it is for*:
   - **Schools (priority)**: surf, sailing and kitesurf schools in France (Bretagne, Landes/Pays basque,
     Méditerranée, Normandie/Nord, Charente/Vendée) still managing bookings on paper, Excel or by phone.
   - **Riders**: beginners to intermediate people who want to book a surf/sailing course, often on holiday.
•  *What we want from a lead*:
   - School: a demo call (`DEMO_URL`) and, ultimately, signing up as a pilot school.
   - Rider: joining the waiting list (first 100 sign-ups get a free course).
•  *What our form collects*: `email` (required), `school` (school path only), `audience` (`ecole` | `pratiquant`),
   the free-text answers in `answers` (ids in `landing/questions.js`), and the required `consent` checkbox.
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
| `GEMINI_API_KEY` | We create it, you set it | LLM calls, server routes only. |
| `AUTO_FOLLOW_UP` | Optional, unset by default | `1` sends the follow-up without the human click. |

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

The full, current schema is `landing/db/schema.sql` (idempotent: safe to run again). On top of the two tables above it adds:
`leads.next_action_at` / `leads.next_action`, a `prospects` table (schools we canvass) and an `activities` table
(manual log of calls, emails, messages, meetings, notes on a lead or a prospect). All tables have RLS on, no policy.

## CRM and prospecting · YOURS

`/admin` (protected by `ADMIN_PASSWORD`) has four tabs:

•  *À faire*: overdue, today and next-7-days actions (leads + prospects), plus suggestions (hot new leads, best schools to call).
•  *Leads*: quiz leads, priority score /100, list + drag-and-drop pipeline, funnel, lead sheet with answers, next action,
   activity log and ready-to-send email 1 / follow-up (manual, via the user's mail app).
•  *Prospection*: schools to canvass, from OpenStreetMap (ODbL: keep the attribution visible), CSV import or manual add.
   Fit score /100, statuses `to_contact → contacted → interested → pilot | not_interested`, "find email" on the school's
   website, first email / follow-up / call script templates (vouvoiement, identity + STOP line for CNIL B2B rules).

•  *Machine*: anonymous funnel (`events`), cost per lead and cost line by line, errors and capped runs (`runs`), robot status and « Run robot now ».

Rules:
•  Prospecting emails are written and sent *by hand*, one school at a time. No bulk sending (out of scope).
•  Logging an activity on a *lead* never changes its status: the follow-up robot relies on `status` and `last_email_at`.
•  A prospect is linked to a lead automatically when a school does the quiz with the same email or website domain
   (personal mailboxes like gmail.com are ignored); it then moves to `interested`.
•  OSM import runs one département per request (`api/_osm.js`, Overpass API, can be slow or down: retry later).
   Re-importing never overwrites existing prospects.
•  Server routes: `api/{lead,chat,track,robot}.js`, `api/admin/{login,leads,prospects,activities,emails,stats}.js` (10 of the 12 functions Vercel Hobby allows).

## Emails · KEEP the settings, YOURS the words

•  *KEEP*: sent from `"Glisse" <GMAIL_USER>`, plain text plus a short HTML version, one line saying why the
  person receives it, only to leads with `consent = true`, at most 100 emails a day, tested on our own addresses first.
  Every email sent or received is saved in `emails`, and email 1 moves the lead to `contacted` with `last_email_at`.
•  *YOURS · Tone*: French, « tu », warm and direct, signed « Victor, fondateur de Glisse ». The site says the text is written by an AI.
•  *YOURS · Email 1*: the analysis the visitor just read on the page (`api/_gemini.js`, `toEmail`), with a subject from the LLM.
   It leaves at once only on a lead's first test and only if every check passes; otherwise it waits in *À faire › Emails à valider*.
•  *YOURS · The follow-up*: written by the LLM from the answers (fixed text in `api/_gemini.js` if it fails), subject « Re: » + email 1 subject.
•  *Why you receive it* (footer, every email): « Tu reçois cet email parce que tu as fait le test sur
   glisse.vercel.app. Réponds STOP pour ne plus rien recevoir. » A reply « STOP » sets `status = 'lost'`.

## The follow-up robot · KEEP

At every run:

1. Take the waiting leads: `status` is `contacted` or `followed_up`. Never touch `replied`, `meeting`, `won`, `lost`.
2. Over IMAP, look for an email *from* the lead's address received after `last_email_at`. IMAP `SINCE` works by
   day: filter on the message date after fetching.
3. Reply found: save it in `emails` (`direction = 'in'`), set `status = 'replied'`. The robot never writes to this lead again.
4. No reply, `status = 'contacted'`, `last_email_at` older than `FOLLOW_UP_DAYS` days: prepare *one* follow-up as a draft
   (same subject with « Re: »). A person clicks « Valider et envoyer » in the CRM (or `AUTO_FOLLOW_UP=1` sends it): it is saved,
   then `status = 'followed_up'`, `follow_ups = 1`, `last_email_at = now()`.
5. Never a second follow-up, never after a reply: running the robot twice in a row sends nothing more.
6. Return a summary: leads checked, replies found, follow-ups sent, errors.

Scheduled once a day in `vercel.json` (`"schedule": "0 7 * * *"` is 7:00 UTC, 9:00 in Paris), with a « Run robot
now » button in `/admin` for tests.

## The LLM · YOURS

Fixed path set by the code: checks → model → checks → save → send or wait for the human click (`api/lead.js`, `api/_guards.js`).

•  Instructions live in `systemInstruction`; visitor text stays data, inside `<reponses>` tags.
•  Before the model: injection patterns skip the LLM and use the fallback text; too-short answers and disposable emails raise flags.
•  After the model: a link, a leaked instruction, a figure absent from the answers or a cut-off text raises a flag. The code caps the LLM's priority.
•  Any flag holds email 1 for a human. The text on the page streams live, so output checks protect the email, not the screen.
•  Budget: per-IP hourly limits and 1000 LLM calls a day, then the fallback. Each call is logged in `runs` with tokens, cost and duration.
•  The chat is not stored. `npm test` in `landing/` runs the test cases (no real email leaves).

## Out of scope today · KEEP

Mass emailing, open tracking, any paid service.
