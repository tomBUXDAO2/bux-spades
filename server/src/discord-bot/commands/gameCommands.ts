import { SlashCommandBuilder } from 'discord.js';
export const gameCommands = [
  new SlashCommandBuilder()
    .setName('game')
    .setDescription('Create a regular bidding game line')
    .addIntegerOption(option =>
      option.setName('coins')
        .setDescription('Coins (buy-in amount)')
        .setRequired(true)
        )
    .addStringOption(option =>
      option.setName('gamemode')
        .setDescription('Partners or Solo game')
        .setRequired(true)
        .addChoices(
          { name: 'Partners', value: 'partners' },
          { name: 'Solo', value: 'solo' }
        ))
    .addIntegerOption(option =>
      option.setName('maxpoints')
        .setDescription('Maximum points to win')
        .setRequired(true)
        .addChoices(
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
        ))
    .addIntegerOption(option =>
      option.setName('minpoints')
        .setDescription('Minimum points to lose')
        .setRequired(true)
        .addChoices(
          { name: '-100', value: -100 },
          { name: '-150', value: -150 },
          { name: '-200', value: -200 },
          { name: '-250', value: -250 }
        ))
    .addStringOption(option =>
      option.setName('nil')
        .setDescription('Allow nil bids')
        .setRequired(false)
        .addChoices(
          { name: 'Yes', value: 'yes' },
          { name: 'No', value: 'no' }
        ))
    .addStringOption(option =>
      option.setName('blindnil')
        .setDescription('Allow blind nil bids')
        .setRequired(false)
        .addChoices(
          { name: 'Yes', value: 'yes' },
          { name: 'No', value: 'no' }
        ))
    .addStringOption(option =>
      option.setName('specialrules')
        .setDescription('Special game rules')
        .setRequired(false)
        .addChoices(
          { name: 'None', value: 'none' },
          { name: 'Screamer', value: 'screamer' },
          { name: 'Assassin', value: 'assassin' }
        )),
  new SlashCommandBuilder()
    .setName('whiz')
    .setDescription('Create a Whiz game line')
    .addIntegerOption(option =>
      option.setName('coins')
        .setDescription('Coins (buy-in amount)')
        .setRequired(true)
        )
    .addStringOption(option =>
      option.setName('gamemode')
        .setDescription('Partners or Solo game')
        .setRequired(true)
        .addChoices(
          { name: 'Partners', value: 'partners' },
          { name: 'Solo', value: 'solo' }
        ))
    .addIntegerOption(option =>
      option.setName('maxpoints')
        .setDescription('Maximum points to win')
        .setRequired(true)
        .addChoices(
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
        ))
    .addIntegerOption(option =>
      option.setName('minpoints')
        .setDescription('Minimum points to lose')
        .setRequired(true)
        .addChoices(
          { name: '-100', value: -100 },
          { name: '-150', value: -150 },
          { name: '-200', value: -200 },
          { name: '-250', value: -250 }
        ))
    .addStringOption(option =>
      option.setName('specialrules')
        .setDescription('Special game rules')
        .setRequired(false)
        .addChoices(
          { name: 'None', value: 'none' },
          { name: 'Screamer', value: 'screamer' },
          { name: 'Assassin', value: 'assassin' }
        )),
  new SlashCommandBuilder()
    .setName('mirror')
    .setDescription('Create a Mirror game line')
    .addIntegerOption(option =>
      option.setName('coins')
        .setDescription('Coins (buy-in amount)')
        .setRequired(true)
        )
    .addStringOption(option =>
      option.setName('gamemode')
        .setDescription('Partners or Solo game')
        .setRequired(true)
        .addChoices(
          { name: 'Partners', value: 'partners' },
          { name: 'Solo', value: 'solo' }
        ))
    .addIntegerOption(option =>
      option.setName('maxpoints')
        .setDescription('Maximum points to win')
        .setRequired(true)
        .addChoices(
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
        ))
    .addIntegerOption(option =>
      option.setName('minpoints')
        .setDescription('Minimum points to lose')
        .setRequired(true)
        .addChoices(
          { name: '-100', value: -100 },
          { name: '-150', value: -150 },
          { name: '-200', value: -200 },
          { name: '-250', value: -250 }
        ))
    .addStringOption(option =>
      option.setName('specialrules')
        .setDescription('Special game rules')
        .setRequired(false)
        .addChoices(
          { name: 'None', value: 'none' },
          { name: 'Screamer', value: 'screamer' },
          { name: 'Assassin', value: 'assassin' }
        )),
  new SlashCommandBuilder()
    .setName('gimmick')
    .setDescription('Create a Gimmick game line')
    .addIntegerOption(option =>
      option.setName('coins')
        .setDescription('Coins (buy-in amount)')
        .setRequired(true)
        )
    .addStringOption(option =>
      option.setName('gamemode')
        .setDescription('Partners or Solo game')
        .setRequired(true)
        .addChoices(
          { name: 'Partners', value: 'partners' },
          { name: 'Solo', value: 'solo' }
        ))
    .addStringOption(option =>
      option.setName('gimmicktype')
        .setDescription('Type of gimmick game')
        .setRequired(true)
        .addChoices(
          { name: '4 or Nil', value: '4 OR NIL' },
          { name: 'Bid 3', value: 'BID 3' },
          { name: 'Bid Hearts', value: 'BID HEARTS' },
          { name: 'Crazy Aces', value: 'CRAZY ACES' },
          { name: 'Suicide', value: 'SUICIDE' }
        ))
    .addIntegerOption(option =>
      option.setName('maxpoints')
        .setDescription('Maximum points to win')
        .setRequired(true)
        .addChoices(
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
        ))
    .addIntegerOption(option =>
      option.setName('minpoints')
        .setDescription('Minimum points to lose')
        .setRequired(true)
        .addChoices(
          { name: '-100', value: -100 },
          { name: '-150', value: -150 },
          { name: '-200', value: -200 },
          { name: '-250', value: -250 }
        ))
    .addStringOption(option =>
      option.setName('specialrules')
        .setDescription('Special game rules')
        .setRequired(false)
        .addChoices(
          { name: 'None', value: 'none' },
          { name: 'Screamer', value: 'screamer' },
          { name: 'Assassin', value: 'assassin' }
        ))
];
