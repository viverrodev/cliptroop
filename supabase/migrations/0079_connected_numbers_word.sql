-- ============================================================================
-- 0079: only the connected accounts' numbers, more numbers, the daily word in
-- one step (1.15.0)
--
--   * analytics_syncs.account_ref / account_since: the account (the
--     platform's own id) whose numbers a team has stored for a platform, and
--     since when it's the team's account. When another account is connected,
--     the app deletes the old one's numbers before anything new is copied, so
--     two accounts never mix, and the screens only show the numbers of
--     accounts that are connected now.
--   * Numbers mixed before this release: where the history shows that a team
--     switched a platform to another account (another name), that platform's
--     numbers up to the switch are deleted, and the next copy fetches the new
--     account's own history again.
--   * More numbers per day (engaged views, average % viewed, dislikes,
--     playlist adds) and per video (engaged views, watch time, average view
--     duration, average % viewed, subscribers gained; Instagram's skip rate
--     and reposts), for projections.
--   * analytics_content_days: each video's numbers per day, for "what got
--     the views that day" on the Analytics chart.
--   * daily_word_guess(): a guess saved in one step under a row lock (only
--     the server calls it, after checking the word).
-- Staging first, then production. Safe to run more than once.
-- ============================================================================

-- 1. Whose numbers ------------------------------------------------------------
alter table analytics_syncs add column if not exists account_ref text;
alter table analytics_syncs add column if not exists account_since timestamptz;
alter table analytics_syncs drop constraint if exists analytics_syncs_account_ref_check;
alter table analytics_syncs add constraint analytics_syncs_account_ref_check
  check (account_ref is null or char_length(account_ref) between 1 and 300);

-- 2. Numbers already mixed: clean them up ----------------------------------------
-- For each connected account whose numbers aren't claimed yet: walk the
-- connection history newest first. If, before this account's own events,
-- there's one about another account (another name), the numbers up to the
-- day of the switch may be that one's: they're deleted, and the next copy
-- fetches this account's own history for those days. Then the numbers are
-- claimed for the account. Numbers of a platform with nothing connected keep
-- the last account's name (from the history), so connecting that same one
-- again keeps them and connecting another one deletes them first.
-- Only the migration (and the checks) run it; returns how many were cleaned.
create or replace function analytics_claim_legacy()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  a record;
  ev record;
  era timestamptz;
  switched boolean;
  cut date;
  cleaned int := 0;
begin
  for a in
    select sa.team_id, sa.platform, sa.external_id, lower(btrim(coalesce(sa.username, sa.display_name, ''))) as name
      from social_accounts sa
     where not exists (
       select 1 from analytics_syncs s
        where s.team_id = sa.team_id and s.platform = sa.platform and s.account_ref is not null)
  loop
    era := null;
    switched := false;
    for ev in
      select l.action, lower(btrim(coalesce(l.detail->>'account', ''))) as name, l.created_at
        from social_audit_log l
       where l.team_id = a.team_id
         and l.platform = a.platform
         and l.action in ('connected', 'reconnected', 'disconnected')
       order by l.created_at desc, l.id desc
    loop
      continue when ev.name = '';
      if ev.name = a.name then
        if ev.action in ('connected', 'reconnected') then
          era := ev.created_at;
        end if;
        continue;
      end if;
      switched := true;
      exit;
    end loop;

    if switched and era is not null then
      cut := (era at time zone 'UTC')::date;
      delete from analytics_daily where team_id = a.team_id and platform = a.platform and day <= cut;
      delete from analytics_countries where team_id = a.team_id and platform = a.platform and day <= cut;
      delete from analytics_revenue_daily where team_id = a.team_id and platform = a.platform and day <= cut;
      delete from analytics_content where team_id = a.team_id and platform = a.platform and updated_at < era;
      cleaned := cleaned + 1;
    else
      switched := false;
    end if;

    insert into analytics_syncs (team_id, platform, account_ref, account_since, backfilled)
    values (a.team_id, a.platform, a.external_id, case when switched then era end, false)
    on conflict (team_id, platform) do update
      set account_ref = excluded.account_ref,
          account_since = excluded.account_since,
          backfilled = case when switched then false else analytics_syncs.backfilled end;
  end loop;

  update analytics_syncs s
     set account_ref = 'name:' || left(x.name, 290)
    from (
      select distinct on (l.team_id, l.platform) l.team_id, l.platform, lower(btrim(coalesce(l.detail->>'account', ''))) as name
        from social_audit_log l
       where l.action in ('connected', 'reconnected', 'disconnected')
       order by l.team_id, l.platform, l.created_at desc, l.id desc
    ) x
   where s.account_ref is null
     and x.team_id = s.team_id
     and x.platform = s.platform
     and x.name <> ''
     and not exists (select 1 from social_accounts sa where sa.team_id = s.team_id and sa.platform = s.platform);

  return cleaned;
end;
$$;
revoke all on function analytics_claim_legacy() from public, anon, authenticated;
select analytics_claim_legacy();

-- 3. More numbers ----------------------------------------------------------------
alter table analytics_daily add column if not exists engaged_views bigint;
alter table analytics_daily add column if not exists avg_view_pct numeric(6, 2);
alter table analytics_daily add column if not exists dislikes bigint;
alter table analytics_daily add column if not exists playlist_adds bigint;

alter table analytics_content add column if not exists engaged_views bigint;
alter table analytics_content add column if not exists watch_minutes numeric(16, 1);
alter table analytics_content add column if not exists avg_view_seconds numeric(10, 1);
alter table analytics_content add column if not exists avg_view_pct numeric(6, 2);
alter table analytics_content add column if not exists subscribers_gained bigint;
-- Instagram: the share of a Reel's plays skipped in the first seconds (%), and reposts.
alter table analytics_content add column if not exists skip_rate numeric(6, 2);
alter table analytics_content add column if not exists reposts bigint;

-- 4. Each video's numbers per day -------------------------------------------------
-- 'daily': the platform's own number for that day (YouTube). 'total': the
-- running total seen by that day's copy (Instagram, TikTok, Facebook only
-- share totals): what happened on a day = the next day's copy minus that one.
create table if not exists analytics_content_days (
  team_id uuid not null references teams(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok', 'facebook')),
  external_id text not null check (char_length(external_id) <= 200),
  day date not null,
  source text not null default 'total' check (source in ('daily', 'total')),
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  watch_minutes numeric(16, 1),
  updated_at timestamptz not null default now(),
  primary key (team_id, platform, external_id, day)
);
create index if not exists analytics_content_days_team_day_idx on analytics_content_days (team_id, day);

alter table analytics_content_days enable row level security;
revoke all on analytics_content_days from anon, authenticated;
grant select on analytics_content_days to authenticated;
drop policy if exists "team reads analytics_content_days" on analytics_content_days;
create policy "team reads analytics_content_days" on analytics_content_days for select to authenticated
  using (team_id in (select my_team_ids()));

-- 5. The daily word: one guess, one step --------------------------------------------
create or replace function daily_word_guess(p_user uuid, p_day date, p_puzzle int, p_word text, p_solved boolean)
returns table (result text, guesses text[], solved boolean, finished boolean)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v daily_word_plays%rowtype;
  v_next text[];
  v_done boolean;
begin
  if p_user is null or p_day is null or p_puzzle is null or p_word is null or p_word !~ '^[a-z]{5}$' then
    raise exception 'Not a guess.' using errcode = '22023';
  end if;
  -- The day's first guess makes the row; a second tab racing it waits here.
  insert into daily_word_plays (user_id, day, puzzle) values (p_user, p_day, p_puzzle)
  on conflict (user_id, day) do nothing;
  select * into v from daily_word_plays p where p.user_id = p_user and p.day = p_day for update;
  if v.finished_at is not null then
    return query select 'over'::text, v.guesses, v.solved, true;
    return;
  end if;
  if p_word = any (v.guesses) then
    return query select 'again'::text, v.guesses, v.solved, false;
    return;
  end if;
  v_next := v.guesses || p_word;
  v_done := coalesce(p_solved, false) or cardinality(v_next) >= 6;
  update daily_word_plays p
     set guesses = v_next,
         solved = coalesce(p_solved, false),
         finished_at = case when v_done then now() else null end,
         updated_at = now()
   where p.user_id = p_user and p.day = p_day;
  return query select 'ok'::text, v_next, coalesce(p_solved, false), v_done;
end;
$$;
revoke all on function daily_word_guess(uuid, date, int, text, boolean) from public, anon, authenticated;
grant execute on function daily_word_guess(uuid, date, int, text, boolean) to service_role;
