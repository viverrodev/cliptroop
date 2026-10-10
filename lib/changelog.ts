/**
 * What changed in each version — the app's own patch notes.
 *
 * This list IS the record of what was added with each update: the
 * "What's new" window reads it, and the handoff's version history is
 * written from it. Every release adds one entry at the TOP, with the same
 * version as package.json (fixes 1.x.y, features 1.x.0, milestones x.0.0).
 *
 * Write for the team, not for developers: what they can now do, in plain
 * words. `kind`: "new" = a new thing, "better" = something improved,
 * "fixed" = a bug that's gone.
 */
export type ChangeKind = "new" | "better" | "fixed";
export type Change = { kind: ChangeKind; text: string };
export type Release = {
  version: string;
  /** YYYY-MM-DD (left out when unknown). */
  date?: string;
  /** A few words: the headline of this update. */
  title: string;
  changes: Change[];
};

export const CHANGELOG: Release[] = [
  {
    version: "1.15.0",
    date: "2026-10-10",
    title: "Projections, and only your accounts' numbers",
    changes: [
      { kind: "new", text: "Projections (Objectives → Projections): long-term targets with a date, like 200K subscribers by December or a Reels skip rate under 22% by spring. Set one and check back: its value is kept every morning, with how far it's come, the pace now and the pace it needs, where it lands at this pace and the day it gets there. The team is told when one is reached, and the masters how it ended." },
      { kind: "new", text: "Over 40 things to measure: followers on each platform, views and views a day, engaged view rate, watch hours, average view duration and % viewed, likes, comments, shares, saves, engagement and like rates, new followers per 1,000 views, and per video: average and median views, best video, the share of videos past a views mark, % viewed, watch time, subscribers per video, the Reels skip rate. Plus revenue and RPM (for the people who see revenue), and shorts a week and long videos a month." },
      { kind: "new", text: "Compare, on every projection: the channel's key numbers the day it was set next to the same numbers now, what moved and by how much, platform by platform." },
      { kind: "new", text: "Analytics: click a day on Views per day to see every video that got views that day, on every platform, with how many each got and its share of the day. Filter by platform, shorts or long videos, sort by views or newest, step to the day before or after, and open any video." },
      { kind: "new", text: "Four more colour themes: Ink Orange, Ink Grape, Ink Orchid and Ink Cherry, Ink's greys with orange, grape, orchid or cherry buttons." },
      { kind: "new", text: "Objectives: sixteen more colours (24 in all), and a New objective button right on the dashboard widget." },
      { kind: "better", text: "Analytics, the dashboard, objectives and projections only count the accounts connected now. Connecting a different channel, account or Page removes the old one's numbers (its history is fetched again for the new one), a disconnected account's numbers leave until you connect it again, and the Content tab no longer lists posts made on earlier accounts. Numbers already mixed from a Page switched before this update are cleaned up." },
      { kind: "better", text: "The daily word feels instant: the tiles flip as soon as you press Enter, words are checked right away on your device, and each guess is saved in one quick step." },
      { kind: "better", text: "Objectives only judge the time since a goal was set: weeks or months from before it show as Before this goal (faint, folded away) and never count as missed or toward streaks, bests and averages. A finished period without any platform numbers says No numbers instead of Missed." },
      { kind: "better", text: "Script comments name the document they belong to, and comments left on words that were rewritten since are grouped at the bottom, with Resolve all." },
      { kind: "better", text: "Developer → Usage puts the space under Uploads per day to work (where storage is heading, the busiest days, room left), and Status shows the three latest incidents with the rest folded away." },
      { kind: "better", text: "Faster pages: the dashboard downloads only the code for the widgets on it, the Team tabs, Objectives and Projections load only their own code, the upload code arrives with the first upload instead of with every short's page, and the dashboard's Analytics widgets share their lookups." },
      { kind: "better", text: "One widget hitting a problem no longer takes the whole dashboard down: its own box says so, with Try again, and the rest keeps working." },
      { kind: "fixed", text: "Opening the app could say you had no team (Start your first team) until you refreshed. A passing hiccup loading your teams is now retried, and never mistaken for having none." },
    ],
  },
  {
    version: "1.14.0",
    date: "2026-10-10",
    title: "Objectives: the team's goals, live",
    changes: [
      { kind: "new", text: "Objectives: goals for the team that fill up live as videos go out. Shorts a week, Instagram-only reels, TikTok-only shorts, long videos a month, posts on each platform, new ideas, edits, approvals, filming, and the platforms' own numbers (views, followers, likes, watch hours). Each one counts per day, week, month, quarter or year, in the team's time zone." },
      { kind: "new", text: "Make them yours: narrow any goal to some platforms (posted there, or only there), short types, long video types, Shorts or long video views, or one person's work. As many goals as you like, each with its own colour and place in the list." },
      { kind: "new", text: "Masters set them in Team settings → Objectives, with a live preview of how the goal would have gone, quick starts, and a different target for any week or month ahead (or that one off) without changing the usual one. Pause, copy, or drag to reorder." },
      { kind: "new", text: "The Objectives page (in the menu, under Insights): rings for the goals, where each one stands, the pace it needs, a forecast, its history with streaks and the best so far, who helped, and every goal reached in the last 90 days. Open a goal to see everything it counted." },
      { kind: "new", text: "When a goal is reached, the whole team is congratulated: confetti and Clip on every open screen, a fanfare (with sounds on), and a notification on everyone's phone. Missed it? It shows the next time you open the dashboard or the Objectives page." },
      { kind: "new", text: "An Objectives widget for the dashboard: the rings fill up live, with each goal's count and what's left. It fits any size, and shows all goals, one cadence, or the ones you pick." },
    ],
  },
  {
    version: "1.13.0",
    date: "2026-10-09",
    title: "The daily word, team tasks, 20 colour themes",
    changes: [
      { kind: "new", text: "The daily word: a five-letter word to guess in six tries, the same for everyone each day, with the board, colours and keyboard you'd expect. Finishing it, solved or not, counts as that day's contribution, so a day without tasks can still have its square. Add the Daily word widget to your dashboard, or open it from there." },
      { kind: "new", text: "After the daily word: your stats (played, win %, streak, best), how many tries each solve took, and how your teammates did today (tries only, never their letters). Copy my squares puts your result in a chat without giving the word away." },
      { kind: "new", text: "Team tasks: masters choose who can see everyone's tasks (Team → Defaults → Tasks): only their own (as before), masters, or the whole team. When it's on, My tasks gets a Team tab with everyone's tasks and a button per person to see just theirs, late ones in red." },
      { kind: "new", text: "Eight more colour themes, twenty in all: Coral, Solar, Sakura, Indigo, Sky, Nord, Pine and Ink (Settings → Preferences → Colours)." },
      { kind: "new", text: "For developer accounts: a Developer page in the menu with an Overview dashboard (status, errors, reports, database and storage, people, teams, uploads, posting, incidents, alerts), a Usage tab (everything stored, by team and by person, the biggest tables, against the Supabase plan's limits), Problems and Status." },
      { kind: "better", text: "Developer accounts are recognised by the email they sign in with, checked on every visit, and production has none unless they're listed." },
      { kind: "better", text: "The contribution grid counts the daily word too, and its squares say contributions instead of tasks." },
    ],
  },
  {
    version: "1.12.3",
    date: "2026-10-09",
    title: "Calmer Posting card, steadier widget filters",
    changes: [
      { kind: "better", text: "The video on a short's Posting card starts closed: one bar with its version, length and size. Watch opens the player (the file only loads then), Hide closes it. Warnings about the length stay in view." },
      { kind: "fixed", text: "Posting today widget: the platform buttons always show every platform posting today with all of its posts, so they no longer change or disappear when you pick Upcoming or Posted. A status with nothing in it can't be picked, and picking a platform that has none of the status shown goes back to All: the widget never ends up empty." },
    ],
  },
  {
    version: "1.12.2",
    date: "2026-10-09",
    title: "Facebook earnings, and filters for posts",
    changes: [
      { kind: "new", text: "Analytics → Revenue includes Facebook: a Page in Facebook's Content Monetization brings its daily earnings with every sync, next to YouTube's. It gets its own tile, its colour in the chart, a line in Where it comes from and a column in By month (and in the CSV). A Page that isn't in the program says so under the tiles." },
      { kind: "new", text: "Posting has filters for every list (Needs attention, In progress, Upcoming, Published recently): platform buttons with counts, a search by #number or title, and a day (today, tomorrow, yesterday, the next or last 7 days). Each list says how many of its posts match, and the ones with matches open by themselves." },
      { kind: "new", text: "Published recently goes further back: the latest 100 posts, 20 at a time with Show more, and the filters search all of them." },
      { kind: "better", text: "The Posting today widget is redone: one row per short with a pill for each platform (its time, posted, posting now, failed or late), problems first, how much of today has gone out, and filters: platform and Upcoming / Posted / Problems. It fits any size, down to the smallest." },
      { kind: "fixed", text: "Posting listed the oldest 200 posts, so a team with many posts could miss its newest ones. Unfinished posts and the latest published ones are now read separately." },
      { kind: "fixed", text: "In the Calendar, post and meeting times are now worked out on your device from the start. In far-away time zones they could show the wrong time for a moment." },
    ],
  },
  {
    version: "1.12.1",
    date: "2026-10-09",
    title: "The video always in view, and tidier controls",
    changes: [
      { kind: "new", text: "A short's Posting card now always shows the video that gets posted, with the same player as the review page: before, during and after posting." },
      { kind: "new", text: "Too long for a platform? The short's Video card and Posting card say so: Facebook Reels can be at most 1:30 (longer ones can't be posted there), Instagram Reels at most 15:00, and over 3:00 YouTube posts a regular video instead of a Short." },
      { kind: "new", text: "Compare two versions and choose whose sound you hear: the speaker next to each one (or none)." },
      { kind: "better", text: "In review, Open review, Approve and Needs changes are in the main column, right above the video, instead of next to Activity. What to fix after a review is there too." },
      { kind: "better", text: "Analytics → Content: one row of platform buttons (All, YouTube, Instagram, Facebook, TikTok), always all four, each with its count. Shorts the team posted are listed even before the platform shares their numbers, and Facebook Reels are read too." },
      { kind: "better", text: "Comments and editing ideas on a script are for the people working on it: its scripters, its Review and Staging people, and masters. Everyone else on the team can still read them." },
      { kind: "better", text: "Only masters and schedulers can change dates: moving shorts and long videos on the Calendar, and a long video's date. Schedulers can now move long videos on the Calendar too." },
      { kind: "better", text: "Settings: saving your profile says so (with its sound), so do showing your teams, your colour theme, role colours and script people. Removing a device from notifications asks first." },
      { kind: "fixed", text: "A profile that couldn't be saved (say, a username with a space) no longer empties every box: what you typed stays, and the username is checked as you type. Signing in with a wrong password keeps the email, and a team name stays after an error." },
    ],
  },
  {
    version: "1.12.0",
    date: "2026-10-09",
    title: "Posting to Facebook",
    changes: [
      { kind: "new", text: "Shorts now post to your Facebook Page as Reels, on their own schedule, from the short's Posting card, with their own caption and time, Post now and a link to the Reel once it's live. Reels on a Page are always public." },
      { kind: "new", text: "The Posting card shows the exact video that gets posted before you schedule it. Tap it to watch." },
      { kind: "better", text: "Facebook is no longer marked as posted when Instagram posts: Instagram doesn't share posts made by apps to Facebook. Facebook is posted (or marked by hand) on its own, like every other platform." },
      { kind: "better", text: "A Facebook Page connected for Analytics only shows \"Reconnect once and allow managing posts\" in Team → Connected accounts. Reconnect it once to post there." },
      { kind: "fixed", text: "On phones, tapping a Saturday or Sunday in the Calendar now highlights it like any other day." },
    ],
  },
  {
    version: "1.11.1",
    date: "2026-10-09",
    title: "Connecting Instagram, without the false alarm",
    changes: [
      { kind: "fixed", text: "Connecting Instagram no longer shows \"sign-in expired\" after it actually connected. Instagram sometimes sends the same sign-in back twice, and the repeat is now recognised as the same successful connection." },
    ],
  },
  {
    version: "1.11.0",
    date: "2026-10-08",
    title: "Notification history and tidier storage",
    changes: [
      { kind: "new", text: "Notification history: open the bell and press History to see everything from the last 2 weeks, by day, read or not. \"Unread\" shows only what you haven't seen yet." },
      { kind: "new", text: "Choose how long video files stay after a short is posted everywhere: 1, 2 or 3 weeks, or 1 month (Team → Defaults → Video files, masters). It also shows how much is stored right now. The short itself always stays." },
      { kind: "better", text: "The nightly clean-up and the morning analytics copy now run on staging too, not just on the live app." },
      { kind: "better", text: "The home page, sign-in, status and legal pages always show ClipTroop's own colours, whatever colour theme you picked for the app." },
      { kind: "fixed", text: "Pages with times on them (a short's Posting card, the Posting page, the calendar, meetings, analytics) no longer flicker or reload part of the page when your time zone or language differs from the server's. Dates are always in English." },
    ],
  },
  {
    version: "1.10.0",
    date: "2026-10-08",
    title: "A new front door, and Clip shows you around",
    changes: [
      { kind: "new", text: "A home page for ClipTroop: what it does, scene by scene, from planning to posting to seeing what worked, with Clip and animations that play as you scroll. Light and dark mode. Signed in? You go straight to your dashboard." },
      { kind: "new", text: "A new sign-in page with Clip and a tip each time. After signing in you land back on the page you were trying to open." },
      { kind: "new", text: "Clip's tour: the first time you open ClipTroop, Clip shows you around in about a minute (on phones too). Skip it any time and it won't start again. Want to see it again? Settings → Account → Show me around again." },
      { kind: "new", text: "Clip's icon in the browser tab, and a proper picture when a ClipTroop link is shared (Facebook, Slack, messages)." },
      { kind: "better", text: "When the automatic posting check can't reach ClipTroop, the developer page now says why (for example Vercel's protection or a password that doesn't match) and what to change." },
    ],
  },
  {
    version: "1.9.10",
    date: "2026-10-08",
    title: "Post now, and asking before marking done",
    changes: [
      { kind: "new", text: "Post now: on a short's Posting card, one big \"Post everywhere now\" button skips the scheduled times and posts on every platform right away, and each platform has its own Post now. Not scheduled yet? Next to Schedule there's Post now too, with the same checks." },
      { kind: "new", text: "The Posting page has a Post now button on each post that's waiting. Every Post now asks first." },
      { kind: "better", text: "A YouTube video already uploaded for a later time goes live right away with Post now (YouTube may ask you to reconnect once to allow it)." },
      { kind: "better", text: "Retry starts again at once instead of waiting for the next minute." },
      { kind: "better", text: "Marking something done always asks first: to-dos, meeting action items, Staging done, marking a platform posted (on the short and in the shorts list), and on the developer page." },
      { kind: "fixed", text: "\"Run due posts now\" is gone: it only ran posts that were already due, for every short at once. Post now replaces it." },
    ],
  },
  {
    version: "1.9.9",
    date: "2026-10-08",
    title: "Tell us what's broken",
    changes: [
      { kind: "new", text: "Report a bug or suggest something from Settings → Account: pick Bug or Suggestion, write up to 500 characters and add up to 3 photos or videos (25 MB each). You can drop files in or paste a screenshot." },
      { kind: "new", text: "You see your report uploading and sending, a big tick when it's through, and a clear message with Try again if something goes wrong (nothing you wrote is lost). Your recent reports are listed underneath and show Done once they're dealt with." },
      { kind: "better", text: "Clearing a date now asks first, everywhere: the calendar's Clear button, the × next to a date and a to-do's Clear date." },
      { kind: "fixed", text: "A page cut off while loading (\"Connection closed.\") is no longer counted as an error." },
    ],
  },
  {
    version: "1.9.8",
    date: "2026-10-08",
    title: "A clearer status page",
    changes: [
      { kind: "new", text: "The status page now shows the last 3 days hour by hour, like the big status pages: one bar per hour for every part of ClipTroop and the services it runs on, with the uptime. Hover or tap a bar to see that hour." },
      { kind: "better", text: "The status page is only about ClipTroop as a whole and anyone can open it. Errors and the technical details moved to a separate developer page." },
      { kind: "new", text: "Posting now starts with a Problems box for your whole team: posts that failed, posts that are late, accounts that need reconnecting (with what to do), and a note when ClipTroop itself has a problem. No problems? It says so." },
      { kind: "fixed", text: "A dropped connection (switching from Wi-Fi to mobile data, a page loading while an update went live) is no longer counted as an error." },
      { kind: "fixed", text: "Meta's checker can read the data deletion page (it was turned away, so Meta said the address wasn't valid)." },
    ],
  },
  {
    version: "1.9.7",
    date: "2026-10-07",
    title: "A dashboard made for your phone",
    changes: [
      { kind: "better", text: "On phones, tablets and smaller laptops every widget gets its own sensible size: the calendar shows a full month with room to tap (like the Calendar page), the pipeline shows every step, upcoming shorts and tasks show more at once." },
      { kind: "better", text: "Audience map: taller on phones, with the leading countries and their share listed under the map or globe. The map works with taps (tap a country to see its numbers), and the globe's zoom buttons are bigger on touch screens." },
      { kind: "better", text: "Lists that scroll inside a widget get a thin scrollbar in its own lane, so it never covers a date, a badge or an avatar." },
      { kind: "better", text: "Calendar widget on phones: press and hold a day and its card opens above that row (or below it near the top), so the days around it stay visible." },
      { kind: "better", text: "Followers shows each platform with a bar on phones, This week shows all four numbers, and widget settings are reachable on touch screens." },
    ],
  },
  {
    version: "1.9.6",
    date: "2026-10-07",
    title: "Roomier on smaller screens",
    changes: [
      { kind: "better", text: "On laptops and smaller windows the app switches to its roomier layouts sooner: the sidebar, two-column pages and the dashboard, whose widgets now sit two per row on screens narrower than about 1380px instead of getting squeezed." },
      { kind: "better", text: "Scripts open where the work is now: after \"Ready for review\" the Review document opens (Staging after \"Ready for staging\"), and sending a script on takes you straight to the next document." },
      { kind: "fixed", text: "Disconnecting an account removes it from Connected accounts right away." },
      { kind: "fixed", text: "\"No meetings planned\" no longer spills out of a small Next meeting widget." },
      { kind: "fixed", text: "Saves and refreshes that sometimes only showed after you clicked something else now show on their own." },
    ],
  },
  {
    version: "1.9.5",
    date: "2026-10-07",
    title: "Every tap answers at once",
    changes: [
      { kind: "new", text: "Clip greets you while the app opens (on your phone, the installed app and the computer), instead of a blank screen." },
      { kind: "better", text: "Every click answers right away: a thin orange line runs across the top until the next page is there." },
      { kind: "better", text: "Steps on short and long videos, tabs in Settings and Team, and documents in the script editor light up the moment you tap them, with their shape shimmering in while they load." },
      { kind: "better", text: "Settings → Notifications & app and the Team tabs have proper loading shapes, so nothing jumps in at the last second." },
      { kind: "better", text: "The installed app asks for the page while it's still waking up, so it opens a little faster." },
      { kind: "fixed", text: "Meta, Google and TikTok can now read the privacy policy, terms, data deletion page and home page (they were closed to their robots, so Meta said the data deletion address wasn't valid). The rest of the app stays private." },
    ],
  },
  {
    version: "1.9.4",
    date: "2026-10-05",
    title: "Emails that read well in dark mode",
    changes: [
      { kind: "better", text: "The invite and password emails have a proper dark version, so they stay readable in email apps set to dark mode." },
      { kind: "better", text: "App setup (owner): buttons that open the exact Supabase page for each step, clearer steps for pasting the emails, and a light / dark preview." },
      { kind: "fixed", text: "\"Forgot password\" says when to wait a minute (one reset email a minute) instead of a vague error." },
    ],
  },
  {
    version: "1.9.3",
    date: "2026-10-05",
    title: "One more step for the move",
    changes: [
      { kind: "better", text: "App setup (owner) has a last card for the move: telling Supabase's timer the new address, so automatic posting, meeting reminders and the morning analytics keep running on cliptroop.com." },
    ],
  },
  {
    version: "1.9.2",
    date: "2026-10-05",
    title: "VPlanner is now ClipTroop",
    changes: [
      { kind: "new", text: "New name: ClipTroop. Same app, same team, same Clip. Soon at its own address, app.cliptroop.com (we'll tell you when to switch)." },
      { kind: "better", text: "App setup (owner) walks through moving to the new address step by step: connecting it, email from cliptroop.com, sign-in links, the platforms' return addresses and Vercel, with every value ready to copy." },
    ],
  },
  {
    version: "1.9.1",
    date: "2026-10-04",
    title: "Staging done, a friendlier welcome, ready for our own domain",
    changes: [
      { kind: "new", text: "Scripts: \"Staging done\" on the Staging document. Optional, just to keep things tidy: every step gets a tick, a big check pops up, and everyone on the script gets a notification. Any Review or Staging tasks close by themselves. Changed your mind? Undo." },
      { kind: "new", text: "A friendlier welcome for new people: the invite email looks like VPlanner, and its link opens a welcome page with Clip. Setting up is four short steps: password, name and photo, getting it on your phone, done." },
      { kind: "new", text: "Expired or already-used links now say so plainly, with the way forward (sign in, or ask for a new link)." },
      { kind: "new", text: "App setup (for the owner, in Settings → Account): exactly what to paste in Supabase, Google, Meta, TikTok and Vercel for each copy of VPlanner, with Copy buttons and the sign-in emails ready to use." },
      { kind: "better", text: "Log out asks first, so a stray tap doesn't sign you out." },
      { kind: "better", text: "Ready for our own domain: once it's set up, the old vercel.app addresses move to the new one by themselves (staging too), so everyone uses one address." },
      { kind: "better", text: "Analytics: the audience map shows all platforms together by default." },
      { kind: "fixed", text: "Customizing the dashboard on a phone: the greeting no longer gets squeezed next to the buttons." },
    ],
  },
  {
    version: "1.9.0",
    date: "2026-10-04",
    title: "On your phone, with notifications",
    changes: [
      { kind: "new", text: "Install VPlanner on your phone like an app, straight from the browser, no app store: iPhone and iPad with Share → Add to Home Screen, Android with Install app. It gets its own icon and opens full screen. Settings → Notifications & app shows the steps for your phone." },
      { kind: "new", text: "Push notifications on phones and computers: everything that shows up in the bell also pops up on your device, even when VPlanner is closed. Turn them on per device in Settings → Notifications & app, send yourself a test, and see or remove your devices. (On iPhone, from the installed app.)" },
      { kind: "new", text: "The little clapperboard has a name again: Clip." },
      { kind: "new", text: "A public home page, plus an up-to-date privacy policy, terms and a page on deleting your data: what Google, Meta and TikTok check before approving VPlanner." },
      { kind: "better", text: "No internet? The installed app shows a friendly \"You're offline\" page and tries again by itself when you're back online." },
      { kind: "better", text: "Safer: other sites can't show VPlanner inside their pages, browsers get stricter security rules on every page, and notifications are only ever sent to the browsers' real notification services." },
      { kind: "better", text: "The app's name lives in one place now, ready for the new name and domain." },
      { kind: "fixed", text: "Automatic database updates explain a wrong database password in plain words, and the automatic checks use GitHub's current tools (no more warnings)." },
    ],
  },
  {
    version: "1.8.0",
    date: "2026-10-03",
    title: "Tasks for everything, a status page, error alerts and a faster app",
    changes: [
      { kind: "new", text: "Meeting action items are tasks now: whoever owns one sees it in My tasks (due on its date), ticking it off in the meeting completes the task, and whoever added it is told it's done. Giving it to someone else moves the task to them." },
      { kind: "new", text: "Scripts sent to Review or Staging are tasks for that step's people (\"Review the script\", \"Stage the script\"), done when it's handed on or the video moves past writing. They count in the contribution grid too." },
      { kind: "new", text: "More notifications: when you're made a reviewer or stager of a script, when an action item you added is done, and when someone lets you see revenue." },
      { kind: "new", text: "A status page (link at the bottom of Team) shows whether everything is working: the database, sign-in, files, automatic posting, the morning analytics copy, connected accounts and errors, plus the services VPlanner runs on." },
      { kind: "new", text: "Error alerts: when something breaks, the team owner gets an email and a notification (at most once an hour per problem), and the details are on the status page with a Mark fixed button." },
      { kind: "new", text: "Zoom the 3D globe with the scroll wheel, the + and − buttons or the + and − keys. It zooms toward where you point; 1× goes back to the whole globe." },
      { kind: "better", text: "Analytics updates by itself every morning. If a morning was missed, the first person to open Analytics starts the copy in the background and the page refreshes when it's done: Sync now is only for when you want it sooner." },
      { kind: "better", text: "An account can only be in one team. Connecting a channel, profile or Page that's already in another VPlanner team says so, and how to move it (disconnect it there first)." },
      { kind: "better", text: "Faster everywhere: pages load everything they need at once instead of piece by piece (Team, videos, shorts, scripts, calendar, posting), checking who's signed in is quicker, and the database answers long lists with far fewer lookups." },
      { kind: "better", text: "When a page fails, a friendly screen with Try again replaces the blank page, and the problem is reported by itself." },
      { kind: "better", text: "Every update is checked automatically before it goes out, and database changes now run themselves on staging and production." },
    ],
  },
  {
    version: "1.7.5",
    date: "2026-10-03",
    title: "Script hand-offs, a 3D globe, any currency and 12 themes",
    changes: [
      { kind: "new", text: "Script → Review → Staging: a strip under the script shows each step's people. \"Ready for review\" and \"Ready for staging\" notify the next people (in the app and by email) and copy the script into the next document when it's still empty. Reviewers can edit Review, staging people can edit Staging." },
      { kind: "new", text: "Choose who reviews and who stages per video (People on the script page), with team defaults in Team → Defaults → Scripts." },
      { kind: "new", text: "A 3D globe for your audience: drag to turn it, point at a country (or at it in the list) to see its numbers. Switch Map / Globe on the Audience tab, and in the Audience map widget's settings." },
      { kind: "new", text: "The audience map can show Instagram, Facebook and TikTok followers too, or All platforms together: point at a country to see every platform's numbers for it." },
      { kind: "new", text: "Revenue in any currency: pick yours on the Revenue tab (it's remembered for you). Other income is entered in it too." },
      { kind: "new", text: "Five new colour themes, 12 in all: Cherry, Orchid, Lime, Mocha and Slate. Sand is now golden so it no longer looks like the Default theme (which used to be called Clippy)." },
      { kind: "better", text: "Every dropdown is VPlanner's own now (income source, Copy from…, the studio's region), and searching one shows the best matches first." },
      { kind: "better", text: "Resolving a comment or an editing idea asks first. The Edit drawing and Remove buttons on a sketch are easy to see." },
      { kind: "better", text: "Thumbnail Studio: more room around the thumbnails, and the star and delete buttons stand out." },
      { kind: "fixed", text: "On phones, chart titles in Analytics no longer get squeezed by the buttons beside them." },
    ],
  },
  {
    version: "1.7.0",
    date: "2026-10-03",
    title: "All your revenue in one place, and a cleaner Thumbnail Studio",
    changes: [
      { kind: "new", text: "Revenue shows every stream: YouTube split into ads, Premium, and memberships, Supers & Shopping, plus the money YouTube doesn't know about. Masters add sponsorships, brand deals, affiliate links, merch or income from other platforms with Add income, and see it all together, per day and month by month." },
      { kind: "new", text: "YouTube revenue is also split into Shorts and long videos." },
      { kind: "better", text: "Thumbnail Studio is tidier: a compact list of your thumbnails (a swipeable strip on phones and tablets), the preview controls right on the preview, and arrows to step through variations." },
      { kind: "better", text: "A/B tests are clear: when 2 or 3 thumbnails are starred they're labelled A, B and C everywhere, with an \"A/B test on\" banner and one tap to compare them side by side. The Package card shows it too." },
      { kind: "fixed", text: "Connecting a Facebook Page could stop at \"No Facebook Page came through\" even after picking the Page. VPlanner now finds the Page you ticked, and tells you exactly what to change if Facebook still holds it back." },
    ],
  },
  {
    version: "1.6.0",
    date: "2026-10-03",
    title: "Colour themes, Facebook in Analytics, and smoother connecting",
    changes: [
      { kind: "new", text: "Colour themes: Clippy (the original), Ocean, Forest, Lagoon, Grape, Berry and Sand, each in light and dark. Pick yours in Settings → Preferences → Colours. Only you see it, and it follows you to every device." },
      { kind: "new", text: "Facebook in Analytics: connect your Facebook Page in Team → Connected accounts to see its views, likes, comments and shares, new followers and posts next to YouTube, Instagram and TikTok. (Posting to Facebook stays by hand.)" },
      { kind: "new", text: "Audience: pick which platforms to count. Click one to see only it, add others to combine them, or All together. Every number, chart and the CSV follow your choice." },
      { kind: "better", text: "Connect and Reconnect open in their own window, so the page you're on stays put. When you're done, the window closes and the account updates." },
      { kind: "fixed", text: "Unticking permissions on YouTube's (or TikTok's) screen no longer leaves a half-working connection: VPlanner says which boxes are needed and keeps your previous connection." },
      { kind: "fixed", text: "TikTok numbers: daily views now count correctly (TikTok only shares totals, so they start the day after the first copy), and its totals, likes and followers show from the first sync." },
      { kind: "fixed", text: "Coming back from connecting an account no longer jumps to the Members tab, and the \"16s ago\" times no longer cause an error when a page loads." },
      { kind: "better", text: "The Setup check is only on staging and your computer, not in production." },
    ],
  },
  {
    version: "1.5.0",
    date: "2026-10-03",
    title: "Analytics widgets, the world map, and a calmer look",
    changes: [
      { kind: "new", text: "Analytics widgets for your dashboard: This week (shorts and long videos out, on time, overdue), Views (last 7 days with the trend), Followers, Top videos and an Audience map. Add them from Customize → Add widget." },
      { kind: "new", text: "The audience heat map: a world map of where your views come from, switchable to watch time and Instagram followers. The map now ships with the app, so it always shows." },
      { kind: "fixed", text: "Country numbers could stay empty for good if one copy went wrong. Every sync now fills in any missing days from the last 4 weeks." },
      { kind: "fixed", text: "Reconnecting accounts on staging sent you back to production and failed. Each copy of VPlanner now uses its own return address, and when a platform refuses, you see its reason." },
      { kind: "new", text: "Setup check in Team → Connected accounts (masters and schedulers): shows each platform's keys, analytics permission and the exact return address to register in its developer app." },
      { kind: "better", text: "Long videos: calmer cards with a strip showing where each video is in the pipeline, and dates that turn orange when they're close and red when they're late." },
      { kind: "better", text: "Short videos: rows are one clean line, with a pin for fixed dates and the reviewer's requested changes right under the title. Stage tabs have their colour dot, and Mark done is quieter in lists." },
      { kind: "better", text: "No more gradients anywhere. Meetings violet is deeper in light mode and brighter in dark mode, so it reads clearly on both." },
      { kind: "better", text: "Our mascot has a name: say hi to Clippy." },
      { kind: "fixed", text: "The Create video buttons no longer float over the form while you scroll." },
    ],
  },
  {
    version: "1.4.0",
    date: "2026-10-03",
    title: "Analytics: how the work flows and how the videos do",
    changes: [
      { kind: "new", text: "Analytics, in the menu under Insights. Pick 7 days, 28 days, 90 days or 12 months, compare with the same stretch just before, and export any tab as a CSV for Excel or Sheets." },
      { kind: "new", text: "Production: shorts and long videos posted, how many went out on their planned day, how many days a short takes from idea to posted, what's overdue right now, which step work waits in longest, who finished what, and how automatic posting went." },
      { kind: "new", text: "Audience: views per day on YouTube, Instagram and TikTok (each, or all together against the period before), watch time, likes, comments and shares, new followers, YouTube Shorts vs long videos, and a world map of where the views come from." },
      { kind: "new", text: "Content: every video and post in the range with its views, likes, comments and shares, and a link to our short or long video it came from." },
      { kind: "new", text: "Revenue: YouTube's estimated revenue, per 1,000 views and month by month. Only masters see it, and the people a master turns it on for." },
      { kind: "better", text: "Platform numbers are copied every morning on their own; masters and schedulers can press Sync now. To allow it, reconnect YouTube, Instagram and TikTok once in Team → Connected accounts." },
      { kind: "better", text: "The menu icons are calm grey again and light up in their colour when you point at them or are on that page." },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-10-03",
    title: "Meetings, a new menu, and Clip as our logo",
    changes: [
      { kind: "new", text: "Meetings: masters and schedulers plan the team's calls (Discord by default, with a join link and an agenda). Everyone answers Going, Maybe or Can't, and each meeting keeps its notes and action items (who does what, by when)." },
      { kind: "new", text: "Reminders 3 days, 1 day and 1 hour before every meeting, in the app and by email. Planning, moving or cancelling a meeting tells everyone invited." },
      { kind: "new", text: "Add a meeting to Google Calendar, or download it for Apple Calendar and Outlook." },
      { kind: "new", text: "Next meeting widget on the dashboard: when, where, who's coming, and your answer right there. (Customized dashboards: add it from Add widget.)" },
      { kind: "new", text: "Meetings show in the calendar in their own violet colour, and as a violet dot in every date picker." },
      { kind: "better", text: "A new menu: grouped into Content, Schedule and Team. On phones the bar has Home, Shorts, Long, Calendar and More (Meetings, Posting, Team, Settings, What's new, Log out)." },
      { kind: "better", text: "Clip is now the VPlanner logo: in the menu, on phones, on the sign-in pages and as the browser tab icon. Point at him and he claps." },
      { kind: "fixed", text: "The light colour tints on many badges and chips (due dates, today, What's new labels, step chips) weren't showing. Now they do." },
    ],
  },
  {
    version: "1.2.1",
    date: "2026-10-03",
    title: "One calendar everywhere, black paper for sketches",
    changes: [
      { kind: "fixed", text: "Adding a drawing to an editing idea could fail with \"Couldn't upload the drawing\". Drawings now upload through a link the server signs after checking you're on the team, and a real reason is shown if anything still goes wrong." },
      { kind: "new", text: "Black paper in Sketch Studio: one tap turns the paper (and the studio) dark. Ink switches to white so nothing disappears, and the picture keeps its black paper in comments and in the Word and PDF exports. Your choice is remembered." },
      { kind: "better", text: "Deleting a comment or an editing idea asks first, so a misclick can't lose it." },
      { kind: "better", text: "One calendar across the app: every date picker (shorts, long videos, to-dos, the calendar page) and the dashboard Calendar widget are now the same calendar, with planned / full / long markers and a peek at what's on each day." },
      { kind: "better", text: "Long video dates use a small date button with a calendar icon (new long video, video settings), like the post date on shorts." },
      { kind: "fixed", text: "Clicking a day in the dashboard Calendar now opens that day in the big calendar." },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-10-02",
    title: "Scripting: mentions, sketches and safer drafts",
    changes: [
      { kind: "new", text: "@mentions in script comments and editing ideas. Type @ to tag a teammate, a role (@Editor, @Scheduler…) or @all. The people working on that video are suggested first, and whoever you tag gets a notification that opens the exact comment." },
      { kind: "new", text: "Sketch Studio: draw an editing idea instead of describing it. Pen, marker, shapes, arrows, text, sticky notes, stickers and images, on an endless canvas with zoom, undo and redo. Works with a finger or a pen on phones and tablets." },
      { kind: "new", text: "Sketches appear under their idea: tap one to see it full screen (pinch or tap to zoom), and they're included in the Word and PDF exports." },
      { kind: "better", text: "Drafts are safe: the text you're commenting on stays highlighted while you write, closing asks before throwing anything away, and an unfinished comment or sketch is kept on your device so you can restore it." },
      { kind: "new", text: "What's new: this window. A dot appears on it after every update." },
      { kind: "better", text: "Every page now shows its real shape while it loads (titles, tabs and columns in place), with one soft shimmer across the screen." },
      { kind: "better", text: "Clip is bigger in My tasks when you're all done for the day." },
      { kind: "better", text: "The grid behind the dashboard widgets is back while you arrange them, brighter while you're dragging." },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-10-02",
    title: "Dashboard Studio, rebuilt",
    changes: [
      { kind: "new", text: "The dashboard is a 12-column board: the same layout on every desktop screen, widgets fill empty space, and dragging and resizing are smooth (keyboard works too)." },
      { kind: "new", text: "Add widget shows live previews of every widget with your real data." },
      { kind: "new", text: "Meet Clip, the clapperboard. He celebrates when your tasks for today are done." },
      { kind: "new", text: "Little sounds across the app (checking things off, saving, notifications, dragging). Turn them off in Settings → Preferences." },
      { kind: "better", text: "My tasks has tabs, with Overdue in red when something is late." },
      { kind: "better", text: "Livelier widgets: numbers count up, pipeline bars grow, the weather icon moves, the to-do list checks off with a flourish." },
      { kind: "fixed", text: "No more sideways scrollbars in menus and popups." },
      { kind: "fixed", text: "A page error when opening the dashboard (drag and drop setup)." },
    ],
  },
  {
    version: "1.0.0",
    title: "VPlanner 1.0",
    changes: [
      { kind: "new", text: "Shorts and long videos from idea to posted, with steps, people, dates and activity." },
      { kind: "new", text: "Scripts with versions, side by side documents, comments and editing ideas, Word and PDF export." },
      { kind: "new", text: "Video review with time-stamped notes, version compare and approvals." },
      { kind: "new", text: "Automatic posting with health checks, the calendar, Thumbnail Studio and the first dashboard." },
    ],
  },
];

export const KIND_LABEL: Record<ChangeKind, string> = { new: "New", better: "Better", fixed: "Fixed" };

/** "1.2.3" → [1, 2, 3] (anything odd counts as 0). */
const parts = (v: string) => v.split(".").map((n) => Number.parseInt(n, 10) || 0);

/**
 * A feature release or milestone happened between `from` and `to` (not just
 * fixes): a new minor/major version, or any release in between that brings
 * something new (e.g. 1.7.5).
 */
export function isFeatureUpdate(from: string | null, to: string) {
  if (!from) return true;
  const [a1, a2] = parts(from);
  const [b1, b2] = parts(to);
  if (b1 > a1 || (b1 === a1 && b2 > a2)) return true;
  return CHANGELOG.some((r) => compareVersions(r.version, from) > 0 && compareVersions(r.version, to) <= 0 && r.changes.some((c) => c.kind === "new"));
}

/** -1 / 0 / 1, like a sort comparator. */
export function compareVersions(a: string, b: string) {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
  return 0;
}
