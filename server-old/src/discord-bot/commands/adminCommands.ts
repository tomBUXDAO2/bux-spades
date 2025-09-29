import { SlashCommandBuilder } from 'discord.js';

export const adminCommands = [
  new SlashCommandBuilder()
    .setName('checkfacebook')
    .setDescription('Check all members for Facebook connections and update LEAGUE roles')
    .setDefaultMemberPermissions(0x8), // Administrator permission

  new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Pay coins to a user')
    .setDefaultMemberPermissions(0x8) // Administrator permission
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to pay')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('coins')
        .setDescription('Amount of coins to pay')
        .setRequired(true)
        .setMinValue(1))
];
