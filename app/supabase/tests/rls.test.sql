-- Testes de RLS e das funções do Shape Real. Cada linha de tests.results é uma verificação.
\set A '''a0000000-0000-0000-0000-000000000001'''
\set B '''b0000000-0000-0000-0000-000000000002'''
\set C '''c0000000-0000-0000-0000-000000000003'''
\set D '''d0000000-0000-0000-0000-000000000004'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:A, 'ana@example.com', '{"name":"Ana Personal","role":"coach"}'),
  (:B, 'bruno@example.com', '{"name":"Bruno Personal","role":"coach"}'),
  (:C, 'caio@example.com', '{"name":"Caio Aluno","role":"athlete"}'),
  (:D, 'dani@example.com', '{}');

select tests.ok((select count(*) from public.profiles) = 4, 'cadastro cria o perfil');
select tests.ok((select role = 'coach' and trial_until > now() + interval '59 days' from public.profiles where id = :A), 'personal nasce com 60 dias de teste');
select tests.ok((select name = 'dani' and role = 'athlete' from public.profiles where id = :D), 'sem nome no cadastro usa o início do e-mail');

-- ---------------------------------------------------------------- aluno cadastrado pelo personal
select tests.login(:A);
select tests.ok((public.my_plan() ->> 'plan') = 'coach' and (public.my_plan() ->> 'paid_plan') = 'free', 'personal em teste tem o plano Personal liberado');
select id as m from public.create_managed_student('Marina Costa', '{"phone":"11999990000","goal":"hipertrofia","coachNotes":"prefere treinar cedo","plan":"coach"}') \gset
select tests.ok((select managed_by = :A and data ->> 'phone' = '11999990000' and not (data ? 'coachNotes') and not (data ? 'plan') and plan = 'free' from public.profiles where id = :'m'), 'cadastro do aluno guarda os dados e não aceita plano nem anotação dentro do perfil');
select tests.ok((select notes = 'prefere treinar cedo' from public.coach_links where coach_id = :A and student_id = :'m'), 'anotação do personal fica no vínculo');
select tests.ok(tests.run(format('update public.profiles set name = %L where id = %L', 'Marina C. Albuquerque', :'m')) = 1, 'personal edita o cadastro do aluno sem conta');
select tests.ok(tests.run(format('insert into public.programs (id, owner_id, created_by, name, system, goal, level, days_per_week, active) values (%L, %L, %L, %L, %L, %L, %L, 3, true)', 'e0000000-0000-0000-0000-00000000000a', :'m', :A, 'Ficha A', 'abc', 'hipertrofia', 'iniciante')) = 1, 'personal cria ficha para o aluno');
select tests.ok(tests.run(format('insert into public.sessions (id, user_id, program_id, started_at, volume_kg) values (%L, %L, %L, now(), 1200)', 'f0000000-0000-0000-0000-00000000000a', :'m', 'e0000000-0000-0000-0000-00000000000a')) = 1, 'personal registra o treino do aluno (aula)');
select tests.ok(tests.run(format('insert into public.body_metrics (user_id, date, weight_kg) values (%L, current_date, 63.5)', :'m')) = 1, 'personal registra a avaliação');
select tests.ok(tests.run(format('insert into public.progress_photos (id, user_id, date, pose, path) values (%L, %L, current_date, %L, %L)', 'f1000000-0000-0000-0000-00000000000a', :'m', 'frente', :'m' || '/f1.jpg')) = 1, 'personal registra foto');
select tests.ok(tests.run(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'progress-photos', :'m' || '/f1.jpg')) = 1, 'personal envia o arquivo da foto do aluno');
select tests.ok(tests.run(format('insert into public.diet_plans (owner_id, created_by, targets) values (%L, %L, %L)', :'m', :A, '{"kcal":2000,"proteinG":130,"carbsG":220,"fatG":60}')) = 1, 'personal cria a dieta');
select tests.ok(tests.run(format('insert into public.custom_exercises (owner_id, id, data) values (%L, %L, %L)', :A, 'custom_remada', '{"id":"custom_remada","name":"Remada articulada"}')) = 1, 'personal cria exercício próprio');
select tests.ok(tests.run(format('insert into public.sessions (user_id, started_at) values (%L, now())', :C)) = -1, 'personal não registra treino de quem não é aluno dele');
select tests.ok(tests.error_of(format('update public.profiles set plan = %L where id = %L', 'coach', :A)) like '%billing%', 'ninguém muda o próprio plano');
select tests.ok(tests.error_of(format('update public.profiles set trial_until = now() + interval %L where id = %L', '10 years', :A)) like '%trial%', 'ninguém estende o próprio teste');
insert into public.invites (code, coach_id, student_id) values ('MARINA1', :A, :'m');
insert into public.invites (code, coach_id) values ('GERAL01', :A);
select tests.logout();

-- ---------------------------------------------------------------- outro personal não enxerga nada
select tests.login(:B);
select tests.ok(tests.count(format('select 1 from public.profiles where id = %L', :'m')) = 0, 'outro personal não lê o cadastro do aluno');
select tests.ok(tests.count('select 1 from public.programs') = 0, 'outro personal não lê fichas');
select tests.ok(tests.count('select 1 from public.sessions') = 0, 'outro personal não lê treinos');
select tests.ok(tests.count('select 1 from public.body_metrics') = 0, 'outro personal não lê medidas');
select tests.ok(tests.count('select 1 from public.diet_plans') = 0, 'outro personal não lê dieta');
select tests.ok(tests.count('select 1 from public.progress_photos') = 0, 'outro personal não lê fotos');
select tests.ok(tests.count('select 1 from storage.objects') = 0, 'outro personal não baixa o arquivo da foto');
select tests.ok(tests.count('select 1 from public.coach_links') = 0, 'outro personal não lê vínculos');
select tests.ok(tests.count('select 1 from public.invites') = 0, 'outro personal não lê convites');
select tests.ok(tests.count('select 1 from public.custom_exercises') = 0, 'outro personal não lê exercícios próprios alheios');
select tests.ok(tests.run(format('update public.profiles set name = %L where id = %L', 'x', :'m')) = 0, 'outro personal não edita o aluno');
select tests.ok(tests.run(format('update public.programs set name = %L', 'x')) = 0, 'outro personal não edita fichas');
select tests.ok(tests.run(format('delete from public.sessions')) = 0, 'outro personal não apaga treinos');
select tests.ok(tests.error_of(format('select public.delete_managed_student(%L)', :'m')) like '%not_found%', 'outro personal não remove o aluno');
select tests.ok(tests.run(format('insert into public.invites (code, coach_id, student_id) values (%L, %L, %L)', 'ROUBO01', :B, :'m')) = -1, 'outro personal não gera convite para o aluno alheio');
select tests.ok(tests.run(format('insert into public.programs (owner_id, created_by, name, system, goal, level, days_per_week) values (%L, %L, %L, %L, %L, %L, 3)', :'m', :B, 'Invasão', 'abc', 'forca', 'iniciante')) = -1, 'outro personal não cria ficha para o aluno alheio');
select tests.logout();

-- ---------------------------------------------------------------- aluno com conta, sem vínculo
select tests.login(:C);
select tests.ok(tests.count('select 1 from public.profiles') = 1, 'aluno sem personal lê só o próprio perfil');
select tests.ok(tests.count('select 1 from public.programs') = 0 and tests.count('select 1 from public.sessions') = 0, 'aluno sem vínculo não lê dados de outros');
select tests.ok(tests.error_of(format('select public.create_managed_student(%L)', 'Fulano')) like '%not_a_coach%', 'aluno não cadastra alunos');
select tests.ok(tests.run(format('insert into public.programs (id, owner_id, created_by, name, system, goal, level, days_per_week, active) values (%L, %L, %L, %L, %L, %L, %L, 4, true)', 'e0000000-0000-0000-0000-00000000000c', :C, :C, 'Minha ficha antiga', 'ppl', 'forca', 'avancado')) = 1, 'aluno cria a própria ficha');
select tests.ok(tests.run(format('insert into public.diet_plans (owner_id, created_by, targets) values (%L, %L, %L)', :C, :C, '{"kcal":1800,"proteinG":120,"carbsG":180,"fatG":55}')) = 1, 'aluno cria a própria dieta');
select tests.ok(tests.error_of('select public.accept_invite(''NAOEXISTE'')') like '%invite_not_found%', 'código inexistente é recusado');

-- aceita o convite do cadastro feito pela personal: os dados passam para a conta dele
select (public.accept_invite('marina1') ->> 'claimed')::boolean as claimed \gset
select tests.ok(:'claimed', 'convite do cadastro é aceito (sem diferenciar maiúsculas)');
select tests.ok(tests.count(format('select 1 from public.programs where owner_id = %L', :C)) = 2, 'ficha feita pelo personal passa para a conta do aluno');
select tests.ok((select active from public.programs where id = 'e0000000-0000-0000-0000-00000000000a') and not (select active from public.programs where id = 'e0000000-0000-0000-0000-00000000000c'), 'a ficha do personal fica ativa no lugar da antiga');
select tests.ok(tests.count(format('select 1 from public.sessions where user_id = %L', :C)) = 1, 'treinos passam para a conta do aluno');
select tests.ok(tests.count(format('select 1 from public.body_metrics where user_id = %L', :C)) = 1, 'medidas passam para a conta do aluno');
select tests.ok(tests.count('select 1 from public.diet_plans') = 1 and (select created_by = :A from public.diet_plans where owner_id = :C), 'a dieta do personal substitui a anterior');
select tests.ok(tests.count('select 1 from public.progress_photos') = 1 and tests.count('select 1 from storage.objects') = 1, 'fotos e arquivos continuam acessíveis ao aluno');
select tests.ok((select data ->> 'phone' = '11999990000' and data ->> 'goal' = 'hipertrofia' from public.profiles where id = :C), 'dados preenchidos pelo personal completam o perfil');
select tests.ok(tests.count(format('select 1 from public.profiles where id = %L', :'m')) = 0, 'o cadastro provisório deixa de existir');
select tests.ok(tests.count(format('select 1 from public.profiles where id = %L', :A)) = 1, 'aluno lê o perfil do personal dele');
select tests.ok(tests.count(format('select 1 from public.profiles where id = %L', :B)) = 0, 'aluno não lê outros personais');
select tests.ok(tests.count('select 1 from public.custom_exercises') = 1, 'aluno lê os exercícios próprios do personal dele');
select tests.ok(tests.run('update public.coach_links set notes = ''hackeado''') = 0, 'aluno não altera as anotações do personal');
select tests.ok(tests.error_of('select public.accept_invite(''MARINA1'')') like '%invite_used%', 'convite não serve duas vezes');
-- o app salva com upsert: o aluno ajusta a ficha e a dieta feitas pelo personal sem "virar" o autor
select tests.ok(tests.run(format('insert into public.programs (id, owner_id, created_by, name, system, goal, level, days_per_week, active) values (%L, %L, %L, %L, %L, %L, %L, 3, true) on conflict (id) do update set name = excluded.name, created_by = excluded.created_by', 'e0000000-0000-0000-0000-00000000000a', :C, :A, 'Ficha A ajustada', 'abc', 'hipertrofia', 'iniciante')) = 1, 'aluno ajusta (upsert) a ficha feita pelo personal');
select tests.ok((select name = 'Ficha A ajustada' and created_by = :A from public.programs where id = 'e0000000-0000-0000-0000-00000000000a'), 'a ficha ajustada continua sendo do personal que a criou');
select tests.ok(tests.run(format('insert into public.diet_plans (owner_id, created_by, targets) values (%L, %L, %L) on conflict (owner_id) do update set targets = excluded.targets, created_by = excluded.created_by', :C, :C, '{"kcal":2100,"proteinG":130,"carbsG":230,"fatG":60}')) = 1, 'aluno ajusta (upsert) a dieta feita pelo personal');
select tests.ok((select created_by = :A and targets ->> 'kcal' = '2100' from public.diet_plans where owner_id = :C), 'a dieta ajustada mantém o autor original');
select tests.ok(tests.run(format('insert into public.programs (id, owner_id, created_by, name, system, goal, level, days_per_week) values (%L, %L, %L, %L, %L, %L, %L, 3)', 'e0000000-0000-0000-0000-0000000000cc', :C, :A, 'Ficha falsa', 'abc', 'forca', 'iniciante')) = 1, 'registro novo com autor declarado de outra pessoa é aceito só com o autor corrigido');
select tests.ok((select created_by = :C from public.programs where id = 'e0000000-0000-0000-0000-0000000000cc'), 'ninguém grava registro em nome de outra pessoa');
select tests.ok((public.my_plan() ->> 'plan') = 'pro', 'aluno com conta nova tem os recursos Pro no período de teste');
select tests.logout();

-- ---------------------------------------------------------------- personal segue com acesso ao aluno, agora com conta
select tests.login(:A);
select tests.ok(tests.count('select 1 from public.coach_links where student_id = ' || quote_literal(:C) || ' and notes = ''prefere treinar cedo''') = 1, 'vínculo e anotações seguem com o personal');
select tests.ok(tests.count(format('select 1 from public.sessions where user_id = %L', :C)) = 1, 'personal continua lendo os treinos do aluno');
select tests.ok(tests.run(format('update public.profiles set name = %L where id = %L', 'Outro nome', :C)) = 0, 'personal não edita o perfil de aluno com conta');
select tests.ok(tests.run(format('delete from public.progress_photos where user_id = %L', :C)) = 0, 'personal não apaga foto de aluno com conta');
select tests.ok(tests.run(format('insert into public.sessions (user_id, started_at) values (%L, now())', :C)) = 1, 'personal registra aula de aluno com conta');
select tests.logout();

-- ---------------------------------------------------------------- limite do plano grátis depois do teste
update public.profiles set trial_until = now() - interval '1 day' where id in (:B, :D);
select tests.login(:B);
select tests.ok((public.my_plan() ->> 'plan') = 'free', 'teste vencido volta ao plano grátis');
select public.create_managed_student('Aluno 1');
select public.create_managed_student('Aluno 2');
select public.create_managed_student('Aluno 3');
select tests.ok(tests.error_of('select public.create_managed_student(''Aluno 4'')') like '%coach_limit%', 'grátis cadastra até 3 alunos');
insert into public.invites (code, coach_id) values ('BRUNO01', :B);
select tests.logout();
select tests.login(:D);
select tests.ok(tests.error_of('select public.accept_invite(''BRUNO01'')') like '%coach_limit_free%', 'convite respeita o limite do plano grátis');
select tests.ok((public.my_plan() ->> 'plan') = 'free', 'aluno fora do teste e sem personal pagante fica no grátis');
select tests.ok((public.my_plan() ->> 'plan') = 'free' and (public.my_plan() ? 'trial_until'), 'my_plan devolve plano e fim do teste');
select tests.ok(tests.error_of(format('select public.effective_plan(%L)', :A)) like '%permission denied%', 'o plano de outra pessoa não é consultável');
select tests.logout();

-- plano pago do personal libera Pro para o aluno
update public.profiles set plan = 'coach' where id = :B;
select tests.login(:D);
select tests.ok((public.accept_invite('BRUNO01') ->> 'coach_name') = 'Bruno Personal', 'com plano pago o convite geral funciona');
select tests.ok((public.my_plan() ->> 'plan') = 'pro', 'aluno de personal pagante usa os recursos Pro');
select tests.logout();

-- ---------------------------------------------------------------- anônimo não lê nada
set role anon;
select tests.ok(tests.count('select 1 from public.profiles') = 0 and tests.count('select 1 from public.programs') = 0 and tests.count('select 1 from public.invites') = 0, 'visitante sem login não lê nada');
select tests.ok(tests.error_of('select public.my_plan()') is not null and tests.error_of('select public.create_managed_student(''x y'')') is not null, 'visitante não chama as funções do app');
reset role;

-- ---------------------------------------------------------------- exclusão de conta (LGPD)
select tests.login(:B);
select public.delete_my_account();
select tests.logout();
select tests.ok((select count(*) from public.profiles where id = :B or managed_by = :B) = 0 and (select count(*) from auth.users where id = :B) = 0, 'excluir a conta do personal apaga os alunos sem conta dele');
select tests.ok((select count(*) from public.profiles where id = :D) = 1 and (select count(*) from public.coach_links where student_id = :D) = 0, 'aluno com conta própria continua existindo, sem vínculo');
delete from auth.users where id = :C;
select tests.ok((select count(*) from public.profiles where id = :C) = 0 and (select count(*) from public.sessions where user_id = :C) = 0, 'remover o usuário apaga perfil e dados em cascata');
