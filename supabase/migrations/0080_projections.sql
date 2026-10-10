-- ============================================================================
-- 0080: projections (1.15.0)
--
--   Long-term targets with a date: "100K subscribers by January 10",
--   "40% average viewed on long videos by spring", "skip rate under 30% on
--   Reels". Set once, checked back on later: the server records each one's
--   value every day; the app works out the pace, where it's heading and how
--   everything compares with the day it was set.
--
--   * projections: what it measures (`metric`, from the app's catalogue in
--     modules/projections/lib/metrics.ts; the database only checks its
--     shape), where (`scope`: platforms, shorts or long videos, the window
--     an average is taken over, a views threshold), the target and its
--     direction (up, or down for things like the skip rate), the start day
--     and the deadline, its value when it was set (start_value) and the
--     channel's key numbers that day (`baseline`, for Compare). Masters set
--     and change them; everyone on the team reads them, except money ones
--     (metric ids starting with revenue or rpm), which only the people who
--     see revenue do. What it measures, where and since when never change
--     after it's set (a different measure is a new projection).
--   * projection_points: its value each day (the server writes them).
--   * achieved_at / ended_at: when the target was reached, and when the
--     deadline passed, with the value then (the server records them once;
--     changing the target or the deadline lets it record them again).
-- Staging first, then production. Safe to run more than once.
-- ============================================================================

create table if not exists projections (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  title text not null,
  metric text not null,
  scope jsonb not null default '{}'::jsonb,
  target numeric(20, 4) not null,
  direction text not null default 'up',
  start_day date not null,
  deadline date not null,
  start_value numeric(20, 4),
  baseline jsonb not null default '{}'::jsonb,
  color text not null default 'blue',
  note text,
  position double precision not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  achieved_at timestamptz,
  achieved_value numeric(20, 4),
  ended_at timestamptz,
  ended_value numeric(20, 4),
  archived_at timestamptz,
  -- Money (revenue, RPM…): only for the people who see revenue.
  money boolean generated always as (metric ~ '^(revenue|rpm)') stored,
  constraint projections_title_check check (char_length(btrim(title)) between 1 and 80),
  constraint projections_metric_check check (metric ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint projections_scope_check check (jsonb_typeof(scope) = 'object' and octet_length(scope::text) <= 1000),
  constraint projections_baseline_check check (jsonb_typeof(baseline) = 'object' and octet_length(baseline::text) <= 20000),
  constraint projections_target_check check (target > -1000000000000000 and target < 1000000000000000),
  constraint projections_direction_check check (direction in ('up', 'down')),
  constraint projections_dates_check check (deadline > start_day and deadline <= start_day + 3660),
  constraint projections_color_check check (color ~ '^[a-z]{2,16}$'),
  constraint projections_note_check check (note is null or char_length(note) <= 300)
);
create index if not exists projections_team_idx on projections (team_id, archived_at, deadline);
create index if not exists projections_created_by_idx on projections (created_by);

-- Server fields stay honest: who set it and when, its team, what it
-- measures and since when; only the server says it was reached or ended.
create or replace function projections_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from projections where team_id = new.team_id and archived_at is null) >= 50 then
      raise exception 'A team can have up to 50 projections. Archive some first.' using errcode = '23514';
    end if;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
    if auth.uid() is not null then
      new.achieved_at := null;
      new.achieved_value := null;
      new.ended_at := null;
      new.ended_value := null;
    end if;
  else
    new.team_id := old.team_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.metric := old.metric;
    new.scope := old.scope;
    new.start_day := old.start_day;
    new.start_value := old.start_value;
    new.baseline := old.baseline;
    if auth.uid() is not null then
      -- A new target or direction: reached is decided again; a later deadline: so is ended.
      if new.target is distinct from old.target or new.direction is distinct from old.direction then
        new.achieved_at := null;
        new.achieved_value := null;
      else
        new.achieved_at := old.achieved_at;
        new.achieved_value := old.achieved_value;
      end if;
      if new.deadline is distinct from old.deadline and new.deadline >= current_date then
        new.ended_at := null;
        new.ended_value := null;
      else
        new.ended_at := old.ended_at;
        new.ended_value := old.ended_value;
      end if;
    end if;
  end if;
  new.title := btrim(new.title);
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists projections_write on projections;
create trigger projections_write before insert or update on projections
  for each row execute procedure projections_write();

alter table projections enable row level security;
revoke all on projections from anon;
revoke insert, update on projections from authenticated;
grant select, delete on projections to authenticated;
grant insert (id, team_id, title, metric, scope, target, direction, start_day, deadline, start_value, baseline, color, note, position) on projections to authenticated;
grant update (title, target, direction, deadline, color, note, position, archived_at) on projections to authenticated;

drop policy if exists "teammates see projections" on projections;
create policy "teammates see projections" on projections for select to authenticated
  using (team_id in (select my_team_ids()) and (not money or can_view_revenue(team_id)));
drop policy if exists "masters add projections" on projections;
create policy "masters add projections" on projections for insert to authenticated
  with check (team_id in (select my_master_team_ids()));
drop policy if exists "masters change projections" on projections;
create policy "masters change projections" on projections for update to authenticated
  using (team_id in (select my_master_team_ids()))
  with check (team_id in (select my_master_team_ids()));
drop policy if exists "masters remove projections" on projections;
create policy "masters remove projections" on projections for delete to authenticated
  using (team_id in (select my_master_team_ids()));

-- ---------------------------------------------------------------------------
-- projection_points: the value each day (server only)
-- ---------------------------------------------------------------------------

create table if not exists projection_points (
  projection_id uuid not null references projections(id) on delete cascade,
  day date not null,
  team_id uuid not null references teams(id) on delete cascade,
  value numeric(20, 4) not null,
  created_at timestamptz not null default now(),
  primary key (projection_id, day)
);
create index if not exists projection_points_team_idx on projection_points (team_id, day);

alter table projection_points enable row level security;
revoke all on projection_points from anon, authenticated;
grant select on projection_points to authenticated;
drop policy if exists "teammates see projection points" on projection_points;
create policy "teammates see projection points" on projection_points for select to authenticated
  using (exists (
    select 1 from projections p
     where p.id = projection_points.projection_id
       and p.team_id in (select my_team_ids())
       and (not p.money or can_view_revenue(p.team_id))
  ));

-- Live: a projection a master sets or changes shows up for everyone looking.
do $$
begin
  begin
    alter publication supabase_realtime add table projections;
  exception when others then null;
  end;
end $$;
