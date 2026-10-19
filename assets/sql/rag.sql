create extension if not exists vector;

-- 1. Keep the old table around until you've verified the migration
alter table documents rename to documents_legacy;
drop function if exists match_documents(vector, int);

-- 2. Documents: one row per logical document
create table documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  source        text,
  visibility    text not null default 'private'
                check (visibility in ('public', 'private')),
  content_hash  text not null unique,   -- dedupe identical re-ingests
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 3. Chunks: embeddings + full-text search live here
create table chunks (
  id           bigserial primary key,
  document_id  uuid not null references documents(id) on delete cascade,
  chunk_index  int  not null,
  content      text not null,
  embedding    vector(2048) not null,
  fts          tsvector generated always as (to_tsvector('english', content)) stored
);

create index chunks_document_idx  on chunks (document_id);
create index chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);
create index chunks_fts_idx       on chunks using gin (fts);

-- 4. Lock both tables down (service key bypasses RLS; no policies = no anon access)
alter table documents enable row level security;
alter table chunks    enable row level security;

-- 5. Hybrid search: vector + keyword, merged with reciprocal rank fusion
create or replace function match_chunks(
  query_embedding    vector(2048),
  query_text         text,
  allowed_visibility text[],
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
language sql stable as $$
  with vec as (
    select c.id,
           row_number() over (order by c.embedding <=> query_embedding) as rnk
    from chunks c
    join documents d on d.id = c.document_id
    where d.visibility = any (allowed_visibility)
    order by c.embedding <=> query_embedding
    limit candidate_count
  ),
  kw as (
    select c.id,
           row_number() over (order by ts_rank_cd(c.fts, q) desc) as rnk
    from chunks c
    join documents d on d.id = c.document_id,
         websearch_to_tsquery('english', query_text) q
    where d.visibility = any (allowed_visibility)
      and c.fts @@ q
    order by ts_rank_cd(c.fts, q) desc
    limit candidate_count
  ),
  fused as (
    select coalesce(vec.id, kw.id) as id,
           coalesce(1.0 / (rrf_k + vec.rnk), 0)
         + coalesce(1.0 / (rrf_k + kw.rnk), 0) as score
    from vec full outer join kw on vec.id = kw.id
  )
  select c.id, c.document_id, d.title, d.source, c.content,
         1 - (c.embedding <=> query_embedding) as similarity,
         f.score
  from fused f
  join chunks c    on c.id = f.id
  join documents d on d.id = c.document_id
  order by f.score desc
  limit match_count;
$$;

-- 6. Only the server (service role) may call it
revoke all on function match_chunks(vector, text, text[], int, int, int)
  from public, anon, authenticated;
grant execute on function match_chunks(vector, text, text[], int, int, int)
  to service_role;

-- 7. Migrate existing rows: one document per old `source`
insert into documents (title, source, visibility, content_hash)
select distinct
       coalesce(source, 'legacy'),
       coalesce(source, 'legacy'),
       'public',                      -- see note below
       md5('legacy:' || coalesce(source, 'legacy'))
from documents_legacy;

insert into chunks (document_id, chunk_index, content, embedding)
select d.id,
       (row_number() over (partition by coalesce(l.source, 'legacy') order by l.id) - 1)::int,
       l.content,
       l.embedding
from documents_legacy l
join documents d
  on d.content_hash = md5('legacy:' || coalesce(l.source, 'legacy'));

-- Once the bot works again, clean up:
-- drop table documents_legacy;
