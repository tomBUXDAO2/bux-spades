import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const commands = [
  {
    name: 'game',
    description: 'Create a REGULAR league game line',
    options: [
      {
        name: 'mode',
        description: 'Game mode',
        type: 4, // INTEGER
        required: true,
        choices: [
          { name: 'Partners', value: 1 },
          { name: 'Solo', value: 2 }
        ]
      },
      {
        name: 'coins',
        description: 'Buy-in amount (Low: 100k-900k, High: 1M-10M)',
        type: 4, // INTEGER
        required: true,
        choices: [
          { name: '100k', value: 100000 },
          { name: '200k', value: 200000 },
          { name: '300k', value: 300000 },
          { name: '400k', value: 400000 },
          { name: '500k', value: 500000 },
          { name: '600k', value: 600000 },
          { name: '700k', value: 700000 },
          { name: '800k', value: 800000 },
          { name: '900k', value: 900000 },
          { name: '1M', value: 1000000 },
          { name: '2M', value: 2000000 },
          { name: '3M', value: 3000000 },
          { name: '4M', value: 4000000 },
          { name: '5M', value: 5000000 },
          { name: '6M', value: 6000000 },
          { name: '7M', value: 7000000 },
          { name: '8M', value: 8000000 },
          { name: '9M', value: 9000000 },
          { name: '10M', value: 10000000 }
        ]
      },
      {
        name: 'minpoints',
        description: 'Minimum points (default: -100)',
        type: 4, // INTEGER
        required: false,
        choices: [
          { name: '-250', value: -250 },
          { name: '-200', value: -200 },
          { name: '-150', value: -150 },
          { name: '-100', value: -100 }
        ]
      },
      {
        name: 'maxpoints',
        description: 'Maximum points (default: 500)',
        type: 4, // INTEGER
        required: false,
        choices: [
          { name: '100', value: 100 },
          { name: '150', value: 150 },
          { name: '200', value: 200 },
          { name: '250', value: 250 },
          { name: '300', value: 300 },
          { name: '350', value: 350 },
          { name: '400', value: 400 },
          { name: '450', value: 450 },
          { name: '500', value: 500 },
          { name: '550', value: 550 },
          { name: '600', value: 600 },
          { name: '650', value: 650 }
        ]
      },
      {
        name: 'special',
        description: 'Special rules (default: None)',
        type: 3, // STRING
        required: false,
        choices: [
          { name: 'None', value: 'NONE' },
          { name: 'Screamer', value: 'SCREAMER' },
          { name: 'Assassin', value: 'ASSASSIN' }
        ]
      },
      {
        name: 'nil',
        description: 'Allow Nil bids (default: On)',
        type: 3, // STRING
        required: false,
        choices: [
          { name: 'On', value: 'true' },
          { name: 'Off', value: 'false' }
        ]
      },
      {
        name: 'blindnil',
        description: 'Allow Blind Nil bids (default: On)',
        type: 3, // STRING
        required: false,
        choices: [
          { name: 'On', value: 'true' },
          { name: 'Off', value: 'false' }
        ]
      }
    ]
  },
  {
    name: 'whiz',
    description: 'Create a WHIZ league game line',
    options: [
      {
        name: 'mode',
        description: 'Game mode',
        type: 4, // INTEGER
        required: true,
        choices: [
          { name: 'Partners', value: 1 },
          { name: 'Solo', value: 2 }
        ]
      },
      {
        name: 'coins',
        description: 'Buy-in amount (Low: 100k-900k, High: 1M-10M)',
        type: 4, // INTEGER
        required: true,
        choices: [
          { name: '100k', value: 100000 },
          { name: '200k', value: 200000 },
          { name: '300k', value: 300000 },
          { name: '400k', value: 400000 },
          { name: '500k', value: 500000 },
          { name: '600k', value: 600000 },
          { name: '700k', value: 700000 },
          { name: '800k', value: 800000 },
          { name: '900k', value: 900000 },
          { name: '1M', value: 1000000 },
          { name: '2M', value: 2000000 },
          { name: '3M', value: 3000000 },
          { name: '4M', value: 4000000 },
          { name: '5M', value: 5000000 },
          { name: '6M', value: 6000000 },
          { name: '7M', value: 7000000 },
          { name: '8M', value: 8000000 },
          { name: '9M', value: 9000000 },
          { name: '10M', value: 10000000 }
        ]
      },
      {
        name: 'minpoints',
        description: 'Minimum points (default: -100)',
        type: 4, // INTEGER
        required: false,
        choices: [
          { name: '-250', value: -250 },
          { name: '-200', value: -200 },
          { name: '-150', value: -150 },
          { name: '-100', value: -100 }
        ]
      },
      {
        name: 'maxpoints',
        description: 'Maximum points (default: 500)',
        type: 4, // INTEGER
        required: false,
        choices: [
          { name: '100', value: 100 },
          { name: '150', value: 150 },
          { name: '200', value: 200 },
          { name: '250', value: 250 },
          { name: '300', value: 300 },
          { name: '350', value: 350 },
          { name: '400', value: 400 },
          { name: '450', value: 450 },
          { name: '500', value: 500 },
          { name: '550', value: 550 },
          { name: '600', value: 600 },
          { name: '650', value: 650 }
        ]
      },
      {
        name: 'special',
        description: 'Special rules (default: None)',
        type: 3, // STRING
        required: false,
        choices: [
          { name: 'None', value: 'NONE' },
          { name: 'Screamer', value: 'SCREAMER' },
          { name: 'Assassin', value: 'ASSASSIN' }
        ]
      }
    ]
  },
  {
    name: 'mirror',
    description: 'Create a MIRROR league game line',
    options: [
      {
        name: 'mode',
        description: 'Game mode',
        type: 4, // INTEGER
        required: true,
        choices: [
          { name: 'Partners', value: 1 },
          { name: 'Solo', value: 2 }
        ]
      },
      {
        name: 'coins',
        description: 'Buy-in amount (Low: 100k-900k, High: 1M-10M)',
        type: 4, // INTEGER
        required: true,
        choices: [
          { name: '100k', value: 100000 },
          { name: '200k', value: 200000 },
          { name: '300k', value: 300000 },
          { name: '400k', value: 400000 },
          { name: '500k', value: 500000 },
          { name: '600k', value: 600000 },
          { name: '700k', value: 700000 },
          { name: '800k', value: 800000 },
          { name: '900k', value: 900000 },
          { name: '1M', value: 1000000 },
          { name: '2M', value: 2000000 },
          { name: '3M', value: 3000000 },
          { name: '4M', value: 4000000 },
          { name: '5M', value: 5000000 },
          { name: '6M', value: 6000000 },
          { name: '7M', value: 7000000 },
          { name: '8M', value: 8000000 },
          { name: '9M', value: 9000000 },
          { name: '10M', value: 10000000 }
        ]
      },
      {
        name: 'minpoints',
        description: 'Minimum points (default: -100)',
        type: 4, // INTEGER
        required: false,
        choices: [
          { name: '-250', value: -250 },
          { name: '-200', value: -200 },
          { name: '-150', value: -150 },
          { name: '-100', value: -100 }
        ]
      },
      {
        name: 'maxpoints',
        description: 'Maximum points (default: 500)',
        type: 4, // INTEGER
        required: false,
        choices: [
          { name: '100', value: 100 },
          { name: '150', value: 150 },
          { name: '200', value: 200 },
          { name: '250', value: 250 },
          { name: '300', value: 300 },
          { name: '350', value: 350 },
          { name: '400', value: 400 },
          { name: '450', value: 450 },
          { name: '500', value: 500 },
          { name: '550', value: 550 },
          { name: '600', value: 600 },
          { name: '650', value: 650 }
        ]
      },
      {
        name: 'special',
        description: 'Special rules (default: None)',
        type: 3, // STRING
        required: false,
        choices: [
          { name: 'None', value: 'NONE' },
          { name: 'Screamer', value: 'SCREAMER' },
          { name: 'Assassin', value: 'ASSASSIN' }
        ]
      }
    ]
  },
  {
    name: 'gimmick',
    description: 'Create a GIMMICK league game line',
    options: [
      {
        name: 'mode',
        description: 'Game mode',
        type: 4, // INTEGER
        required: true,
        choices: [
          { name: 'Partners', value: 1 },
          { name: 'Solo', value: 2 }
        ]
      },
      {
        name: 'coins',
        description: 'Buy-in amount (Low: 100k-900k, High: 1M-10M)',
        type: 4, // INTEGER
        required: true,
        choices: [
          { name: '100k', value: 100000 },
          { name: '200k', value: 200000 },
          { name: '300k', value: 300000 },
          { name: '400k', value: 400000 },
          { name: '500k', value: 500000 },
          { name: '600k', value: 600000 },
          { name: '700k', value: 700000 },
          { name: '800k', value: 800000 },
          { name: '900k', value: 900000 },
          { name: '1M', value: 1000000 },
          { name: '2M', value: 2000000 },
          { name: '3M', value: 3000000 },
          { name: '4M', value: 4000000 },
          { name: '5M', value: 5000000 },
          { name: '6M', value: 6000000 },
          { name: '7M', value: 7000000 },
          { name: '8M', value: 8000000 },
          { name: '9M', value: 9000000 },
          { name: '10M', value: 10000000 }
        ]
      },
      {
        name: 'gimmicktype',
        description: 'Gimmick variant',
        type: 3, // STRING
        required: true,
        choices: [
          { name: 'Suicide (Partners only)', value: 'SUICIDE' },
          { name: 'Bid 4 or Nil', value: 'BID4NIL' },
          { name: 'Bid 3', value: 'BID3' },
          { name: 'Bid Hearts', value: 'BIDHEARTS' },
          { name: 'Crazy Aces', value: 'CRAZY_ACES' },
          { name: 'Joker Whiz', value: 'JOKER' }
        ]
      },
      {
        name: 'minpoints',
        description: 'Minimum points (default: -100)',
        type: 4, // INTEGER
        required: false,
        choices: [
          { name: '-250', value: -250 },
          { name: '-200', value: -200 },
          { name: '-150', value: -150 },
          { name: '-100', value: -100 }
        ]
      },
      {
        name: 'maxpoints',
        description: 'Maximum points (default: 500)',
        type: 4, // INTEGER
        required: false,
        choices: [
          { name: '100', value: 100 },
          { name: '150', value: 150 },
          { name: '200', value: 200 },
          { name: '250', value: 250 },
          { name: '300', value: 300 },
          { name: '350', value: 350 },
          { name: '400', value: 400 },
          { name: '450', value: 450 },
          { name: '500', value: 500 },
          { name: '550', value: 550 },
          { name: '600', value: 600 },
          { name: '650', value: 650 }
        ]
      },
      {
        name: 'special',
        description: 'Special rules (default: None)',
        type: 3, // STRING
        required: false,
        choices: [
          { name: 'None', value: 'NONE' },
          { name: 'Screamer', value: 'SCREAMER' },
          { name: 'Assassin', value: 'ASSASSIN' }
        ]
      }
    ]
  },
  {
    name: 'regulartournament',
    description: 'Create a regular tournament',
    options: [
      {
        name: 'name',
        description: 'Tournament name',
        type: 3, // STRING
        required: true
      },
      {
        name: 'mode',
        description: 'Game mode',
        type: 4, // INTEGER
        required: true,
        choices: [
          { name: 'Partners', value: 1 },
          { name: 'Solo', value: 2 }
        ]
      },
      {
        name: 'coins',
        description: 'Buy-in amount',
        type: 4, // INTEGER
        required: true,
        choices: [
          { name: '100k', value: 100000 },
          { name: '200k', value: 200000 },
          { name: '300k', value: 300000 },
          { name: '400k', value: 400000 },
          { name: '500k', value: 500000 },
          { name: '600k', value: 600000 },
          { name: '700k', value: 700000 },
          { name: '800k', value: 800000 },
          { name: '900k', value: 900000 },
          { name: '1M', value: 1000000 },
          { name: '2M', value: 2000000 },
          { name: '3M', value: 3000000 },
          { name: '4M', value: 4000000 },
          { name: '5M', value: 5000000 },
          { name: '6M', value: 6000000 },
          { name: '7M', value: 7000000 },
          { name: '8M', value: 8000000 },
          { name: '9M', value: 9000000 },
          { name: '10M', value: 10000000 }
        ]
      },
      {
        name: 'starttime',
        description: 'Start time (Unix timestamp)',
        type: 4, // INTEGER
        required: true
      },
      {
        name: 'minpoints',
        description: 'Minimum points',
        type: 4, // INTEGER
        required: true
      },
      {
        name: 'maxpoints',
        description: 'Maximum points',
        type: 4, // INTEGER
        required: true
      },
      {
        name: 'nilallowed',
        description: 'Allow nil bids',
        type: 5, // BOOLEAN
        required: true
      },
      {
        name: 'blindnilallowed',
        description: 'Allow blind nil bids',
        type: 5, // BOOLEAN
        required: true
      }
    ]
  },
  {
    name: 'facebookhelp',
    description: 'Show Facebook connection help'
  },
  {
    name: 'postfacebookhelp',
    description: 'Post Facebook connection help in current channel'
  },
  {
    name: 'stats',
    description: 'Get league statistics for a user',
    options: [
      {
        name: 'user',
        description: 'User to get stats for (defaults to you)',
        type: 6, // USER
        required: false
      }
    ]
  },
  {
    name: 'leaderboard',
    description: 'Show league leaderboard',
    options: [
      {
        name: 'sort',
        description: 'Sort by',
        type: 3, // STRING
        required: false,
        choices: [
          { name: 'Games Played', value: 'gamesPlayed' },
          { name: 'Games Won', value: 'gamesWon' },
          { name: 'Win %', value: 'winRate' },
          { name: 'Nil Made %', value: 'nilMadeRate' },
          { name: 'Bags per Game', value: 'bagsPerGame' }
        ]
      }
    ]
  },
  {
    name: 'pay',
    description: 'Admin command: Pay coins to a user',
    options: [
      {
        name: 'user',
        description: 'User to pay coins to',
        type: 6, // USER
        required: true
      },
      {
        name: 'amount',
        description: 'Amount of coins to pay',
        type: 4, // INTEGER
        required: true,
        min_value: 1
      }
    ]
  }
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log('Started refreshing all commands...');

    await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
      { body: commands },
    );

    console.log('Successfully registered all commands!');
  } catch (error) {
    console.error(error);
  }
})();
