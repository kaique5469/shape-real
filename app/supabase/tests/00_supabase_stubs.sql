-- Imitação mínima do ambiente Supabase para rodar as migrations e testar o RLS num Postgres comum.
-- Uso: ver run.sh. NUNCA aplicar isto num projeto Supabase de verdade.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role', ''), 'anon')
$$;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant execute on all functions in schema auth, storage to anon, authenticated, service_role;
grant all on all tables in schema storage to authenticated, service_role;
-- Mesmo padrão do Supabase: tudo que nasce em public fica acessível; o RLS é a fronteira.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Ferramentas de teste
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;
create table tests.results (n serial primary key, ok boolean not null, name text not null, detail text);
grant all on tests.results, tests.results_n_seq to anon, authenticated, service_role;

create function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;
create function tests.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', false);
end $$;
create function tests.ok(cond boolean, name text, detail text default null) returns void language sql as $$
  insert into tests.results (ok, name, detail) values (coalesce(cond, false), name, detail)
$$;
-- Quantas linhas a consulta devolve (com o papel atual).
create function tests.count(q text) returns int language plpgsql as $$
declare n int;
begin
  execute 'select count(*) from (' || q || ') q' into n;
  return n;
end $$;
-- Quantas linhas o comando alterou; -1 se o banco recusou.
create function tests.run(q text) returns int language plpgsql as $$
declare n int;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
exception when others then
  return -1;
end $$;
-- Mensagem do erro, ou null se passou.
create function tests.error_of(q text) returns text language plpgsql as $$
begin
  execute q;
  return null;
exception when others then
  return sqlerrm;
end $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;
