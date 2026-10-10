-- Access and behaviour checks for 0080 (projections): who may read and
-- write them, money ones only for the people who see revenue, what never
-- changes after one is set, what only the server records, and the limit.
-- Run by scripts/db/test-from-scratch.sh on the database the migrations just
-- built; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: M = master of team E, X = editor in team E, R = editor in team E who
-- may see revenue, O = master of team F.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'me@example.com'),
  ('00000000-0000-4000-8000-0000000000e2', 'xe@example.com'),
  ('00000000-0000-4000-8000-0000000000e3', 're@example.com'),
  ('00000000-0000-4000-8000-0000000000f1', 'of@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'me@example.com'),
  ('00000000-0000-4000-8000-0000000000e2', 'xe@example.com'),
  ('00000000-0000-4000-8000-0000000000e3', 're@example.com'),
  ('00000000-0000-4000-8000-0000000000f1', 'of@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-00000000000e', 'Team E', 'team-e', '00000000-0000-4000-8000-0000000000e1'),
  ('10000000-0000-4000-8000-00000000000f', 'Team F', 'team-f', '00000000-0000-4000-8000-0000000000f1')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('20000000-0000-4000-8000-0000000000e2', '10000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-0000000000e2', 'xe@example.com', 'active'),
  ('20000000-0000-4000-8000-0000000000e3', '10000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-0000000000e3', 're@example.com', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('20000000-0000-4000-8000-0000000000e2', 'editor'),
  ('20000000-0000-4000-8000-0000000000e3', 'editor')
on conflict do nothing;
insert into revenue_access (team_id, user_id) values ('10000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-0000000000e3') on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 1. Masters set projections; who set it is stamped; they can't say it's reached.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
  set local role authenticated;
  insert into projections (id, team_id, title, metric, scope, target, direction, start_day, deadline, start_value, baseline, color)
  values ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000e', ' Subscribers ', 'followers', '{"platforms":["youtube"]}', 100000, 'up', current_date, current_date + 90, 61000, '{"values":{"followers":61000}}', 'blue');
  insert into projections (id, team_id, title, metric, target, start_day, deadline, color)
  values ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-00000000000e', 'Revenue', 'revenue', 5000, current_date, current_date + 60, 'green');
commit;
do $$ begin
  if (select created_by from projections where id = '40000000-0000-4000-8000-000000000001') <> '00000000-0000-4000-8000-0000000000e1' then raise exception 'FAIL 1: created_by not stamped'; end if;
  if (select title from projections where id = '40000000-0000-4000-8000-000000000001') <> 'Subscribers' then raise exception 'FAIL 1: title not trimmed'; end if;
  if not (select money from projections where id = '40000000-0000-4000-8000-000000000002') then raise exception 'FAIL 1: revenue should be a money projection'; end if;
  if (select money from projections where id = '40000000-0000-4000-8000-000000000001') then raise exception 'FAIL 1: followers is not money'; end if;
end $$;

begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
  set local role authenticated;
  do $$ begin
    begin
      insert into projections (team_id, title, metric, target, start_day, deadline, color, achieved_at)
      values ('10000000-0000-4000-8000-00000000000e', 'Sneaky', 'followers', 10, current_date, current_date + 10, 'blue', now());
      raise exception 'FAIL 1: a person could set achieved_at';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;

-- 2. Teammates read; money ones only for the people who see revenue; outsiders nothing.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
  set local role authenticated;
  do $$ begin
    if (select count(*) from projections) <> 1 then raise exception 'FAIL 2: an editor without revenue should see 1 projection, sees %', (select count(*) from projections); end if;
    begin
      insert into projections (team_id, title, metric, target, start_day, deadline, color)
      values ('10000000-0000-4000-8000-00000000000e', 'Mine', 'views', 10, current_date, current_date + 10, 'blue');
      raise exception 'FAIL 2: a non-master set a projection';
    exception when insufficient_privilege then null;
    end;
    update projections set target = 1 where id = '40000000-0000-4000-8000-000000000001';
  end $$;
rollback;
do $$ begin
  if (select target from projections where id = '40000000-0000-4000-8000-000000000001') <> 100000 then raise exception 'FAIL 2: a non-master changed the target'; end if;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
  set local role authenticated;
  do $$ begin
    if (select count(*) from projections) <> 2 then raise exception 'FAIL 2: someone who sees revenue should see both'; end if;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
  set local role authenticated;
  do $$ begin
    if (select count(*) from projections) <> 0 then raise exception 'FAIL 2: an outsider sees projections'; end if;
  end $$;
rollback;

-- 3. What it measures and since when never change; a new target opens "reached" again.
update projections set achieved_at = now(), achieved_value = 100500 where id = '40000000-0000-4000-8000-000000000001';
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
  set local role authenticated;
  update projections set target = 120000, title = 'Subs 120K' where id = '40000000-0000-4000-8000-000000000001';
  do $$ begin
    begin
      update projections set metric = 'views' where id = '40000000-0000-4000-8000-000000000001';
      raise exception 'FAIL 3: the metric could be changed';
    exception when insufficient_privilege then null;
    end;
  end $$;
commit;
do $$
declare r record;
begin
  select * into r from projections where id = '40000000-0000-4000-8000-000000000001';
  if r.title <> 'Subs 120K' or r.target <> 120000 then raise exception 'FAIL 3: the master''s change didn''t save'; end if;
  if r.achieved_at is not null then raise exception 'FAIL 3: a new target should open reached again'; end if;
  if r.metric <> 'followers' or r.start_value <> 61000 then raise exception 'FAIL 3: what it measures changed'; end if;
end $$;

-- 4. Points: the team reads its own (money ones only for revenue people); nobody writes them from the browser.
insert into projection_points (projection_id, day, team_id, value) values
  ('40000000-0000-4000-8000-000000000001', current_date, '10000000-0000-4000-8000-00000000000e', 61200),
  ('40000000-0000-4000-8000-000000000002', current_date, '10000000-0000-4000-8000-00000000000e', 1200);
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
  set local role authenticated;
  do $$ begin
    if (select count(*) from projection_points) <> 1 then raise exception 'FAIL 4: an editor without revenue should see 1 point'; end if;
    begin
      insert into projection_points (projection_id, day, team_id, value) values ('40000000-0000-4000-8000-000000000001', current_date - 1, '10000000-0000-4000-8000-00000000000e', 1);
      raise exception 'FAIL 4: a signed-in person wrote a point';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
  set local role authenticated;
  do $$ begin
    if (select count(*) from projection_points) <> 0 then raise exception 'FAIL 4: an outsider reads points'; end if;
  end $$;
rollback;

-- 5. Shapes: dates in order, no bad metric ids; and at most 50 running per team.
do $$ begin
  begin
    insert into projections (team_id, title, metric, target, start_day, deadline) values ('10000000-0000-4000-8000-00000000000e', 'Back in time', 'views', 10, current_date, current_date - 1);
    raise exception 'FAIL 5: a deadline before the start was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into projections (team_id, title, metric, target, start_day, deadline) values ('10000000-0000-4000-8000-00000000000e', 'Bad', 'Views; drop', 10, current_date, current_date + 1);
    raise exception 'FAIL 5: a bad metric id was accepted';
  exception when check_violation then null;
  end;
end $$;
do $$
declare i int;
begin
  for i in 1..48 loop
    insert into projections (team_id, title, metric, target, start_day, deadline) values ('10000000-0000-4000-8000-00000000000e', 'P' || i, 'views', 10 + i, current_date, current_date + 30);
  end loop;
  begin
    insert into projections (team_id, title, metric, target, start_day, deadline) values ('10000000-0000-4000-8000-00000000000e', 'One too many', 'views', 1, current_date, current_date + 30);
    raise exception 'FAIL 5: a 51st running projection was accepted';
  exception when check_violation then null;
  end;
end $$;
