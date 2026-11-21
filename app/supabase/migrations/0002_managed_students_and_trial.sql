-- Shape Real — alunos cadastrados pelo personal, período de teste e regras de escrita do personal.
--
-- O que muda:
--  1. O personal cadastra o aluno direto (sem o aluno ter conta). Esse aluno é um perfil comum,
--     marcado com managed_by, e já nasce vinculado. Quando o aluno cria a própria conta e aceita
--     o convite daquele cadastro, tudo o que o personal lançou passa para a conta dele.
--  2. O personal registra treino, avaliação e fotos pelos alunos (aula presencial).
--  3. Anotações do personal ficam no vínculo, não no perfil do aluno: o aluno nunca as lê.
--  4. Toda conta nova tem 60 dias com tudo liberado; depois vale o plano contratado.
--
-- Segurança: RLS continua sendo a fronteira. Funções security definer validam auth.uid() por dentro.

-- ---------------------------------------------------------------------------
-- Perfis sem conta (aluno cadastrado pelo personal)
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles add column managed_by uuid references public.profiles (id) on delete cascade;
alter table public.profiles add column trial_until timestamptz;
create index profiles_managed_by on public.profiles (managed_by) where managed_by is not null;

-- Sem a chave estrangeira, a exclusão do usuário apaga o perfil por gatilho (e o cascade faz o resto).
create function public.handle_user_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.profiles where id = old.id;
  return old;
end $$;

create trigger on_auth_user_deleted after delete on auth.users
for each row execute function public.handle_user_deleted();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, role, trial_until)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    case when new.raw_user_meta_data ->> 'role' = 'coach' then 'coach' else 'athlete' end,
    now() + interval '60 days'
  );
  return new;
end $$;

-- Plano, teste e "quem cadastrou" só mudam pelo backend ou pelas funções deste arquivo.
create or replace function public.guard_profile_plan() returns trigger
language plpgsql as $$
begin
  -- Vale para o que chega do app (papéis authenticated/anon). O backend (service_role) e as funções
  -- security definer deste schema rodam com outro current_user e não passam por esta trava.
  if current_user in ('authenticated', 'anon') then
    if new.plan is distinct from old.plan then raise exception 'plan can only be changed by the billing backend'; end if;
    if new.trial_until is distinct from old.trial_until then raise exception 'trial can only be changed by the backend'; end if;
    if new.managed_by is distinct from old.managed_by then raise exception 'managed_by cannot be changed'; end if;
    if new.id is distinct from old.id then raise exception 'id cannot be changed'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Vínculo: anotações do personal; convite pode apontar para um aluno já cadastrado
-- ---------------------------------------------------------------------------
alter table public.coach_links add column notes text;
alter table public.invites add column student_id uuid references public.profiles (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Plano efetivo com período de teste
-- ---------------------------------------------------------------------------
create or replace function public.effective_plan(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when p.plan <> 'free' then p.plan
    when p.trial_until > now() then case when p.role = 'coach' then 'coach' else 'pro' end
    when exists (
      select 1 from public.coach_links l join public.profiles c on c.id = l.coach_id
      where l.student_id = uid and l.status = 'ativo' and (c.plan = 'coach' or (c.plan = 'free' and c.trial_until > now()))
    ) then 'pro'
    else 'free'
  end
  from public.profiles p where p.id = uid;
$$;

-- O que o app precisa saber sobre o plano de quem está logado.
create function public.my_plan() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('plan', public.effective_plan(p.id), 'paid_plan', p.plan, 'trial_until', p.trial_until)
  from public.profiles p where p.id = auth.uid();
$$;

create function public.coach_student_limit(coach uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when public.effective_plan(coach) = 'coach' then 200 else 3 end;
$$;

-- ---------------------------------------------------------------------------
-- Aluno cadastrado pelo personal
-- ---------------------------------------------------------------------------
create function public.create_managed_student(student_name text, student_data jsonb default '{}'::jsonb) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  student public.profiles;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not exists (select 1 from public.profiles where id = me and role = 'coach') then raise exception 'not_a_coach'; end if;
  if length(trim(coalesce(student_name, ''))) < 2 then raise exception 'invalid_name'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  if (select count(*) from public.coach_links where coach_id = me) >= public.coach_student_limit(me) then
    raise exception 'coach_limit';
  end if;
  insert into public.profiles (name, role, onboarded, managed_by, data, consent_health_at)
  values (left(trim(student_name), 120), 'athlete', true, me, coalesce(student_data, '{}'::jsonb) - 'coachNotes' - 'managedBy' - 'plan', now())
  returning * into student;
  insert into public.coach_links (coach_id, student_id, notes) values (me, student.id, nullif(student_data ->> 'coachNotes', ''));
  return student;
end $$;

create function public.delete_managed_student(student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  delete from public.profiles where id = student and managed_by = auth.uid();
  if not found then raise exception 'not_found'; end if;
end $$;

-- Aceita convite. Se o convite é de um aluno já cadastrado pelo personal, a conta de quem aceita
-- recebe fichas, treinos, medidas, fotos e dieta daquele cadastro, e o cadastro provisório some.
create or replace function public.accept_invite(invite_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv public.invites;
  coach public.profiles;
  managed public.profiles;
  student_count int;
  link_notes text;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select * into inv from public.invites where code = upper(trim(invite_code)) for update;
  if not found then raise exception 'invite_not_found'; end if;
  if inv.used_by is not null then raise exception 'invite_used'; end if;
  if inv.expires_at < now() then raise exception 'invite_expired'; end if;
  if inv.coach_id = me then raise exception 'invite_self'; end if;
  select * into coach from public.profiles where id = inv.coach_id;

  if inv.student_id is not null then
    select * into managed from public.profiles where id = inv.student_id and managed_by = inv.coach_id for update;
    if not found then raise exception 'invite_not_found'; end if;
    select notes into link_notes from public.coach_links where coach_id = inv.coach_id and student_id = managed.id;

    -- A ficha ativa e a dieta feitas pelo personal passam a valer no lugar das que a pessoa tinha.
    if exists (select 1 from public.programs where owner_id = managed.id and active) then
      update public.programs set active = false where owner_id = me and active;
    end if;
    if exists (select 1 from public.diet_plans where owner_id = managed.id) then
      delete from public.diet_plans where owner_id = me;
    end if;
    update public.programs set owner_id = me where owner_id = managed.id;
    update public.sessions set user_id = me where user_id = managed.id;
    update public.body_metrics set user_id = me where user_id = managed.id;
    update public.progress_photos set user_id = me where user_id = managed.id;
    update public.diet_plans set owner_id = me where owner_id = managed.id;

    -- O que o personal preencheu completa o perfil; o que a pessoa já informou prevalece.
    update public.profiles
      set data = (managed.data - 'sample') || data,
          consent_health_at = coalesce(consent_health_at, now())
      where id = me;
    update public.invites set student_id = null where code = inv.code;
    delete from public.profiles where id = managed.id;
  else
    select count(*) into student_count from public.coach_links where coach_id = inv.coach_id;
    if student_count >= public.coach_student_limit(inv.coach_id) then
      raise exception '%', case when public.effective_plan(inv.coach_id) = 'coach' then 'coach_limit' else 'coach_limit_free' end;
    end if;
  end if;

  delete from public.coach_links where student_id = me;
  insert into public.coach_links (coach_id, student_id, notes) values (inv.coach_id, me, link_notes);
  update public.invites set used_by = me, used_at = now() where code = inv.code;
  return jsonb_build_object('coach_name', coach.name, 'claimed', inv.student_id is not null);
end $$;

-- LGPD: a exclusão da conta apaga o perfil (e, por cascade, treinos, medidas, dieta e alunos sem conta).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  delete from public.profiles where id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------------
-- "Criado por" é carimbado pelo banco e nunca muda
-- ---------------------------------------------------------------------------
-- O app salva com upsert. Sem isto, o aluno que ajusta a ficha feita pelo personal seria barrado
-- (a regra de inserção confere created_by) e qualquer um poderia dizer que outra pessoa criou o registro.
create function public.stamp_created_by() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('authenticated', 'anon') then new.created_by := auth.uid(); end if;
  else
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

create trigger programs_created_by before insert or update on public.programs
for each row execute function public.stamp_created_by();
create trigger diet_plans_created_by before insert or update on public.diet_plans
for each row execute function public.stamp_created_by();

-- ---------------------------------------------------------------------------
-- RLS: o que muda
-- ---------------------------------------------------------------------------
-- profiles: o personal lê e edita o cadastro dos alunos sem conta que ele criou
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or managed_by = auth.uid()
  or public.is_coach_of(id)
  or exists (select 1 from public.coach_links l where l.student_id = auth.uid() and l.coach_id = profiles.id)
);
drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or managed_by = auth.uid())
  with check (id = auth.uid() or managed_by = auth.uid());

-- coach_links: o personal edita as próprias anotações
create policy links_update on public.coach_links for update using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- invites: convite de um cadastro só para aluno sem conta do próprio personal
drop policy invites_insert on public.invites;
create policy invites_insert on public.invites for insert with check (
  coach_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
  and (student_id is null or exists (select 1 from public.profiles s where s.id = student_id and s.managed_by = auth.uid()))
);

-- sessions: o personal vinculado também registra e corrige o treino do aluno (aula presencial)
drop policy sessions_write on public.sessions;
drop policy sessions_update on public.sessions;
drop policy sessions_delete on public.sessions;
create policy sessions_write on public.sessions for insert with check (user_id = auth.uid() or public.is_coach_of(user_id));
create policy sessions_update on public.sessions for update
  using (user_id = auth.uid() or public.is_coach_of(user_id))
  with check (user_id = auth.uid() or public.is_coach_of(user_id));
create policy sessions_delete on public.sessions for delete using (user_id = auth.uid() or public.is_coach_of(user_id));

-- fotos: o personal remove foto de aluno sem conta (quem tem conta apaga as próprias)
drop policy photos_delete on public.progress_photos;
create policy photos_delete on public.progress_photos for delete using (
  user_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = progress_photos.user_id and p.managed_by = auth.uid())
);

-- dieta: quem pode editar pode apagar
create policy diets_delete on public.diet_plans for delete using (owner_id = auth.uid() or public.is_coach_of(owner_id));

-- exercícios e alimentos do personal: o aluno vinculado lê (aparecem na ficha e na dieta dele)
drop policy custom_exercises_all on public.custom_exercises;
drop policy custom_foods_all on public.custom_foods;
create policy custom_exercises_select on public.custom_exercises for select using (
  owner_id = auth.uid() or exists (select 1 from public.coach_links l where l.student_id = auth.uid() and l.coach_id = custom_exercises.owner_id)
);
create policy custom_exercises_insert on public.custom_exercises for insert with check (owner_id = auth.uid());
create policy custom_exercises_update on public.custom_exercises for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy custom_exercises_delete on public.custom_exercises for delete using (owner_id = auth.uid());
create policy custom_foods_select on public.custom_foods for select using (
  owner_id = auth.uid() or exists (select 1 from public.coach_links l where l.student_id = auth.uid() and l.coach_id = custom_foods.owner_id)
);
create policy custom_foods_insert on public.custom_foods for insert with check (owner_id = auth.uid());
create policy custom_foods_update on public.custom_foods for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy custom_foods_delete on public.custom_foods for delete using (owner_id = auth.uid());

-- Storage: o acesso à foto segue o registro em progress_photos, não o nome da pasta.
-- (Depois que o aluno assume o cadastro, as fotos antigas continuam na pasta do cadastro provisório.)
drop policy photos_obj_select on storage.objects;
drop policy photos_obj_delete on storage.objects;
create policy photos_obj_select on storage.objects for select using (
  bucket_id = 'progress-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.progress_photos p
      where p.path = storage.objects.name and (p.user_id = auth.uid() or public.is_coach_of(p.user_id))
    )
  )
);
create policy photos_obj_delete on storage.objects for delete using (
  bucket_id = 'progress-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.progress_photos p
      join public.profiles s on s.id = p.user_id
      where p.path = storage.objects.name and (p.user_id = auth.uid() or s.managed_by = auth.uid())
    )
  )
);

grant execute on function public.my_plan() to authenticated;
grant execute on function public.create_managed_student(text, jsonb) to authenticated;
grant execute on function public.delete_managed_student(uuid) to authenticated;
revoke execute on function public.my_plan() from public, anon;
revoke execute on function public.create_managed_student(text, jsonb) from public, anon;
revoke execute on function public.delete_managed_student(uuid) from public, anon;
-- Plano e limite de outra pessoa não são consultáveis pelo app: só por dentro das funções acima.
revoke execute on function public.effective_plan(uuid) from public, anon, authenticated;
revoke execute on function public.coach_student_limit(uuid) from public, anon, authenticated;
revoke execute on function public.handle_user_deleted() from public, anon, authenticated;
