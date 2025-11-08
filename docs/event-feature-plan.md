- **Feature**: Discord Event Automation & Tracking  

## Admin Event Definition  
- New Events tab in admin panel collects: name, description, timezone, start/end datetime, banner upload.  
- Win criteria selectable from: `MostWins`, `MostGamesPlayed`, `HighestWinPercent`, `GamesPlayedMilestone`, `GamesWonMilestone`.  
  - Admin can choose one or many; each selected criterion has a coin reward entry (single payout per criterion/milestone).  
- Game eligibility filters support:  
  - “All games” toggle or constrained set (format, gimmick, min/max points, bid ranges).  
  - Ability to match exact game-line templates (e.g. “200k bid, 3 tricks, -100/300, Screamer Lowball”).  
- Only one event may be active at a time; creation UI enforces no overlap.  
- Timezone chosen by admin; stored and rendered in UTC, surfaced via Discord timestamps.  
- Banner image uploaded per event (short-lived storage acceptable—only current banner required).  
- Event games inherit `isLeague = true` so they still count toward overall league stats while being tagged with `eventId`.
- Admin panel now includes an Events tab with creation form (schedule, filters, rewards), banner PNG/JPEG upload, and status controls.
- `/eventstats` Discord command and scheduled announcer embed keep players updated on progress.

## Admin UI (Genesis)
- Add `Events` section in admin panel with list + create button.
- Form fields:
  - `name`, `description`, `timezone` (select), `start/end` (date/time picker with timezone awareness).
  - Banner upload (client preview; file sent to backend API).
  - Criteria builder (multi-select with coin reward + optional milestone input).
  - Filter builder:
    - Toggle “all games” vs. constraints.
    - Dropdowns for format/mode/gimmick variants.
    - Numeric inputs for coin min/max and points.
    - Optional target channel/game-line template display.
- Summary panel previewing Discord announcement before save.
- Event list view: show status, time window, quick actions (view stats, edit, cancel).
- Completed events become read-only; active events allow limited edits (banner/description).

## Discord Integration  
- New `/event` slash command (restricted to dedicated events room).  
  - Validates options against active event filters; rejects if no event active or parameters invalid.  
  - Existing `/game`/`/whiz`/`/mirror`/`/gimmick` commands disallowed in events room.  
- When `/event` posts a game line, resulting game record is tagged with the active event ID for tracking.  
- Event start: post embed to main chat channel with banner, schedule, filters, prize breakdown.  
  - Schedule background job to refresh/update embed every 30 minutes with current leaders.  
- Mid-event embeds include leaderboards per criterion and progress toward milestones.  
- Event end: compute winners, post wrap-up embed with results and prizes; admins handle payouts manually via existing coin distribution command.  

## Game Tracking & Stats  
- Extend game completion pipeline to increment event stats (games played, wins, percentages, milestone counts) using tagged games.  
- Ensure Screamer/Assassin rule enforcement uses merged Redis + DB hand snapshots (already implemented fix).  
- Stats available via new Discord slash commands (e.g. `/event-progress`, `/event-stats`) instead of admin UI dashboards.  
- No manual overrides in tooling; admins adjust manually before paying out.  
- Completed events marked “finished” for reference; no need for edit/history UI beyond stored records.  

## Storage & Background Jobs  
- Banner: reuse existing asset pipeline (e.g. S3) with event-specific key; delete/overwrite on new event.  
- Scheduler: single active event tracker handles start announcements, 30-minute refreshes, and end-of-event wrap-up.  
- Ensure cron/job runner resilient to restarts (re-load active event state on boot).  

## Open Tasks (High-Level Breakdown)  
- Backend:  
  - Event schema + APIs (create/update/delete, fetch active event).  
  - Game tagging & stat aggregation jobs.  
  - Discord bot updates for `/event` command + periodic embeds.  
- Admin UI:  
  - Event creation/edit form with validation, banner upload, criteria + rewards, filters.  
  - Event list (active + past).  
- Discord Ops:  
  - Configure channels (main announcements, events game room).  
  - Update bot command permissions.  
- QA:  
  - Verify rule enforcement for Screamer/Assassin events.  
  - Test start/end times across timezones and embed timestamps.  
  - Validate milestone rewards and leaderboard accuracy.

