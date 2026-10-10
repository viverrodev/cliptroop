-- Checks for 0079: whose numbers they are (the clean-up of numbers mixed
-- before 1.15, and claiming them), who reads each video's numbers per day,
-- and the daily word's one-step guess (the server only). Run by
-- scripts/db/test-from-scratch.sh on the database the migrations just built;
-- each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: M = master of team C, O = master of team D.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'mc@example.com'),
  ('00000000-0000-4000-8000-0000000000d1', 'od@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'mc@example.com'),
  ('00000000-0000-4000-8000-0000000000d1', 'od@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-00000000000c', 'Team C', 'team-c', '00000000-0000-4000-8000-0000000000c1'),
  ('10000000-0000-4000-8000-00000000000d', 'Team D', 'team-d', '00000000-0000-4000-8000-0000000000d1')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 1. Numbers mixed before 1.15 -------------------------------------------------------
-- Team C's Facebook: Page A connected, disconnected, then Page B connected
-- (no clean-up happened then). Its YouTube: the same channel reconnected.
-- Team D's Instagram: connected, then disconnected (nothing connected now).
insert into social_accounts (team_id, platform, external_id, display_name, username, access_token_enc) values
  ('10000000-0000-4000-8000-00000000000c', 'facebook', 'fb-page-b', 'Page B', null, 'v1:x'),
  ('10000000-0000-4000-8000-00000000000c', 'youtube', 'yt-chan', 'Channel', 'chan', 'v1:x');
insert into social_audit_log (team_id, platform, action, detail, created_at) values
  ('10000000-0000-4000-8000-00000000000c', 'facebook', 'connected', '{"account":"Page A"}', now() - interval '30 days'),
  ('10000000-0000-4000-8000-00000000000c', 'facebook', 'disconnected', '{"account":"Page A"}', now() - interval '10 days'),
  ('10000000-0000-4000-8000-00000000000c', 'facebook', 'connected', '{"account":"Page B"}', now() - interval '5 days'),
  ('10000000-0000-4000-8000-00000000000c', 'youtube', 'connected', '{"account":"chan"}', now() - interval '200 days'),
  ('10000000-0000-4000-8000-00000000000c', 'youtube', 'reconnected', '{"account":"Chan"}', now() - interval '20 days'),
  ('10000000-0000-4000-8000-00000000000d', 'instagram', 'connected', '{"account":"igold"}', now() - interval '40 days'),
  ('10000000-0000-4000-8000-00000000000d', 'instagram', 'disconnected', '{"account":"igold"}', now() - interval '9 days');
insert into analytics_daily (team_id, platform, day, content, views, updated_at) values
  ('10000000-0000-4000-8000-00000000000c', 'facebook', current_date - 60, 'all', 9000, now() - interval '59 days'),
  ('10000000-0000-4000-8000-00000000000c', 'facebook', current_date - 8, 'all', 5000, now() - interval '4 days'),
  ('10000000-0000-4000-8000-00000000000c', 'facebook', current_date - 3, 'all', 3, now() - interval '2 days'),
  ('10000000-0000-4000-8000-00000000000c', 'youtube', current_date - 100, 'all', 700, now() - interval '99 days');
insert into analytics_content (team_id, platform, external_id, views, updated_at) values
  ('10000000-0000-4000-8000-00000000000c', 'facebook', 'post-a', 9000, now() - interval '12 days'),
  ('10000000-0000-4000-8000-00000000000c', 'facebook', 'post-b', 3, now() - interval '1 day');
insert into analytics_countries (team_id, platform, metric, day, country, value) values
  ('10000000-0000-4000-8000-00000000000c', 'facebook', 'followers', current_date - 40, 'RO', 800),
  ('10000000-0000-4000-8000-00000000000c', 'facebook', 'followers', current_date - 1, 'RO', 2);
insert into analytics_revenue_daily (team_id, platform, day, content, revenue) values
  ('10000000-0000-4000-8000-00000000000c', 'facebook', current_date - 30, 'all', 12.5);
insert into analytics_syncs (team_id, platform, backfilled, last_run_at) values
  ('10000000-0000-4000-8000-00000000000c', 'facebook', true, now() - interval '1 day'),
  ('10000000-0000-4000-8000-00000000000c', 'youtube', true, now() - interval '1 day'),
  ('10000000-0000-4000-8000-00000000000d', 'instagram', true, now() - interval '9 days');

do $$
declare
  n int;
  s record;
begin
  n := analytics_claim_legacy();
  if n <> 1 then raise exception 'FAIL 1: expected 1 platform cleaned, got %', n; end if;
  -- Facebook: the old Page's numbers (up to the switch) are gone; Page B's from after it stay.
  if exists (select 1 from analytics_daily where team_id = '10000000-0000-4000-8000-00000000000c' and platform = 'facebook' and day <= current_date - 5) then
    raise exception 'FAIL 1: the old Page''s days are still there';
  end if;
  if not exists (select 1 from analytics_daily where team_id = '10000000-0000-4000-8000-00000000000c' and platform = 'facebook' and day = current_date - 3) then
    raise exception 'FAIL 1: the new Page''s day was deleted';
  end if;
  if exists (select 1 from analytics_content where external_id = 'post-a') then raise exception 'FAIL 1: the old Page''s post is still there'; end if;
  if not exists (select 1 from analytics_content where external_id = 'post-b') then raise exception 'FAIL 1: the new Page''s post was deleted'; end if;
  if exists (select 1 from analytics_countries where team_id = '10000000-0000-4000-8000-00000000000c' and platform = 'facebook' and day = current_date - 40) then
    raise exception 'FAIL 1: the old Page''s countries are still there';
  end if;
  if exists (select 1 from analytics_revenue_daily where team_id = '10000000-0000-4000-8000-00000000000c' and platform = 'facebook') then
    raise exception 'FAIL 1: the old Page''s earnings are still there';
  end if;
  select * into s from analytics_syncs where team_id = '10000000-0000-4000-8000-00000000000c' and platform = 'facebook';
  if s.account_ref is distinct from 'fb-page-b' or s.backfilled or s.account_since is null or s.account_since < now() - interval '6 days' then
    raise exception 'FAIL 1: Facebook not claimed for Page B with a fresh start (%, %, %)', s.account_ref, s.backfilled, s.account_since;
  end if;
  -- YouTube: the same channel (names differ only in case): kept, claimed, no fresh start.
  if not exists (select 1 from analytics_daily where team_id = '10000000-0000-4000-8000-00000000000c' and platform = 'youtube' and day = current_date - 100) then
    raise exception 'FAIL 1: the same channel''s history was deleted';
  end if;
  select * into s from analytics_syncs where team_id = '10000000-0000-4000-8000-00000000000c' and platform = 'youtube';
  if s.account_ref is distinct from 'yt-chan' or not s.backfilled or s.account_since is not null then
    raise exception 'FAIL 1: YouTube should be claimed as it was (%, %, %)', s.account_ref, s.backfilled, s.account_since;
  end if;
  -- Instagram with nothing connected: remembered by the last account's name.
  if (select account_ref from analytics_syncs where team_id = '10000000-0000-4000-8000-00000000000d' and platform = 'instagram') is distinct from 'name:igold' then
    raise exception 'FAIL 1: the disconnected account''s name isn''t kept';
  end if;
  -- Twice: nothing more happens.
  n := analytics_claim_legacy();
  if n <> 0 then raise exception 'FAIL 1: a second run cleaned again (%)', n; end if;
  if not exists (select 1 from analytics_daily where team_id = '10000000-0000-4000-8000-00000000000c' and platform = 'facebook' and day = current_date - 3) then
    raise exception 'FAIL 1: a second run deleted numbers';
  end if;
end $$;

-- Only the migration runs the clean-up.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
  set local role authenticated;
  do $$ begin
    begin
      perform analytics_claim_legacy();
      raise exception 'FAIL 1: a signed-in person ran the clean-up';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;

-- 2. Each video's numbers per day: the team reads, nobody writes from the browser.
insert into analytics_content_days (team_id, platform, external_id, day, source, views) values
  ('10000000-0000-4000-8000-00000000000c', 'youtube', 'vid-1', current_date - 1, 'daily', 120),
  ('10000000-0000-4000-8000-00000000000d', 'youtube', 'vid-9', current_date - 1, 'daily', 99);
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
  set local role authenticated;
  do $$ begin
    if (select count(*) from analytics_content_days) <> 1 then raise exception 'FAIL 2: a teammate should read exactly their team''s day'; end if;
    begin
      insert into analytics_content_days (team_id, platform, external_id, day, views) values ('10000000-0000-4000-8000-00000000000c', 'youtube', 'vid-2', current_date, 5);
      raise exception 'FAIL 2: a signed-in person wrote numbers';
    exception when insufficient_privilege then null;
    end;
    begin
      update analytics_syncs set account_ref = 'someone-else' where team_id = '10000000-0000-4000-8000-00000000000c';
      raise exception 'FAIL 2: a signed-in person changed whose numbers they are';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
do $$ begin
  begin
    insert into analytics_content_days (team_id, platform, external_id, day, source) values ('10000000-0000-4000-8000-00000000000c', 'youtube', 'vid-3', current_date, 'weekly');
    raise exception 'FAIL 2: an unknown source was accepted';
  exception when check_violation then null;
  end;
end $$;

-- 3. The daily word: one guess, one step, the server only.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
  set local role authenticated;
  do $$ begin
    begin
      perform daily_word_guess('00000000-0000-4000-8000-0000000000c1', current_date, 1, 'crane', true);
      raise exception 'FAIL 3: a signed-in person saved a guess (and could mark it solved)';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;

do $$
declare
  r record;
begin
  select * into r from daily_word_guess('00000000-0000-4000-8000-0000000000c1', '2026-10-10', 500, 'crane', false);
  if r.result <> 'ok' or r.guesses <> array['crane'] or r.finished then raise exception 'FAIL 3: first guess (% % %)', r.result, r.guesses, r.finished; end if;
  select * into r from daily_word_guess('00000000-0000-4000-8000-0000000000c1', '2026-10-10', 500, 'crane', false);
  if r.result <> 'again' or cardinality(r.guesses) <> 1 then raise exception 'FAIL 3: the same word twice should be refused (%)', r.result; end if;
  select * into r from daily_word_guess('00000000-0000-4000-8000-0000000000c1', '2026-10-10', 500, 'slate', true);
  if r.result <> 'ok' or not r.solved or not r.finished or r.guesses <> array['crane', 'slate'] then raise exception 'FAIL 3: solving (% % %)', r.result, r.solved, r.finished; end if;
  select * into r from daily_word_guess('00000000-0000-4000-8000-0000000000c1', '2026-10-10', 500, 'house', false);
  if r.result <> 'over' then raise exception 'FAIL 3: a guess after the end should be refused (%)', r.result; end if;
  if (select finished_at is null or not solved from daily_word_plays where user_id = '00000000-0000-4000-8000-0000000000c1' and day = '2026-10-10') then
    raise exception 'FAIL 3: the play isn''t saved as solved';
  end if;
  -- Six misses end it.
  perform daily_word_guess('00000000-0000-4000-8000-0000000000d1', '2026-10-10', 500, w, false) from unnest(array['aaaaa', 'bbbbb', 'ccccc', 'ddddd', 'eeeee']) as w;
  select * into r from daily_word_guess('00000000-0000-4000-8000-0000000000d1', '2026-10-10', 500, 'fffff', false);
  if r.result <> 'ok' or not r.finished or r.solved or cardinality(r.guesses) <> 6 then raise exception 'FAIL 3: the sixth miss should end the game (% %)', r.finished, cardinality(r.guesses); end if;
  select * into r from daily_word_guess('00000000-0000-4000-8000-0000000000d1', '2026-10-10', 500, 'ggggg', false);
  if r.result <> 'over' then raise exception 'FAIL 3: a seventh guess was taken'; end if;
  -- Not a word shape: refused outright.
  begin
    perform daily_word_guess('00000000-0000-4000-8000-0000000000d1', '2026-10-11', 501, 'CRANE', false);
    raise exception 'FAIL 3: an upper-case guess was saved';
  exception when invalid_parameter_value then null;
  end;
end $$;
