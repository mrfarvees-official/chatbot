-- Run this migration before deploying the public-only document code.

begin;

drop function if exists public.match_chunks(
  vector(2048), text, text[], int, int, int
);

alter table public.documents drop column if exists visibility;

create or replace function public.match_chunks(
  query_embedding vector(2048),
  query_text text,
  match_count int default 6,
  candidate_count int default 20,
  rrf_k int default 60
)
returns table (
  chunk_id bigint,
  document_id uuid,
  title text,
  source text,
  content text,
  similarity float,
  score float
)
language sql stable
as $$
  with vec as (
    select c.id,
           row_number() over (order by c.embedding <=> query_embedding) as rnk
    from public.chunks c
    order by c.embedding <=> query_embedding
    limit candidate_count
  ),
  kw as (
    select c.id,
           row_number() over (order by ts_rank_cd(c.fts, q) desc) as rnk
    from public.chunks c,
         websearch_to_tsquery('english', query_text) q
    where c.fts @@ q
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

-- Refresh PostgREST's function schema cache immediately.
notify pgrst, 'reload schema';
