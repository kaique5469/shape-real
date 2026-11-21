-- Shape Real — schema inicial
-- Segurança: RLS em todas as tabelas. A chave publicável vai para o navegador;
-- estas políticas são a fronteira. Nunca exponha a chave secreta no cliente.
-- Dados de saúde (medidas, fotos, dieta) são dados pessoais sensíveis (LGPD art. 11):
-- acesso apenas do próprio usuário e do personal vinculado.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Perfis
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  role text not null default 'athlete' check (role in ('athlete', 'coach')),
  plan text not null default 'free' check (plan in ('free', 'pro', 'coach')),
  onboarded boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  consent_health_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cria o perfil quando a conta é criada (nome e papel vêm do cadastro).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    case when new.raw_user_meta_data ->> 'role' = 'coach' then 'coach' else 'athlete' end
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- O plano só muda pelo backend (webhook de pagamento com a chave secreta).
create function public.guard_profile_plan() returns trigger
language plpgsql as $$
begin
  if new.plan is distinct from old.plan and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'plan can only be changed by the billing backend';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
for each row execute function public.guard_profile_plan();

-- ---------------------------------------------------------------------------
-- Personal ↔ aluno
-- ---------------------------------------------------------------------------
create table public.coach_links (
  coach_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'ativo' check (status in ('ativo', 'pausado')),
  created_at timestamptz not null default now(),
  primary key (coach_id, student_id),
  check (coach_id <> student_id)
);
create unique index coach_links_one_coach on public.coach_links (student_id);

create function public.is_coach_of(student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.coach_links
    where coach_id = auth.uid() and student_id = student and status = 'ativo'
  );
$$;

create table public.invites (
  code text primary key,
  coach_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references public.profiles (id) on delete set null,
  used_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Treino
-- ---------------------------------------------------------------------------
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  system text not null,
  goal text not null,
  level text not null,
  days_per_week int not null check (days_per_week between 1 and 7),
  notes text,
  duration_weeks int check (duration_weeks between 1 and 52),
  days jsonb not null default '[]'::jsonb,
  active boolean not null default false,
  source text not null default 'manual' check (source in ('ia', 'manual', 'modelo', 'personal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index programs_owner on public.programs (owner_id, active);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_id uuid references public.programs (id) on delete set null,
  program_name text,
  day_key text,
  day_title text,
  started_at timestamptz not null,
  finished_at timestamptz,
  exercises jsonb not null default '[]'::jsonb,
  note text,
  feeling smallint check (feeling between 1 and 5),
  volume_kg numeric not null default 0,
  prs text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index sessions_user_started on public.sessions (user_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Evolução e dieta
-- ---------------------------------------------------------------------------
create table public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  weight_kg numeric,
  body_fat_pct numeric,
  waist_cm numeric,
  hip_cm numeric,
  chest_cm numeric,
  arm_cm numeric,
  thigh_cm numeric,
  note text
);
create index body_metrics_user_date on public.body_metrics (user_id, date);

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  pose text not null check (pose in ('frente', 'lado', 'costas')),
  path text not null,
  created_at timestamptz not null default now()
);
create index progress_photos_user on public.progress_photos (user_id, date);

create table public.diet_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  name text not null default 'Dieta',
  targets jsonb not null,
  meals jsonb not null default '[]'::jsonb,
  notes text,
  updated_at timestamptz not null default now()
);

-- Exercícios e alimentos criados pelo usuário (o item completo fica em data).
create table public.custom_exercises (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, id)
);

create table public.custom_foods (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, id)
);

-- ---------------------------------------------------------------------------
-- Monetização: uso de IA e interesse em planos pagos
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);
create index ai_usage_user_month on public.ai_usage (user_id, created_at);

create table public.upgrade_intents (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan text not null,
  created_at timestamptz not null default now()
);

-- Plano efetivo: aluno vinculado a um personal pagante usa recursos Pro.
create function public.effective_plan(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when p.plan <> 'free' then p.plan
    when exists (
      select 1 from public.coach_links l join public.profiles c on c.id = l.coach_id
      where l.student_id = uid and l.status = 'ativo' and c.plan = 'coach'
    ) then 'pro'
    else 'free'
  end
  from public.profiles p where p.id = uid;
$$;

-- Consome 1 crédito de IA de forma atômica. Chamado pela rota de IA com o token do usuário.
create function public.consume_ai_credit(kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  plan text;
  quota int;
  used int;
begin
  if me is null then
    return jsonb_build_object('allowed', false, 'reason', 'unauthenticated');
  end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  plan := coalesce(public.effective_plan(me), 'free');
  quota := case plan when 'coach' then 300 when 'pro' then 60 else 3 end;
  select count(*) into used from public.ai_usage
  where user_id = me and created_at >= date_trunc('month', now());
  if used >= quota then
    return jsonb_build_object('allowed', false, 'reason', 'quota', 'used', used, 'limit', quota, 'plan', plan);
  end if;
  insert into public.ai_usage (user_id, kind) values (me, left(kind, 32));
  return jsonb_build_object('allowed', true, 'used', used + 1, 'limit', quota, 'plan', plan);
end $$;

-- Aceita convite: valida, vincula e respeita o limite de alunos do personal.
create function public.accept_invite(invite_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv public.invites;
  coach public.profiles;
  student_count int;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select * into inv from public.invites where code = upper(trim(invite_code)) for update;
  if not found then raise exception 'invite_not_found'; end if;
  if inv.used_by is not null then raise exception 'invite_used'; end if;
  if inv.expires_at < now() then raise exception 'invite_expired'; end if;
  if inv.coach_id = me then raise exception 'invite_self'; end if;
  select * into coach from public.profiles where id = inv.coach_id;
  select count(*) into student_count from public.coach_links where coach_id = inv.coach_id;
  if coach.plan <> 'coach' and student_count >= 3 then raise exception 'coach_limit_free'; end if;
  if coach.plan = 'coach' and student_count >= 200 then raise exception 'coach_limit'; end if;

  delete from public.coach_links where student_id = me;
  insert into public.coach_links (coach_id, student_id) values (inv.coach_id, me);
  update public.invites set used_by = me, used_at = now() where code = inv.code;
  return jsonb_build_object('coach_name', coach.name);
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.coach_links enable row level security;
alter table public.invites enable row level security;
alter table public.programs enable row level security;
alter table public.sessions enable row level security;
alter table public.body_metrics enable row level security;
alter table public.progress_photos enable row level security;
alter table public.diet_plans enable row level security;
alter table public.custom_exercises enable row level security;
alter table public.custom_foods enable row level security;
alter table public.ai_usage enable row level security;
alter table public.upgrade_intents enable row level security;

-- profiles: eu, meus alunos e meu personal
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or public.is_coach_of(id)
  or exists (select 1 from public.coach_links l where l.student_id = auth.uid() and l.coach_id = profiles.id)
);
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- coach_links: as duas pontas leem; personal ou aluno podem desfazer
create policy links_select on public.coach_links for select using (coach_id = auth.uid() or student_id = auth.uid());
create policy links_delete on public.coach_links for delete using (coach_id = auth.uid() or student_id = auth.uid());

-- invites: só o personal dono
create policy invites_select on public.invites for select using (coach_id = auth.uid());
create policy invites_insert on public.invites for insert with check (
  coach_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
);

-- programs: dono ou personal vinculado
create policy programs_select on public.programs for select using (owner_id = auth.uid() or public.is_coach_of(owner_id));
create policy programs_insert on public.programs for insert with check (
  created_by = auth.uid() and (owner_id = auth.uid() or public.is_coach_of(owner_id))
);
create policy programs_update on public.programs for update
  using (owner_id = auth.uid() or public.is_coach_of(owner_id))
  with check (owner_id = auth.uid() or public.is_coach_of(owner_id));
create policy programs_delete on public.programs for delete using (
  owner_id = auth.uid() or (public.is_coach_of(owner_id) and created_by = auth.uid())
);

-- sessions: aluno escreve; personal lê
create policy sessions_select on public.sessions for select using (user_id = auth.uid() or public.is_coach_of(user_id));
create policy sessions_write on public.sessions for insert with check (user_id = auth.uid());
create policy sessions_update on public.sessions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sessions_delete on public.sessions for delete using (user_id = auth.uid());

-- body_metrics: o personal vinculado também registra a avaliação física do aluno
create policy metrics_select on public.body_metrics for select using (user_id = auth.uid() or public.is_coach_of(user_id));
create policy metrics_insert on public.body_metrics for insert with check (user_id = auth.uid() or public.is_coach_of(user_id));
create policy metrics_update on public.body_metrics for update
  using (user_id = auth.uid() or public.is_coach_of(user_id))
  with check (user_id = auth.uid() or public.is_coach_of(user_id));
create policy metrics_delete on public.body_metrics for delete using (user_id = auth.uid() or public.is_coach_of(user_id));

-- progress_photos: o personal vinculado pode adicionar fotos da avaliação; só o aluno apaga
create policy photos_select on public.progress_photos for select using (user_id = auth.uid() or public.is_coach_of(user_id));
create policy photos_insert on public.progress_photos for insert with check (user_id = auth.uid() or public.is_coach_of(user_id));
create policy photos_delete on public.progress_photos for delete using (user_id = auth.uid());

-- personalizados: só o dono
create policy custom_exercises_all on public.custom_exercises for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy custom_foods_all on public.custom_foods for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- diet_plans: dono e personal vinculado
create policy diets_select on public.diet_plans for select using (owner_id = auth.uid() or public.is_coach_of(owner_id));
create policy diets_insert on public.diet_plans for insert with check (
  created_by = auth.uid() and (owner_id = auth.uid() or public.is_coach_of(owner_id))
);
create policy diets_update on public.diet_plans for update
  using (owner_id = auth.uid() or public.is_coach_of(owner_id))
  with check (owner_id = auth.uid() or public.is_coach_of(owner_id));

-- ai_usage: leitura própria; escrita só via consume_ai_credit()
create policy ai_usage_select on public.ai_usage for select using (user_id = auth.uid());

-- upgrade_intents
create policy intents_insert on public.upgrade_intents for insert with check (user_id = auth.uid());
create policy intents_select on public.upgrade_intents for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: fotos de evolução (bucket privado, pasta = id do usuário)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 3145728, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

create policy photos_obj_select on storage.objects for select using (
  bucket_id = 'progress-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_coach_of(((storage.foldername(name))[1])::uuid)
  )
);
create policy photos_obj_insert on storage.objects for insert with check (
  bucket_id = 'progress-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_coach_of(((storage.foldername(name))[1])::uuid)
  )
);
create policy photos_obj_delete on storage.objects for delete using (
  bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text
);

-- LGPD: o próprio usuário exclui a conta; o cascade apaga perfis, treinos, medidas e dieta.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  delete from auth.users where id = auth.uid();
end $$;

grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.consume_ai_credit(text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.is_coach_of(uuid) to authenticated;
revoke execute on function public.effective_plan(uuid) from public, anon;
