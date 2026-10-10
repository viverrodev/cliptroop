<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/banner-dark.png">
  <img alt="ClipTroop: every video, from idea to posted. A clapperboard slate reading PROD. ClipTroop, with Clip the mascot." src="docs/readme/banner-light.png" width="100%">
</picture>

<p align="center">
  The studio where a video team plans, scripts, films, edits, reviews and posts,<br>
  so everyone sees what's next and whose turn it is.
</p>

<p align="center">
  <a href="https://app.cliptroop.com"><b>app.cliptroop.com</b></a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://staging.cliptroop.com">staging</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://app.cliptroop.com/status">status</a>
</p>

<p align="center">
  <img alt="Version 1.15.0" src="https://img.shields.io/badge/version-1.15.0-E8630D?style=flat-square&labelColor=2B2118">
  <img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15-2B2118?style=flat-square&logo=nextdotjs&logoColor=FFF4E6">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres-2B2118?style=flat-square&logo=supabase&logoColor=3ECF8E">
  <img alt="Vercel" src="https://img.shields.io/badge/Vercel-hosted-2B2118?style=flat-square&logo=vercel&logoColor=FFF4E6">
  <img alt="Private" src="https://img.shields.io/badge/license-private-2B2118?style=flat-square">
</p>

<br>

## One video, start to finish

Six scenes, the way video teams already work. Each person sees their part,
and the next person knows the moment it's their turn.

<br>

*Scene 1*

### Ideas become a schedule

Drop shorts into the queue and they're given a day by themselves, a few at a
time, around your days off. Pin the ones that have to go out on a date. Long
videos keep their own deadline.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/scene-plan-dark.png">
  <img alt="A month calendar filling with numbered shorts, days off striped, one short dragged to another day." src="docs/readme/scene-plan-light.png" width="640">
</picture>

*Scene 2*

### Write it, then hand it on

Write the script together, comment on any line and sketch editing ideas right
next to it. When it's ready, send it to review and then to staging. The next
person is told it's their turn.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/scene-script-dark.png">
  <img alt="A script being written, with a comment on a line, a sketch beside it and the Script, Review, Staging hand-off." src="docs/readme/scene-script-light.png" width="640">
</picture>

*Scene 3*

### Everyone knows whose turn it is

Every short and long video moves through the same steps, with a person on
each one. Mark your part done and it moves on, and the editor, reviewer or
scheduler hears about it at the right moment.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/scene-make-dark.png">
  <img alt="A film strip of steps from Script to Posted, with the person on each step." src="docs/readme/scene-make-light.png" width="640">
</picture>

*Scene 4*

### Notes on the exact frame

Upload a cut and the team watches it right in the browser. Pin a note to the
second it's about, reply, upload the next version and compare. Approve it
when it's right.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/scene-review-dark.png">
  <img alt="A vertical video with notes pinned to moments on its timeline and an Approved stamp." src="docs/readme/scene-review-light.png" width="640">
</picture>

*Scene 5*

### Out everywhere, on time

Schedule each approved short for YouTube, Instagram, Facebook and TikTok from
your team's own accounts, or post it everywhere right now. Every step is visible,
and anything that goes wrong is explained, with a retry.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/scene-post-dark.png">
  <img alt="One short going live on YouTube, Instagram and TikTok." src="docs/readme/scene-post-light.png" width="640">
</picture>

*Scene 6*

### See what worked

Views, watch time, followers and revenue from every platform, where your
audience is, and how much the team made, side by side. Copied every morning.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/scene-measure-dark.png">
  <img alt="Views, watch hours and followers, a growth line and the audience by country." src="docs/readme/scene-measure-light.png" width="640">
</picture>

<br>

## Also starring

- **Your turn, on your phone**: Install it from the browser on iPhone or Android and get a notification when it's your turn. No app store.
- **Clip**: The clapperboard who shows new people around, cheers when things are done and keeps you company while pages load.
- **Meetings**: Agenda, notes and action items that land in each person's tasks.
- **Objectives**: The team's goals (shorts a week, Instagram-only reels, long videos a month, views) fill up live, and everyone gets confetti when one is reached.
- **Projections**: Long-term targets with a date (200K subscribers by December, a Reels skip rate under 22% by spring), kept every morning with the pace it needs, where it lands and a Compare of then and now.
- **Your dashboard**: Widgets you arrange, from today's tasks and the calendar to what's posting, the numbers and the team's goals.
- **Thumbnail studio**: Thumbnail ideas side by side, so the team can pick the winner.
- **Search**: Any video, script or person, from anywhere.
- **Status**: A public page that shows whether everything is running, hour by hour.

<br>

## Under the hood

- **App**: Next.js 15 (App Router) and React 19, styled with Tailwind. One codebase for pages and server actions.
- **Data**: Supabase, with Postgres (row-level security on every table), Auth, Storage and Realtime.
- **Clockwork**: Supabase's own timer (pg_cron) runs the posting queue every minute, the status check every 10 minutes and two daily jobs.
- **Hosting**: Vercel. `staging` deploys to staging.cliptroop.com, `main` to app.cliptroop.com.
- **Posting**: The official YouTube, Instagram, Facebook and TikTok APIs, through each team's own accounts.
- **Quality**: Every push runs type checks, lint, tests, a production build and every database migration from scratch.

```text
app/          pages and routes (the app, the public pages, the API)
components/   shared interface pieces
modules/      each feature's own parts (shorts, long videos, scripts, review…)
lib/          helpers shared across features
supabase/     database migrations, applied in order
scripts/      database tooling and a stand-in backend for local previews
```

### Running it locally

```bash
npm install
cp .env.example .env.local   # fill in the staging project's values
npm run dev                  # http://localhost:3000
```

There's no public sign-up: accounts come from a team owner's invite.

### Shipping

1. Push to `staging`. CI runs and the database migrations go to staging first.
2. Check it on staging.cliptroop.com.
3. Open a pull request from `staging` to `main` and merge it with a merge commit.

### More reading

- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md): how features are built here (security, timers, performance, UI rules).
- [`VPLANNER_HANDOFF.md`](VPLANNER_HANDOFF.md): the full history, every migration and release.
- In the app, **What's new** has the release notes.

<br>

<p align="center">
  <img alt="" src="docs/readme/clip.png" width="72"><br>
  <sub>© 2026 ClipTroop. Private and proprietary: not open source, all rights reserved.</sub>
</p>
