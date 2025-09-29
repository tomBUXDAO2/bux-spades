# Stats API Examples

## User Stats with All Breakdowns

### GET /api/stats/user/:userId?mode=ALL&format=ALL&league=null

```json
{
  "success": true,
  "data": {
    "totalGames": 150,
    "gamesWon": 75,
    "winRate": 50.0,
    "totalCoins": 2500000,
    "nils": {
      "bid": 45,
      "made": 30,
      "rate": 66.7
    },
    "blindNils": {
      "bid": 12,
      "made": 8,
      "rate": 66.7
    },
    "bags": {
      "total": 150,
      "perGame": 1.0
    },
    "formatBreakdown": {
      "regular": {
        "played": 100,
        "won": 50,
        "winRate": 50.0
      },
      "whiz": {
        "played": 30,
        "won": 15,
        "winRate": 50.0
      },
      "mirror": {
        "played": 15,
        "won": 7,
        "winRate": 46.7
      },
      "gimmick": {
        "played": 5,
        "won": 3,
        "winRate": 60.0
      }
    },
    "specialRulesBreakdown": {
      "screamer": {
        "played": 10,
        "won": 6,
        "winRate": 60.0
      },
      "assassin": {
        "played": 8,
        "won": 4,
        "winRate": 50.0
      }
    },
    "modeBreakdown": {
      "partners": {
        "played": 120,
        "won": 60,
        "winRate": 50.0
      },
      "solo": {
        "played": 30,
        "won": 15,
        "winRate": 50.0
      }
    }
  },
  "filters": {
    "mode": "ALL",
    "format": "ALL",
    "league": null,
    "gimmick": null
  }
}
```

## League Games Only

### GET /api/stats/user/:userId?mode=ALL&format=ALL&league=true

```json
{
  "success": true,
  "data": {
    "totalGames": 50,
    "gamesWon": 25,
    "winRate": 50.0,
    "totalCoins": 500000,
    "nils": {
      "bid": 15,
      "made": 10,
      "rate": 66.7
    },
    "blindNils": {
      "bid": 4,
      "made": 3,
      "rate": 75.0
    },
    "bags": {
      "total": 50,
      "perGame": 1.0
    },
    "formatBreakdown": {
      "regular": {
        "played": 40,
        "won": 20,
        "winRate": 50.0
      },
      "whiz": {
        "played": 10,
        "won": 5,
        "winRate": 50.0
      },
      "mirror": {
        "played": 0,
        "won": 0,
        "winRate": 0.0
      },
      "gimmick": {
        "played": 0,
        "won": 0,
        "winRate": 0.0
      }
    }
  }
}
```

## Partners Games Only

### GET /api/stats/user/:userId?mode=PARTNERS&format=ALL&league=null

```json
{
  "success": true,
  "data": {
    "totalGames": 120,
    "gamesWon": 60,
    "winRate": 50.0,
    "totalCoins": 2000000,
    "nils": {
      "bid": 36,
      "made": 24,
      "rate": 66.7
    },
    "blindNils": {
      "bid": 10,
      "made": 7,
      "rate": 70.0
    },
    "bags": {
      "total": 120,
      "perGame": 1.0
    },
    "formatBreakdown": {
      "regular": {
        "played": 80,
        "won": 40,
        "winRate": 50.0
      },
      "whiz": {
        "played": 25,
        "won": 12,
        "winRate": 48.0
      },
      "mirror": {
        "played": 12,
        "won": 6,
        "winRate": 50.0
      },
      "gimmick": {
        "played": 3,
        "won": 2,
        "winRate": 66.7
      }
    }
  }
}
```

## Solo Games Only

### GET /api/stats/user/:userId?mode=SOLO&format=ALL&league=null

```json
{
  "success": true,
  "data": {
    "totalGames": 30,
    "gamesWon": 15,
    "winRate": 50.0,
    "totalCoins": 500000,
    "nils": {
      "bid": 9,
      "made": 6,
      "rate": 66.7
    },
    "blindNils": {
      "bid": 2,
      "made": 1,
      "rate": 50.0
    },
    "bags": {
      "total": 30,
      "perGame": 1.0
    },
    "formatBreakdown": {
      "regular": {
        "played": 20,
        "won": 10,
        "winRate": 50.0
      },
      "whiz": {
        "played": 5,
        "won": 3,
        "winRate": 60.0
      },
      "mirror": {
        "played": 3,
        "won": 1,
        "winRate": 33.3
      },
      "gimmick": {
        "played": 2,
        "won": 1,
        "winRate": 50.0
      }
    }
  }
}
```

## Regular Format Only

### GET /api/stats/user/:userId?mode=ALL&format=REGULAR&league=null

```json
{
  "success": true,
  "data": {
    "totalGames": 100,
    "gamesWon": 50,
    "winRate": 50.0,
    "totalCoins": 1500000,
    "nils": {
      "bid": 30,
      "made": 20,
      "rate": 66.7
    },
    "blindNils": {
      "bid": 8,
      "made": 5,
      "rate": 62.5
    },
    "bags": {
      "total": 100,
      "perGame": 1.0
    }
  }
}
```

## Leaderboard Examples

### GET /api/stats/leaderboard?mode=ALL&format=ALL&league=null&limit=10

```json
{
  "success": true,
  "data": [
    {
      "discordId": "123456789",
      "username": "TopPlayer",
      "totalGames": 200,
      "gamesWon": 120,
      "winRate": 60.0,
      "totalCoins": 5000000
    },
    {
      "discordId": "987654321",
      "username": "SecondBest",
      "totalGames": 150,
      "gamesWon": 85,
      "winRate": 56.7,
      "totalCoins": 3000000
    }
  ]
}
```

### GET /api/stats/leaderboard?mode=PARTNERS&format=REGULAR&league=true&limit=5

```json
{
  "success": true,
  "data": [
    {
      "discordId": "111111111",
      "username": "LeagueChamp",
      "totalGames": 50,
      "gamesWon": 35,
      "winRate": 70.0,
      "totalCoins": 1000000
    }
  ]
}
```

## Discord Command Examples

### /userstats user:@Player format:Regular mode:Partners
Shows detailed stats for a specific user filtered by Regular format and Partners mode.

### /leaderboard format:Whiz limit:20
Shows top 20 players in Whiz format only.

### /userstats format:All mode:Solo
Shows your stats for Solo games only across all formats.

## Frontend Integration

The frontend can use these APIs to build the exact stats display you showed:

```javascript
// Get all stats for user
const allStats = await fetch('/api/stats/user/123?mode=ALL&format=ALL');

// Get league stats only
const leagueStats = await fetch('/api/stats/user/123?mode=ALL&format=ALL&league=true');

// Get partners stats only
const partnersStats = await fetch('/api/stats/user/123?mode=PARTNERS&format=ALL');

// Get regular format only
const regularStats = await fetch('/api/stats/user/123?mode=ALL&format=REGULAR');
```

This gives you complete flexibility to show any combination of stats with proper breakdowns!
