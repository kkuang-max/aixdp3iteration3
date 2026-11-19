-- Playform database setup. Paste all of this into Supabase → SQL Editor → New query, then press Run.
-- Safe to run again: it only creates what's missing.
--
-- Who can see what (row-level security):
--   • A business sees and edits only its own account, demo, booths, leads and visit stats.
--   • Kiosks don't sign in. They send leads and visits to the app's server, which checks the booth and writes them
--     with the secret key. Nobody can read another business's data from the browser.
--   • Leads are deleted automatically once they pass their retention date (what the kiosk tells visitors).

-- ---- Businesses: one per account, created when someone signs up ----------------------------------------
create table if not exists public.businesses (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  lead_retention_days int not null default 30 check (lead_retention_days between 1 and 365),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.businesses (id, name) values (new.id, coalesce(new.raw_user_meta_data ->> 'business_name', ''))
  on conflict (id) do nothing;
  insert into public.demos (business_id) values (new.id) on conflict (business_id) do nothing;
  return new;
end $$;

-- ---- Demo: the portal's draft and what is published to the business's kiosks ----------------------------
create table if not exists public.demos (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  draft jsonb,                 -- everything filled in on the business portal
  published jsonb,             -- what the kiosks show
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---- Booths: each kiosk opens /?booth=<id> and shows its business's published demo -----------------------
create table if not exists public.booths (
  id text primary key default substr(md5(gen_random_uuid()::text), 1, 10),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null default 'Booth',
  created_at timestamptz not null default now()
);
create index if not exists booths_business on public.booths (business_id);

-- ---- Leads left at a kiosk ---------------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  booth_id text references public.booths (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,         -- deleted after this (the kiosk tells the visitor when)
  kind text not null,                      -- brochure | team | contact
  method text not null,                    -- badge | phone | email
  name text,
  email text,
  phone text,
  company text,
  questions text,
  explored text[] not null default '{}'
);
create index if not exists leads_business on public.leads (business_id, created_at desc);

-- ---- Visits: what each visitor did at a kiosk (no names, no contact details) -----------------------------
create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  booth_id text references public.booths (id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz not null default now(),
  topic_ms jsonb not null default '{}',     -- time on each topic, e.g. {"what": 12000, "how": 30500}
  topics text[] not null default '{}',      -- topics the visitor picked themselves, in order
  zoomed_parts text[] not null default '{}',-- parts they zoomed in on
  left_lead boolean not null default false,
  asked_for_team boolean not null default false
);
create index if not exists visits_business on public.visits (business_id, ended_at desc);

-- ---- Row-level security --------------------------------------------------------------------------------------
alter table public.businesses enable row level security;
alter table public.demos enable row level security;
alter table public.booths enable row level security;
alter table public.leads enable row level security;
alter table public.visits enable row level security;

drop policy if exists "own business" on public.businesses;
create policy "own business" on public.businesses for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "own demo" on public.demos;
create policy "own demo" on public.demos for all to authenticated
  using (business_id = auth.uid()) with check (business_id = auth.uid());

drop policy if exists "own booths" on public.booths;
create policy "own booths" on public.booths for all to authenticated
  using (business_id = auth.uid()) with check (business_id = auth.uid());

-- Leads and visits are only written by the app's server; a business can read and delete its own.
drop policy if exists "read own leads" on public.leads;
create policy "read own leads" on public.leads for select to authenticated using (business_id = auth.uid());
drop policy if exists "delete own leads" on public.leads;
create policy "delete own leads" on public.leads for delete to authenticated using (business_id = auth.uid());

drop policy if exists "read own visits" on public.visits;
create policy "read own visits" on public.visits for select to authenticated using (business_id = auth.uid());

-- ---- Uploaded files (PRD and 3D model), private to each account: uploads/<user id>/... -------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "own uploads read" on storage.objects;
create policy "own uploads read" on storage.objects for select to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own uploads write" on storage.objects;
create policy "own uploads write" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own uploads update" on storage.objects;
create policy "own uploads update" on storage.objects for update to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own uploads delete" on storage.objects;
create policy "own uploads delete" on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---- Delete expired leads every night (what "deleted after X days" promises) --------------------------------
create extension if not exists pg_cron;
select cron.unschedule('playform-delete-expired-leads')
  where exists (select 1 from cron.job where jobname = 'playform-delete-expired-leads');
select cron.schedule('playform-delete-expired-leads', '15 3 * * *',
  $$ delete from public.leads where expires_at < now() $$);
