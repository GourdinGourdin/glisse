-- Schéma de la base Glisse (voir AGENTS.md). À exécuter une fois sur la base Supabase.

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text,
  email text not null,
  consent boolean not null,
  audience text not null check (audience in ('ecole', 'pratiquant')),
  school text,                  -- nom de l'école (parcours école uniquement)
  answers jsonb,                -- réponses au quiz + résultat calculé (answers.result)
  status text not null default 'new'
    check (status in ('new', 'contacted', 'followed_up', 'replied', 'meeting', 'won', 'lost')),
  notes text,
  last_email_at timestamptz,
  follow_ups int not null default 0,
  unique (email, audience)      -- refaire le test met à jour le lead au lieu de créer un doublon
);

create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  direction text not null check (direction in ('out', 'in')),
  subject text,
  body text,
  message_id text unique,       -- le même email n'est jamais enregistré deux fois
  sent_at timestamptz not null default now()
);

create index if not exists leads_status_idx on leads (status);
create index if not exists emails_lead_idx on emails (lead_id, sent_at);

alter table leads enable row level security;   -- aucune policy : seul le serveur, avec la service role key
alter table emails enable row level security;
