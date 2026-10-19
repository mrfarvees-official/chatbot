-- DESTRUCTIVE: reset and recreate the RAG schema.
-- This deletes all documents and chunks in the current Supabase project.
-- Run assets/sql/002_remove_visibility.sql before deploying the new code
-- when upgrading an existing database.

begin;

create extension if not exists vector;

drop function if exists public.match_chunks(
  vector(768), text, text[], int, int, int
);

drop function if exists public.match_chunks(
  vector(2048), text, text[], int, int, int
);

drop table if exists public.documents cascade;
drop table if exists public.chunks cascade;
drop table if exists public.profiles cascade;
drop table if exists public.documents_legacy cascade;

create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  source        text,
  content_hash  text not null unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.chunks (
  id           bigserial primary key,
  document_id  uuid not null references public.documents(id) on delete cascade,
  chunk_index  int not null,
  content      text not null,
  embedding    vector(2048) not null,
  fts          tsvector generated always as (
    to_tsvector('english', content)
  ) stored
);

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  first_name    text,
  last_name     text,
  full_name     text,
  mobile_number text,
  updated_at    timestamptz not null default now()
);

create index documents_source_idx on public.documents (source);
create index chunks_document_idx on public.chunks (document_id);
create index chunks_fts_idx on public.chunks using gin (fts);

-- HNSW is omitted because pgvector limits HNSW indexes to 2000 dimensions.

alter table public.documents enable row level security;
alter table public.chunks enable row level security;
alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

grant select, insert, update on public.profiles to authenticated;

create or replace function public.create_profile_for_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_user();

create or replace function public.match_chunks(
  query_embedding    vector(2048),
  query_text         text,
  match_count        int default 6,
  candidate_count    int default 20,
  rrf_k              int default 60
)
returns table (
  chunk_id    bigint,
  document_id uuid,
  title       text,
  source      text,
  content     text,
  similarity  float,
  score       float
)
language sql stable
as $$
  with vec as (
    select c.id,
           row_number() over (
             order by c.embedding <=> query_embedding
           ) as rnk
    from public.chunks c
    join public.documents d on d.id = c.document_id
    order by c.embedding <=> query_embedding
    limit candidate_count
  ),
  kw as (
    select c.id,
           row_number() over (
             order by ts_rank_cd(c.fts, q) desc
           ) as rnk
    from public.chunks c
    join public.documents d on d.id = c.document_id,
         websearch_to_tsquery('english', query_text) q
    where c.fts @@ q
    order by ts_rank_cd(c.fts, q) desc
    limit candidate_count
  ),
  fused as (
    select coalesce(vec.id, kw.id) as id,
           coalesce(1.0 / (rrf_k + vec.rnk), 0)
         + coalesce(1.0 / (rrf_k + kw.rnk), 0) as score
    from vec
    full outer join kw on vec.id = kw.id
  )
  select c.id,
         c.document_id,
         d.title,
         d.source,
         c.content,
         1 - (c.embedding <=> query_embedding) as similarity,
         fused.score
  from fused
  join public.chunks c on c.id = fused.id
  join public.documents d on d.id = c.document_id
  order by fused.score desc
  limit match_count;
$$;

revoke all on function public.match_chunks(
  vector(2048), text, int, int, int
) from public, anon, authenticated;

grant execute on function public.match_chunks(
  vector(2048), text, int, int, int
) to service_role;

commit;

notify pgrst, 'reload schema';
