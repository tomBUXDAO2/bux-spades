# Private Facebook Leagues (Phase 1)

Status note for operators. See also [MOBILE_LAUNCH_STATUS.md](./MOBILE_LAUNCH_STATUS.md).

## What shipped

- Prisma: `League`, `LeagueMember`, `LeagueJoinRequest`, `LeagueChatMessage`, `Game.leagueId`
- Site admin: `POST /api/admin/leagues` + UI at `/admin/leagues`
- Rooms tab in lobby chat (FB required / request to join / enter)
- League page at `/league/:leagueId` (tables, chat, moderation, theme)
- Stats: `GET /api/users/:id/stats?leagueId=`

## Apply DB

```bash
cd server && npx prisma db push
# or migrate deploy using prisma/migrations/20260829000000_private_fb_leagues
```

## Create a test league

1. Owner logs in once with Facebook (so `facebookId` exists).
2. Site admin (Discord admin id) opens `/admin/leagues` and creates the league with owner user id or Facebook id.
3. FB users see it under Rooms → Request → owner approves under league admin panel.
