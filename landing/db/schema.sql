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

-- Prochaine action à faire sur un lead (vue « À faire »)
alter table leads add column if not exists next_action_at date;
alter table leads add column if not exists next_action text;

-- Écoles démarchées (outil de prospection), importées d'OpenStreetMap, d'un CSV ou ajoutées à la main
create table if not exists prospects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  sport text,                   -- surf, voile, kite, paddle, autre
  city text,
  postcode text,
  departement text,
  region text,                  -- mêmes clés que le quiz : bretagne, landes, med, nord, charente, other
  lat double precision,
  lon double precision,
  website text,
  email text,
  phone text,
  source text not null default 'manual' check (source in ('osm', 'csv', 'manual')),
  source_id text unique,        -- identifiant OpenStreetMap : réimporter ne crée pas de doublon
  fit int not null default 0,   -- score d'adéquation sur 100
  status text not null default 'to_contact'
    check (status in ('to_contact', 'contacted', 'interested', 'pilot', 'not_interested')),
  notes text,
  last_contact_at timestamptz,
  next_action_at date,
  next_action text,
  lead_id uuid references leads(id) on delete set null   -- relié quand l'école fait le quiz
);

-- Historique des actions (appels, emails envoyés à la main, notes) sur un lead ou un prospect
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid references leads(id) on delete cascade,
  prospect_id uuid references prospects(id) on delete cascade,
  type text not null check (type in ('call', 'email', 'message', 'meeting', 'note')),
  body text,
  check (lead_id is not null or prospect_id is not null)
);

create index if not exists leads_status_idx on leads (status);
create index if not exists emails_lead_idx on emails (lead_id, sent_at);
create index if not exists prospects_status_idx on prospects (status);
create index if not exists activities_lead_idx on activities (lead_id, created_at);
create index if not exists activities_prospect_idx on activities (prospect_id, created_at);

alter table leads enable row level security;   -- aucune policy : seul le serveur, avec la service role key
alter table emails enable row level security;
alter table prospects enable row level security;
alter table activities enable row level security;
