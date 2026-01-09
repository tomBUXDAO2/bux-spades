import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
// CONSOLIDATED: GameManager removed - using GameService directly
import { DetailedStatsService } from '../../services/DetailedStatsService.js';
import { prisma } from '../../config/databaseFirst.js';
import EventService from '../../services/EventService.js';
import EventFilterService from '../../services/EventFilterService.js';
import EventAnalyticsService from '../../services/EventAnalyticsService.js';

// Static assets
const THUMBNAIL_URL = process.env.PUBLIC_THUMBNAIL_URL || 'https://bux-spades.pro/optimized/bux-spades.png';

// Room IDs
const LOW_ROOM_ID = '1404937454938619927';
const HIGH_ROOM_ID = '1403844895445221445';
const EVENT_ROOM_ID = process.env.DISCORD_EVENT_GAMES_CHANNEL_ID || null;
const EVENT_ROLE_ID = process.env.DISCORD_EVENT_ROLE_ID || null;

const FORMAT_LABELS = {
  REGULAR: 'Regular',
  WHIZ: 'Whiz',
  MIRROR: 'Mirror',
  GIMMICK: 'Gimmick',
};

const MODE_CHOICES = [
  { name: 'Partners', value: 1, key: 'PARTNERS' },
  { name: 'Solo', value: 2, key: 'SOLO' },
];

const SPECIAL1_LABELS = {
  NONE: 'None',
  SCREAMER: 'Screamer',
  ASSASSIN: 'Assassin',
  SECRET_ASSASSIN: 'Secret Assassin',
};

const SPECIAL2_LABELS = {
  NONE: 'None',
  LOWBALL: 'Lowball',
  HIGHBALL: 'Highball',
};

const GIMMICK_LABELS = {
  SUICIDE: 'Suicide (Partners only)',
  BID4NIL: 'Bid 4 or Nil',
  BID3: 'Bid 3',
  BIDHEARTS: 'Bid Hearts',
  CRAZY_ACES: 'Crazy Aces',
  JOKER: 'Joker Whiz',
};

const DEFAULT_EVENT_COMMAND_CONFIG = {
  formatChoices: ['REGULAR', 'WHIZ', 'MIRROR', 'GIMMICK'].map((value) => ({
    name: FORMAT_LABELS[value] || value,
    value,
  })),
  modeChoices: MODE_CHOICES.map(({ name, value }) => ({ name, value })),
  coinChoices: [],
  coinMin: 10000,
  coinMax: 50000000,
  minPointChoices: [-250, -200, -150, -100].map((value) => ({ name: `${value}`, value })),
  maxPointChoices: [100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650].map((value) => ({
    name: `${value}`,
    value,
  })),
  special1Choices: Object.entries(SPECIAL1_LABELS).map(([value, name]) => ({ name, value })),
  special2Choices: Object.entries(SPECIAL2_LABELS).map(([value, name]) => ({ name, value })),
  nilChoices: [
    { name: 'On', value: 'true' },
    { name: 'Off', value: 'false' },
  ],
  blindNilChoices: [
    { name: 'On', value: 'true' },
    { name: 'Off', value: 'false' },
  ],
  gimmickChoices: Object.entries(GIMMICK_LABELS).map(([value, name]) => ({ name, value })),
};

function cloneChoices(list = []) {
  return list.map((choice) => ({ ...choice }));
}

function cloneEventCommandConfig(baseConfig = DEFAULT_EVENT_COMMAND_CONFIG) {
  return {
    formatChoices: cloneChoices(baseConfig.formatChoices),
    modeChoices: cloneChoices(baseConfig.modeChoices),
    coinChoices: cloneChoices(baseConfig.coinChoices),
    coinMin: baseConfig.coinMin,
    coinMax: baseConfig.coinMax,
    minPointChoices: cloneChoices(baseConfig.minPointChoices),
    maxPointChoices: cloneChoices(baseConfig.maxPointChoices),
    special1Choices: cloneChoices(baseConfig.special1Choices),
    special2Choices: cloneChoices(baseConfig.special2Choices),
    nilChoices: cloneChoices(baseConfig.nilChoices),
    blindNilChoices: cloneChoices(baseConfig.blindNilChoices),
    gimmickChoices: cloneChoices(baseConfig.gimmickChoices),
  };
}

function normalizeUpper(value) {
  if (typeof value === 'string') {
    return value.toUpperCase();
  }
  return value;
}

function uniqueNormalizedStrings(values = []) {
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    const normalized = normalizeUpper(value);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  });
  return result;
}

function extractNumberArray(value) {
  if (Array.isArray(value)) {
    const seen = new Set();
    const result = [];
    value.forEach((entry) => {
      const numberValue = Number(entry);
      if (Number.isFinite(numberValue) && !seen.has(numberValue)) {
        seen.add(numberValue);
        result.push(numberValue);
      }
    });
    return result;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return [numeric];
  }

  return [];
}

function formatCoinLabel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }
  if (numeric >= 1000000) {
    const millions = numeric / 1000000;
    return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
  }
  if (numeric >= 1000) {
    const thousands = numeric / 1000;
    return thousands % 1 === 0 ? `${thousands}k` : `${thousands.toFixed(1)}k`;
  }
  return `${numeric}`;
}

function buildModeChoices(modeValues = []) {
  const normalized = uniqueNormalizedStrings(modeValues);
  if (!normalized.length) {
    return cloneChoices(DEFAULT_EVENT_COMMAND_CONFIG.modeChoices);
  }

  const modeMap = new Map(MODE_CHOICES.map(({ key, name, value }) => [key, { name, value }]));
  const choices = normalized
    .map((mode) => modeMap.get(mode))
    .filter(Boolean);

  return choices.length ? choices : cloneChoices(DEFAULT_EVENT_COMMAND_CONFIG.modeChoices);
}

function firstNonEmptyArray(...arrays) {
  for (const array of arrays) {
    if (Array.isArray(array) && array.length) {
      return array;
    }
  }
  return [];
}

function buildLabeledChoices(values = [], labelLookup = {}) {
  const normalized = uniqueNormalizedStrings(values);
  if (!normalized.length) {
    return [];
  }
  return normalized.map((value) => ({
    name: labelLookup[value] || value,
    value,
  }));
}

function buildCoinChoicesFromRange(min, max, step) {
  const numericMin = Number(min);
  const numericMax = Number(max);
  let numericStep = Number(step);

  if (!Number.isFinite(numericMin) || !Number.isFinite(numericMax) || numericMin <= 0 || numericMax < numericMin) {
    return [];
  }

  if (numericMin === numericMax) {
    return [
      {
        name: formatCoinLabel(numericMin),
        value: numericMin,
      },
    ];
  }

  if (!Number.isFinite(numericStep) || numericStep <= 0) {
    if (numericMax <= 1_000_000) {
      numericStep = 50_000;
    } else {
      numericStep = 500_000;
    }
  }

  const values = [];
  for (let value = numericMin; value <= numericMax; value += numericStep) {
    if (values.length >= 25) {
      break;
    }
    values.push(Math.round(value));
  }

  return values.map((value) => ({
    name: formatCoinLabel(value),
    value,
  }));
}

async function loadEventCommandConfig() {
  const config = cloneEventCommandConfig();

  try {
    const event = await EventService.getActiveEvent({ includeCriteria: false });
    if (!event) {
      return config;
    }

    const filters = event.filters || {};

    const formatList = uniqueNormalizedStrings(filters.allowedFormats || filters.formats);
    if (formatList.length) {
      config.formatChoices = formatList
        .slice(0, 25)
        .map((format) => ({ name: FORMAT_LABELS[format] || format, value: format }));
    } else if (typeof filters.defaultFormat === 'string') {
      const format = normalizeUpper(filters.defaultFormat);
      config.formatChoices = [{ name: FORMAT_LABELS[format] || format, value: format }];
    }

    const modeChoices = buildModeChoices(filters.allowedModes || filters.modes);
    if (modeChoices.length) {
      config.modeChoices = modeChoices.slice(0, 25);
    } else if (typeof filters.defaultMode === 'string') {
      const defaultMode = buildModeChoices([filters.defaultMode]);
      if (defaultMode.length) {
        config.modeChoices = defaultMode.slice(0, 25);
      }
    }

    const coinList = extractNumberArray(filters.coins);
    if (coinList.length) {
      const sorted = Array.from(new Set(coinList)).sort((a, b) => a - b).slice(0, 25);
      config.coinChoices = sorted.map((value) => ({
        name: formatCoinLabel(value),
        value,
      }));
      config.coinMin = sorted[0];
      config.coinMax = sorted[sorted.length - 1];
    } else if (filters.coinRange) {
      const { min, max, step } = filters.coinRange;
      const choices = buildCoinChoicesFromRange(min, max, step);
      if (choices.length) {
        config.coinChoices = choices;
      }
      if (Number.isFinite(Number(min))) {
        config.coinMin = Number(min);
      }
      if (Number.isFinite(Number(max))) {
        config.coinMax = Number(max);
      }
    } else if (typeof filters.defaultCoins === 'number' && Number.isFinite(filters.defaultCoins)) {
      const value = Number(filters.defaultCoins);
      config.coinChoices = [{ name: formatCoinLabel(value), value }];
      config.coinMin = value;
      config.coinMax = value;
    }

    const minPointsList = firstNonEmptyArray(
      extractNumberArray(filters.allowedMinPoints),
      extractNumberArray(filters.minPoints),
      extractNumberArray(filters.pointsRange?.min),
    );

    if (minPointsList.length) {
      const sortedMin = Array.from(new Set(minPointsList)).sort((a, b) => a - b).slice(0, 25);
      config.minPointChoices = sortedMin.map((value) => ({ name: `${value}`, value }));
    }

    const maxPointsList = firstNonEmptyArray(
      extractNumberArray(filters.allowedMaxPoints),
      extractNumberArray(filters.maxPoints),
      extractNumberArray(filters.pointsRange?.max),
    );

    if (maxPointsList.length) {
      const sortedMax = Array.from(new Set(maxPointsList)).sort((a, b) => a - b).slice(0, 25);
      config.maxPointChoices = sortedMax.map((value) => ({ name: `${value}`, value }));
    }

    const special1Choices = buildLabeledChoices(
      filters.allowedSpecialRule1 || filters.specialRule1,
      SPECIAL1_LABELS,
    );
    if (special1Choices.length) {
      config.special1Choices = special1Choices.slice(0, 25);
    }

    const special2Choices = buildLabeledChoices(
      filters.allowedSpecialRule2 || filters.specialRule2,
      SPECIAL2_LABELS,
    );
    if (special2Choices.length) {
      config.special2Choices = special2Choices.slice(0, 25);
    }

    if (typeof filters.nilAllowed === 'boolean') {
      config.nilChoices = [
        {
          name: filters.nilAllowed ? 'On' : 'Off',
          value: filters.nilAllowed ? 'true' : 'false',
        },
      ];
    }

    if (typeof filters.defaultNilAllowed === 'boolean' && !filters.nilAllowed) {
      config.nilChoices = [
        {
          name: filters.defaultNilAllowed ? 'On' : 'Off',
          value: filters.defaultNilAllowed ? 'true' : 'false',
        },
      ];
    }

    if (typeof filters.blindNilAllowed === 'boolean') {
      config.blindNilChoices = [
        {
          name: filters.blindNilAllowed ? 'On' : 'Off',
          value: filters.blindNilAllowed ? 'true' : 'false',
        },
      ];
    }

    if (typeof filters.defaultBlindNilAllowed === 'boolean' && !filters.blindNilAllowed) {
      config.blindNilChoices = [
        {
          name: filters.defaultBlindNilAllowed ? 'On' : 'Off',
          value: filters.defaultBlindNilAllowed ? 'true' : 'false',
        },
      ];
    }

    const gimmickChoices = buildLabeledChoices(
      filters.allowedGimmickVariants || filters.gimmickVariants,
      GIMMICK_LABELS,
    );
    if (gimmickChoices.length) {
      config.gimmickChoices = gimmickChoices.slice(0, 25);
    } else if (typeof filters.defaultGimmickVariant === 'string') {
      const variant = normalizeUpper(filters.defaultGimmickVariant);
      config.gimmickChoices = [
        {
          name: GIMMICK_LABELS[variant] || variant,
          value: variant,
        },
      ];
    }
  } catch (error) {
    console.error('[DISCORD] Failed to load event command configuration:', error);
    return config;
  }

  return config;
}

function buildEventCommandBuilder(config) {
  const builder = new SlashCommandBuilder()
    .setName('event')
    .setDescription('Create a game line for the active event');

  if (config.formatChoices.length > 1) {
    builder.addStringOption((option) =>
      option
        .setName('format')
        .setDescription('Game format (defaults to event settings)')
        .setRequired(false)
        .addChoices(...config.formatChoices.slice(0, 25)),
    );
  }

  if (config.modeChoices.length > 1) {
    builder.addIntegerOption((option) =>
      option
        .setName('mode')
        .setDescription('Game mode (defaults to event settings)')
        .setRequired(false)
        .addChoices(...config.modeChoices.slice(0, 25)),
    );
  }

  builder.addIntegerOption((option) => {
    option
      .setName('coins')
      .setDescription('Buy-in amount (defaults to event settings)')
      .setRequired(false)
      .setMinValue(config.coinMin)
      .setMaxValue(config.coinMax);

    if (config.coinChoices.length) {
      option.addChoices(...config.coinChoices.slice(0, 25));
      if (config.coinChoices.length === 1) {
        option.setMinValue(config.coinChoices[0].value);
        option.setMaxValue(config.coinChoices[0].value);
      }
    }

    return option;
  });

  if (config.minPointChoices.length > 1) {
    builder.addIntegerOption((option) =>
      option
        .setName('minpoints')
        .setDescription('Minimum points (defaults to event settings)')
        .setRequired(false)
        .addChoices(...config.minPointChoices.slice(0, 25)),
    );
  } else if (config.minPointChoices.length === 1) {
    builder.addIntegerOption((option) =>
      option
        .setName('minpoints')
        .setDescription('Minimum points (defaults to event settings)')
        .setRequired(false)
        .addChoices(config.minPointChoices[0]),
    );
  }

  if (config.maxPointChoices.length > 1) {
    builder.addIntegerOption((option) =>
      option
        .setName('maxpoints')
        .setDescription('Maximum points (defaults to event settings)')
        .setRequired(false)
        .addChoices(...config.maxPointChoices.slice(0, 25)),
    );
  } else if (config.maxPointChoices.length === 1) {
    builder.addIntegerOption((option) =>
      option
        .setName('maxpoints')
        .setDescription('Maximum points (defaults to event settings)')
        .setRequired(false)
        .addChoices(config.maxPointChoices[0]),
    );
  }

  if (config.special1Choices.length > 1) {
    builder.addStringOption((option) =>
      option
        .setName('special1')
        .setDescription('Special rule 1 (defaults to event settings)')
        .setRequired(false)
        .addChoices(...config.special1Choices.slice(0, 25)),
    );
  } else if (config.special1Choices.length === 1) {
    builder.addStringOption((option) =>
      option
        .setName('special1')
        .setDescription('Special rule 1 (defaults to event settings)')
        .setRequired(false)
        .addChoices(config.special1Choices[0]),
    );
  }

  if (config.special2Choices.length > 1) {
    builder.addStringOption((option) =>
      option
        .setName('special2')
        .setDescription('Special rule 2 (defaults to event settings)')
        .setRequired(false)
        .addChoices(...config.special2Choices.slice(0, 25)),
    );
  } else if (config.special2Choices.length === 1) {
    builder.addStringOption((option) =>
      option
        .setName('special2')
        .setDescription('Special rule 2 (defaults to event settings)')
        .setRequired(false)
        .addChoices(config.special2Choices[0]),
    );
  }

  if (config.gimmickChoices.length > 1) {
    builder.addStringOption((option) =>
      option
        .setName('gimmicktype')
        .setDescription('Gimmick variant (required if format is GIMMICK)')
        .setRequired(false)
        .addChoices(...config.gimmickChoices.slice(0, 25)),
    );
  } else if (config.gimmickChoices.length === 1) {
    builder.addStringOption((option) =>
      option
        .setName('gimmicktype')
        .setDescription('Gimmick variant (required if format is GIMMICK)')
        .setRequired(false)
        .addChoices(config.gimmickChoices[0]),
    );
  }

  if (config.nilChoices.length > 1) {
    builder.addStringOption((option) =>
      option
        .setName('nil')
        .setDescription('Allow Nil bids (default depends on event)')
        .setRequired(false)
        .addChoices(...config.nilChoices.slice(0, 25)),
    );
  } else if (config.nilChoices.length === 1) {
    builder.addStringOption((option) =>
      option
        .setName('nil')
        .setDescription('Allow Nil bids (default depends on event)')
        .setRequired(false)
        .addChoices(config.nilChoices[0]),
    );
  }

  if (config.blindNilChoices.length > 1) {
    builder.addStringOption((option) =>
      option
        .setName('blindnil')
        .setDescription('Allow Blind Nil bids (default depends on event)')
        .setRequired(false)
        .addChoices(...config.blindNilChoices.slice(0, 25)),
    );
  } else if (config.blindNilChoices.length === 1) {
    builder.addStringOption((option) =>
      option
        .setName('blindnil')
        .setDescription('Allow Blind Nil bids (default depends on event)')
        .setRequired(false)
        .addChoices(config.blindNilChoices[0]),
    );
  }

  return builder;
}

let eventCommandConfig = cloneEventCommandConfig();
try {
  eventCommandConfig = await loadEventCommandConfig();
} catch (error) {
  console.error('[DISCORD] Event command configuration fallback triggered:', error);
  eventCommandConfig = cloneEventCommandConfig();
}

// In-memory storage for game lines (before table creation)
const gameLines = new Map();

async function createEventGameLine(interaction) {
  try {
    await interaction.deferReply();

    if (EVENT_ROOM_ID && interaction.channel?.id !== EVENT_ROOM_ID) {
      await interaction.editReply({
        content: `❌ Event games can only be created in <#${EVENT_ROOM_ID}>.`,
      });
      return;
    }

    const event = await EventService.getActiveEvent({ includeCriteria: true });
    if (!event || (event.status !== 'ACTIVE' && event.status !== 'SCHEDULED')) {
      await interaction.editReply({
      content: '❌ No events currently running, please try again later.',
      });
      return;
    }

    const now = Date.now();
    const startsAt = new Date(event.startsAt || now).getTime();
    if (event.status === 'SCHEDULED' && now < startsAt) {
      await interaction.editReply({
        content: `❌ **${event.name}** has not started yet. Start time: <t:${Math.floor(startsAt / 1000)}:F>.`,
      });
      return;
    }

    const filters = event.filters || {};

    let format = interaction.options.getString('format');
    if (format) {
      format = format.toUpperCase();
    } else if (Array.isArray(filters.allowedFormats) && filters.allowedFormats.length === 1) {
      format = String(filters.allowedFormats[0]).toUpperCase();
    } else if (typeof filters.defaultFormat === 'string') {
      format = filters.defaultFormat.toUpperCase();
    } else {
      format = 'REGULAR';
    }

    const modeOption = interaction.options.getInteger('mode');
    let mode = modeOption !== null && modeOption !== undefined ? (modeOption === 1 ? 'PARTNERS' : 'SOLO') : null;
    if (!mode) {
      if (Array.isArray(filters.allowedModes) && filters.allowedModes.length === 1) {
        mode = String(filters.allowedModes[0]).toUpperCase();
      } else if (typeof filters.defaultMode === 'string') {
        mode = filters.defaultMode.toUpperCase();
      } else {
        mode = 'PARTNERS';
      }
    }

    let coins = interaction.options.getInteger('coins');
    if (coins === null || coins === undefined) {
      if (Array.isArray(filters.allowedCoins) && filters.allowedCoins.length === 1) {
        coins = Number(filters.allowedCoins[0]);
      } else if (filters.coinRange && typeof filters.coinRange.default === 'number') {
        coins = Number(filters.coinRange.default);
      } else if (typeof filters.defaultCoins === 'number') {
        coins = Number(filters.defaultCoins);
      }
    }

    if (coins === null || coins === undefined || Number.isNaN(coins) || coins <= 0) {
      await interaction.editReply({
        content: '❌ Please specify a valid coin amount for this event.',
      });
      return;
    }

    let minPoints = interaction.options.getInteger('minpoints');
    if (minPoints === null || minPoints === undefined) {
      if (typeof filters.minPoints === 'number') {
        minPoints = filters.minPoints;
      } else if (filters.pointsRange && typeof filters.pointsRange.min === 'number') {
        minPoints = filters.pointsRange.min;
      } else if (typeof filters.defaultMinPoints === 'number') {
        minPoints = filters.defaultMinPoints;
      } else {
        minPoints = -100;
      }
    }

    let maxPoints = interaction.options.getInteger('maxpoints');
    if (maxPoints === null || maxPoints === undefined) {
      if (typeof filters.maxPoints === 'number') {
        maxPoints = filters.maxPoints;
      } else if (filters.pointsRange && typeof filters.pointsRange.max === 'number') {
        maxPoints = filters.pointsRange.max;
      } else if (typeof filters.defaultMaxPoints === 'number') {
        maxPoints = filters.defaultMaxPoints;
      } else {
        maxPoints = 500;
      }
    }

    let specialRule1 = interaction.options.getString('special1');
    specialRule1 = specialRule1 ? specialRule1.toUpperCase() : null;
    if (!specialRule1) {
      if (typeof filters.defaultSpecialRule1 === 'string') {
        specialRule1 = filters.defaultSpecialRule1.toUpperCase();
      } else if (typeof filters.specialRule1 === 'string') {
        specialRule1 = filters.specialRule1.toUpperCase();
      } else {
        specialRule1 = 'NONE';
      }
    }

    let specialRule2 = interaction.options.getString('special2');
    specialRule2 = specialRule2 ? specialRule2.toUpperCase() : null;
    if (!specialRule2) {
      if (typeof filters.defaultSpecialRule2 === 'string') {
        specialRule2 = filters.defaultSpecialRule2.toUpperCase();
      } else if (typeof filters.specialRule2 === 'string') {
        specialRule2 = filters.specialRule2.toUpperCase();
      } else {
        specialRule2 = 'NONE';
      }
    }

    let nilOption = interaction.options.getString('nil');
    let nilAllowed = nilOption !== null && nilOption !== undefined ? nilOption !== 'false' : null;
    if (nilAllowed === null) {
      if (typeof filters.nilAllowed === 'boolean') {
        nilAllowed = filters.nilAllowed;
      } else if (typeof filters.defaultNilAllowed === 'boolean') {
        nilAllowed = filters.defaultNilAllowed;
      } else {
        nilAllowed = true;
      }
    }

    let blindNilOption = interaction.options.getString('blindnil');
    let blindNilAllowed = blindNilOption !== null && blindNilOption !== undefined ? blindNilOption === 'true' : null;
    if (blindNilAllowed === null) {
      if (typeof filters.blindNilAllowed === 'boolean') {
        blindNilAllowed = filters.blindNilAllowed;
      } else if (typeof filters.defaultBlindNilAllowed === 'boolean') {
        blindNilAllowed = filters.defaultBlindNilAllowed;
      } else {
        blindNilAllowed = false;
      }
    }

    let gimmickVariant = null;
    if (format === 'GIMMICK') {
      gimmickVariant = interaction.options.getString('gimmicktype');
      if (!gimmickVariant && Array.isArray(filters.allowedGimmickVariants) && filters.allowedGimmickVariants.length === 1) {
        gimmickVariant = String(filters.allowedGimmickVariants[0]);
      }
      if (!gimmickVariant && typeof filters.defaultGimmickVariant === 'string') {
        gimmickVariant = filters.defaultGimmickVariant;
      }
      if (gimmickVariant) {
        gimmickVariant = gimmickVariant.toUpperCase();
      }
    }

    const userValidation = await validateUserForGame(interaction.user.id, coins);
    if (!userValidation.valid) {
      await interaction.editReply({
        content: userValidation.message,
      });
      return;
    }

    const validation = EventFilterService.evaluate(filters, {
      channelId: interaction.channel?.id || null,
      coins,
      format,
      mode,
      minPoints,
      maxPoints,
      specialRule1,
      specialRule2,
      nilAllowed,
      blindNilAllowed,
      gimmickVariant,
    });

    if (!validation.allowed) {
      await interaction.editReply({
        content: `❌ ${validation.reason}`,
      });
      return;
    }

    if (format === 'GIMMICK' && !gimmickVariant) {
      await interaction.editReply({
        content: '❌ You must select a gimmick variant for this event game.',
      });
      return;
    }

    if (gimmickVariant === 'SUICIDE' && mode !== 'PARTNERS') {
      await interaction.editReply({
        content: '❌ Suicide variant is only available in Partners mode.',
      });
      return;
    }

    const gameLineId = `line_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const gameLine = {
      id: gameLineId,
      channelId: interaction.channel?.id || null,
      messageId: null,
      createdBy: interaction.user.id,
      createdAt: new Date(),
      eventId: event.id,
      eventName: event.name,
      settings: {
        coins,
        mode,
        format,
        minPoints,
        maxPoints,
        gimmickVariant,
        specialRule1,
        specialRule2,
        nilAllowed,
        blindNilAllowed,
      },
      players: [
        { discordId: interaction.user.id, username: interaction.user.username, seat: 0 },
      ],
    };

    gameLines.set(gameLineId, gameLine);

    const embed = createGameLineEmbed(gameLine);
    const buttons = createGameLineButtons(gameLineId, false);

    const mentionMessage = EVENT_ROLE_ID
      ? `<@&${EVENT_ROLE_ID}>`
      : `🏆 **${event.name}** event game line created!`;

    const response = await interaction.editReply({
      content: mentionMessage,
      embeds: [embed],
      components: [buttons],
      allowedMentions: EVENT_ROLE_ID ? { roles: [EVENT_ROLE_ID] } : { parse: [] },
    });

    gameLine.messageId = response.id;
    gameLines.set(gameLineId, gameLine);

    console.log(`[DISCORD] Event game line created: ${gameLineId} (event ${event.id})`);
  } catch (error) {
    console.error('[DISCORD] Error creating event game line:', error);
    if (interaction.deferred) {
      await interaction.editReply({
        content: '❌ Failed to create event game line. Please try again.',
      });
    } else {
      await interaction.reply({
        content: '❌ Failed to create event game line. Please try again.',
        ephemeral: true,
      });
    }
  }
}

async function showEventStats(interaction) {
  try {
    await interaction.deferReply({ ephemeral: false });

    let event = await EventService.getActiveEvent({
      includeCriteria: true,
      includeStats: true,
      includeGames: true,
    });

    if (!event) {
      const upcoming = await EventService.listEvents({
        status: ['SCHEDULED'],
        includeCriteria: true,
        includeStats: false,
        limit: 1,
        orderBy: { startsAt: 'asc' },
      });

      if (!upcoming.length) {
        await interaction.editReply({
          content: 'ℹ️ There is no active or scheduled event at the moment.',
        });
        return;
      }

      const upcomingEmbed = await EventAnalyticsService.buildEventStartEmbed(upcoming[0]);
      await interaction.editReply({ embeds: [upcomingEmbed] });
      return;
    }

    const progressEmbed = await EventAnalyticsService.buildEventProgressEmbed(event);
    await interaction.editReply({ embeds: [progressEmbed] });
  } catch (error) {
    console.error('[DISCORD] Error fetching event stats:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: '❌ Failed to retrieve event stats. Please try again later.',
      });
    } else {
      await interaction.reply({
        content: '❌ Failed to retrieve event stats. Please try again later.',
        ephemeral: true,
      });
    }
  }
}

// Command registry
export const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('game')
      .setDescription('Create a REGULAR league game line')
      .addIntegerOption(option =>
        option.setName('mode')
          .setDescription('Game mode')
          .setRequired(true)
          .addChoices(
            { name: 'Partners', value: 1 },
            { name: 'Solo', value: 2 }
          )
      )
      .addIntegerOption(option =>
        option.setName('coins')
          .setDescription('Buy-in amount (Low: 100k-900k, High: 1M-10M)')
          .setRequired(true)
          .addChoices(
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
          )
      )
      .addIntegerOption(option =>
        option.setName('minpoints')
          .setDescription('Minimum points (default: -100)')
          .setRequired(false)
          .addChoices(
            { name: '-250', value: -250 },
            { name: '-200', value: -200 },
            { name: '-150', value: -150 },
            { name: '-100', value: -100 }
          )
      )
      .addIntegerOption(option =>
        option.setName('maxpoints')
          .setDescription('Maximum points (default: 500)')
          .setRequired(false)
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
          )
      )
      .addStringOption(option =>
        option.setName('special1')
          .setDescription('Special rule 1 (default: None)')
          .setRequired(false)
          .addChoices(
            { name: 'None', value: 'NONE' },
            { name: 'Screamer', value: 'SCREAMER' },
            { name: 'Assassin', value: 'ASSASSIN' },
            { name: 'Secret Assassin', value: 'SECRET_ASSASSIN' }
          )
      )
      .addStringOption(option =>
        option.setName('special2')
          .setDescription('Special rule 2 (default: None)')
          .setRequired(false)
          .addChoices(
            { name: 'None', value: 'NONE' },
            { name: 'Lowball', value: 'LOWBALL' },
            { name: 'Highball', value: 'HIGHBALL' }
          )
      )
      .addStringOption(option =>
        option.setName('nil')
          .setDescription('Allow Nil bids (default: On)')
          .setRequired(false)
          .addChoices(
            { name: 'On', value: 'true' },
            { name: 'Off', value: 'false' }
          )
      )
      .addStringOption(option =>
        option.setName('blindnil')
          .setDescription('Allow Blind Nil bids (default: Off)')
          .setRequired(false)
          .addChoices(
            { name: 'On', value: 'true' },
            { name: 'Off', value: 'false' }
          )
      ),
    execute: (interaction) => createGameLine(interaction, 'REGULAR')
  },
  {
    data: new SlashCommandBuilder()
      .setName('whiz')
      .setDescription('Create a WHIZ league game line')
      .addIntegerOption(option =>
        option.setName('mode')
          .setDescription('Game mode')
          .setRequired(true)
          .addChoices(
            { name: 'Partners', value: 1 },
            { name: 'Solo', value: 2 }
          )
      )
      .addIntegerOption(option =>
        option.setName('coins')
          .setDescription('Buy-in amount (Low: 100k-900k, High: 1M-10M)')
          .setRequired(true)
          .addChoices(
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
          )
      )
      .addIntegerOption(option =>
        option.setName('minpoints')
          .setDescription('Minimum points (default: -100)')
          .setRequired(false)
          .addChoices(
            { name: '-250', value: -250 },
            { name: '-200', value: -200 },
            { name: '-150', value: -150 },
            { name: '-100', value: -100 }
          )
      )
      .addIntegerOption(option =>
        option.setName('maxpoints')
          .setDescription('Maximum points (default: 500)')
          .setRequired(false)
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
          )
      )
      .addStringOption(option =>
        option.setName('special1')
          .setDescription('Special rule 1 (default: None)')
          .setRequired(false)
          .addChoices(
            { name: 'None', value: 'NONE' },
            { name: 'Screamer', value: 'SCREAMER' },
            { name: 'Assassin', value: 'ASSASSIN' },
            { name: 'Secret Assassin', value: 'SECRET_ASSASSIN' }
          )
      )
      .addStringOption(option =>
        option.setName('special2')
          .setDescription('Special rule 2 (default: None)')
          .setRequired(false)
          .addChoices(
            { name: 'None', value: 'NONE' },
            { name: 'Lowball', value: 'LOWBALL' },
            { name: 'Highball', value: 'HIGHBALL' }
          )
      ),
    execute: (interaction) => createGameLine(interaction, 'WHIZ')
  },
  {
    data: new SlashCommandBuilder()
      .setName('mirror')
      .setDescription('Create a MIRROR league game line')
      .addIntegerOption(option =>
        option.setName('mode')
          .setDescription('Game mode')
          .setRequired(true)
          .addChoices(
            { name: 'Partners', value: 1 },
            { name: 'Solo', value: 2 }
          )
      )
      .addIntegerOption(option =>
        option.setName('coins')
          .setDescription('Buy-in amount (Low: 100k-900k, High: 1M-10M)')
          .setRequired(true)
          .addChoices(
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
          )
      )
      .addIntegerOption(option =>
        option.setName('minpoints')
          .setDescription('Minimum points (default: -100)')
          .setRequired(false)
          .addChoices(
            { name: '-250', value: -250 },
            { name: '-200', value: -200 },
            { name: '-150', value: -150 },
            { name: '-100', value: -100 }
          )
      )
      .addIntegerOption(option =>
        option.setName('maxpoints')
          .setDescription('Maximum points (default: 500)')
          .setRequired(false)
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
          )
      )
      .addStringOption(option =>
        option.setName('special1')
          .setDescription('Special rule 1 (default: None)')
          .setRequired(false)
          .addChoices(
            { name: 'None', value: 'NONE' },
            { name: 'Screamer', value: 'SCREAMER' },
            { name: 'Assassin', value: 'ASSASSIN' },
            { name: 'Secret Assassin', value: 'SECRET_ASSASSIN' }
          )
      )
      .addStringOption(option =>
        option.setName('special2')
          .setDescription('Special rule 2 (default: None)')
          .setRequired(false)
          .addChoices(
            { name: 'None', value: 'NONE' },
            { name: 'Lowball', value: 'LOWBALL' },
            { name: 'Highball', value: 'HIGHBALL' }
          )
      ),
    execute: (interaction) => createGameLine(interaction, 'MIRROR')
  },
  {
    data: new SlashCommandBuilder()
      .setName('gimmick')
      .setDescription('Create a GIMMICK league game line')
      .addIntegerOption(option =>
        option.setName('mode')
          .setDescription('Game mode')
          .setRequired(true)
          .addChoices(
            { name: 'Partners', value: 1 },
            { name: 'Solo', value: 2 }
          )
      )
      .addIntegerOption(option =>
        option.setName('coins')
          .setDescription('Buy-in amount (Low: 100k-900k, High: 1M-10M)')
          .setRequired(true)
          .addChoices(
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
          )
      )
      .addStringOption(option =>
        option.setName('gimmicktype')
          .setDescription('Gimmick variant')
          .setRequired(true)
          .addChoices(
            { name: 'Suicide (Partners only)', value: 'SUICIDE' },
            { name: 'Bid 4 or Nil', value: 'BID4NIL' },
            { name: 'Bid 3', value: 'BID3' },
            { name: 'Bid Hearts', value: 'BIDHEARTS' },
            { name: 'Crazy Aces', value: 'CRAZY_ACES' },
            { name: 'Joker Whiz', value: 'JOKER' }
          )
      )
      .addIntegerOption(option =>
        option.setName('minpoints')
          .setDescription('Minimum points (default: -100)')
          .setRequired(false)
          .addChoices(
            { name: '-250', value: -250 },
            { name: '-200', value: -200 },
            { name: '-150', value: -150 },
            { name: '-100', value: -100 }
          )
      )
      .addIntegerOption(option =>
        option.setName('maxpoints')
          .setDescription('Maximum points (default: 500)')
          .setRequired(false)
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
          )
      )
      .addStringOption(option =>
        option.setName('special1')
          .setDescription('Special rule 1 (default: None)')
          .setRequired(false)
          .addChoices(
            { name: 'None', value: 'NONE' },
            { name: 'Screamer', value: 'SCREAMER' },
            { name: 'Assassin', value: 'ASSASSIN' },
            { name: 'Secret Assassin', value: 'SECRET_ASSASSIN' }
          )
      )
      .addStringOption(option =>
        option.setName('special2')
          .setDescription('Special rule 2 (default: None)')
          .setRequired(false)
          .addChoices(
            { name: 'None', value: 'NONE' },
            { name: 'Lowball', value: 'LOWBALL' },
            { name: 'Highball', value: 'HIGHBALL' }
          )
      ),
    execute: (interaction) => createGameLine(interaction, 'GIMMICK')
  },
  {
    data: buildEventCommandBuilder(eventCommandConfig),
    execute: (interaction) => createEventGameLine(interaction)
  },
  {
    data: new SlashCommandBuilder()
      .setName('eventstats')
      .setDescription('Show the current event standings and progress'),
    execute: (interaction) => showEventStats(interaction)
  },
  {
    data: new SlashCommandBuilder()
      .setName('facebookhelp')
      .setDescription('Post Facebook connection instructions'),
    execute: async (interaction) => {
      const embed = new EmbedBuilder()
        .setTitle('🔗 How to Get the LEAGUE Role')
        .setDescription(
          '**To access league game rooms, you need the LEAGUE role!**\n\n' +
          '**Step 1: Connect Facebook**\n' +
          '1️⃣ Go to **User Settings** (gear icon) in Discord\n' +
          '2️⃣ Click **Connections** in the left sidebar\n' +
          '3️⃣ Click **Connect** next to Facebook\n' +
          '4️⃣ Log in to your Facebook account and authorize Discord\n\n' +
          '**Step 2: Enable Profile Display**\n' +
          '1️⃣ After connecting, make sure **"Display on profile"** is **ON** ✅\n' +
          '2️⃣ This allows others to see your Facebook name on your Discord profile\n\n' +
          '**Step 3: Get the LEAGUE Role**\n' +
          '1️⃣ Go to **Server Settings** (right-click server name)\n' +
          '2️⃣ Click **Linked Roles** in the left sidebar\n' +
          '3️⃣ Click **Connect** next to the LEAGUE role requirement\n' +
          '4️⃣ If you have Facebook connected with "Display on profile" enabled, you\'ll automatically get the role!\n\n' +
          '**✅ You\'re all set!** You now have access to league game rooms and can use `/game`, `/whiz`, `/mirror`, and `/gimmick` commands!'
        )
        .setColor(0x0099ff)
        .setTimestamp()
        .setFooter({ text: 'Need help? Contact a moderator!' });

      await interaction.reply({
        embeds: [embed]
      });
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('postfacebookhelp')
      .setDescription('Post Facebook instructions to the help channel (Admin only)'),
    execute: async (interaction) => {
      // Check if user is admin
      const adminIds = process.env.DISCORD_ADMIN_IDS?.split(',') || [];
      if (!adminIds.includes(interaction.user.id)) {
        await interaction.reply({
          content: '❌ This command is only available to administrators.',
          ephemeral: true
        });
        return;
      }

      const helpChannelId = '1403960351107715073';
      
      const embed = new EmbedBuilder()
        .setTitle('🔗 How to Get the LEAGUE Role')
        .setDescription(
          '**To access league game rooms, you need the LEAGUE role!**\n\n' +
          '**Step 1: Connect Facebook**\n' +
          '1️⃣ Go to **User Settings** (gear icon) in Discord\n' +
          '2️⃣ Click **Connections** in the left sidebar\n' +
          '3️⃣ Click **Connect** next to Facebook\n' +
          '4️⃣ Log in to your Facebook account and authorize Discord\n\n' +
          '**Step 2: Enable Profile Display**\n' +
          '1️⃣ After connecting, make sure **"Display on profile"** is **ON** ✅\n' +
          '2️⃣ This allows others to see your Facebook name on your Discord profile\n\n' +
          '**Step 3: Get the LEAGUE Role**\n' +
          '1️⃣ Go to **Server Settings** (right-click server name)\n' +
          '2️⃣ Click **Linked Roles** in the left sidebar\n' +
          '3️⃣ Click **Connect** next to the LEAGUE role requirement\n' +
          '4️⃣ If you have Facebook connected with "Display on profile" enabled, you\'ll automatically get the role!\n\n' +
          '**✅ You\'re all set!** You now have access to league game rooms and can use `/game`, `/whiz`, `/mirror`, and `/gimmick` commands!'
        )
        .setColor(0x0099ff)
        .setTimestamp()
        .setFooter({ text: 'Need help? Contact a moderator!' });

      try {
        const channel = await interaction.client.channels.fetch(helpChannelId);
        await channel.send({ embeds: [embed] });
        
        await interaction.reply({
          content: `✅ Successfully posted Facebook help instructions to <#${helpChannelId}>!`,
          ephemeral: true
        });
      } catch (error) {
        console.error('Error posting to help channel:', error);
        await interaction.reply({
          content: `❌ Failed to post to help channel. Error: ${error.message}`,
          ephemeral: true
        });
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('stats')
      .setDescription('Get league statistics for a user')
      .addUserOption(option =>
        option.setName('user')
          .setDescription('User to get stats for (defaults to you)')
          .setRequired(false)
      ),
    execute: getStats
  },
  {
    data: new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('Show league leaderboard')
      .addStringOption(option =>
        option.setName('sort')
          .setDescription('Sort by')
          .setRequired(false)
          .addChoices(
            { name: 'Games Played', value: 'gamesPlayed' },
            { name: 'Games Won', value: 'gamesWon' },
            { name: 'Win %', value: 'winRate' },
            { name: 'Nil Made %', value: 'nilMadeRate' },
            { name: 'Bags per Game', value: 'bagsPerGame' }
          )
      ),
    execute: getLeaderboard
  },
  {
    data: new SlashCommandBuilder()
      .setName('pay')
      .setDescription('Admin command: Pay coins to a user')
      .addUserOption(option =>
        option.setName('user')
          .setDescription('User to pay coins to')
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option.setName('amount')
          .setDescription('Amount of coins to pay')
          .setRequired(true)
          .setMinValue(1)
      ),
    execute: payUser
  },
  {
    data: new SlashCommandBuilder()
      .setName('rules')
      .setDescription('Display full BUX Spades game rules'),
    execute: async (interaction) => {
      try {
        console.log('[DISCORD] /rules invoked by', interaction.user?.id);
      const desc = [
        '**Regular**\n\nPlayers can bid whatever they like from 0-13',
        '**No Nils**\n\nNil bids are forbidden and the minimum bid is 1',
        '**Blind Nil**\n\nBefore seeing their cards players can choose to bid nil without seeing their hand for a chance to win x2 nil bonus',
        '**Whiz**\n\nPlayers can only bid the number of spades in their hand or nil',
        '**Mirror**\n\nPlayers are forced to bid the number of spades in their hand',
        '**Suicide (Partners Only)**\n\n1 partner from each team MUST bid nil',
        '**Crazy Aces**\n\nPlayers must bid 3 for each ace they hold',
        '**Joker Whiz**\n\nFirst 3 bidders must bid whiz rules, final bidder bids regular',
        '**Screamer**\n\nPlayers are not allowed to play a spade if they have other suits available',
        '**Assassin**\n\nPlayers MUST play a spade if they can',
        '**Secret Assassin**\n\n3 players play screamer rules, whoever is dealt ace of spades plays assassin rules',
        '**Lowball**\n\nPlayers must all play their lowest card in chosen suit',
        '**Highball**\n\nPlayers must play their highest card in chosen suit'
      ].join('\n\n');

      const embed = new EmbedBuilder()
        .setTitle('📖 BUX Spades Rules')
        .setDescription(desc)
        .setColor(0x0099ff)
        .setThumbnail(THUMBNAIL_URL)
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
      } catch (err) {
        console.error('[DISCORD] /rules error:', err);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Failed to display rules.', ephemeral: true });
        }
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('help')
      .setDescription('List available user commands'),
    execute: async (interaction) => {
      try {
        console.log('[DISCORD] /help invoked by', interaction.user?.id);
        // Build help list only from actually-registered, user-facing commands
        const registeredNames = new Set(commands.map((c) => c.data?.name));
        const entries = [
        { name: 'game', text: '`/game` - Create a Regular game line' },
        { name: 'whiz', text: '`/whiz` - Create a Whiz game line' },
        { name: 'mirror', text: '`/mirror` - Create a Mirror game line' },
        { name: 'gimmick', text: '`/gimmick` - Create a Gimmick variant game line' },
        { name: 'stats', text: '`/stats` - Show player statistics' },
        { name: 'leaderboard', text: '`/leaderboard` - Show top players' },
        { name: 'facebookhelp', text: '`/facebookhelp` - How to get the LEAGUE role' },
        { name: 'rules', text: '`/rules` - Display full game rules' }
        ];
        const commandsList = entries
        .filter(e => registeredNames.has(e.name))
        .map(e => e.text)
        .join('\n');

      const embed = new EmbedBuilder()
        .setTitle('🤖 BUX Spades Commands')
        .setDescription(commandsList)
        .setColor(0x00cc88)
        .setThumbnail(THUMBNAIL_URL)
        .setTimestamp();
        await interaction.reply({ embeds: [embed] });
      } catch (err) {
        console.error('[DISCORD] /help error:', err);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Failed to display help.', ephemeral: true });
        }
      }
    }
  }
];

// Export modal submit handler
export async function handleModalSubmit(interaction) {
  try {
    const customId = interaction.customId;
    
    if (customId.startsWith('tournament_modal_')) {
      await handleTournamentModal(interaction);
    } else if (customId.startsWith('tournament_partner_search_')) {
      await handleTournamentPartnerSearch(interaction);
    }
  } catch (error) {
    console.error('[DISCORD] Error handling modal submit:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred. Please try again.',
        ephemeral: true
      });
    }
  }
}

// Handle tournament partner search modal
async function handleTournamentPartnerSearch(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const customId = interaction.customId;
    const tournamentId = customId.replace('tournament_partner_search_', '');
    const searchQuery = interaction.fields.getTextInputValue('partner_search')?.trim() || null;
    
    const guild = interaction.guild;
    if (!guild) {
      return interaction.editReply({
        content: '❌ Could not access server members. Please try again.'
      });
    }
    
    const userId = interaction.user.id;
    const { options, totalMembers } = await buildPartnerOptions(guild, userId, tournamentId, searchQuery, 25);
    
    if (options.length === 0) {
      return interaction.editReply({
        content: searchQuery 
          ? `❌ No members found matching "${searchQuery}". Try a different search term.`
          : '❌ No available partners found.'
      });
    }
    
    const { StringSelectMenuBuilder } = await import('discord.js');
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`tournament_partner_select_${tournamentId}`)
      .setPlaceholder(searchQuery ? `Results for "${searchQuery}"...` : 'Select a partner...')
      .addOptions(options);
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    await interaction.editReply({
      content: searchQuery
        ? `**Search Results for "${searchQuery}":**\n\n` +
          `Found ${options.length - 1} matching member${options.length - 1 !== 1 ? 's' : ''} (out of ${totalMembers} total).\n\n` +
          '• Players with ✅ are already registered alone\n' +
          '• Players with ⚠️ are not yet registered (they will need to confirm)\n' +
          '• Players with ❌ are not in database (need to play first)'
        : '**Select your partner:**\n\n' +
          '• Choose a player from the list (alphabetically sorted)\n' +
          '• Players with ✅ are already registered alone\n' +
          '• Players with ⚠️ are not yet registered (they will need to confirm)\n' +
          '• Players with ❌ are not in database (need to play first)\n' +
          '• Or select "No Partner" to be auto-assigned',
      components: [row]
    });
  } catch (error) {
    console.error('[TOURNAMENT] Error handling partner search:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred. Please try again.',
        ephemeral: true
      });
    } else {
      await interaction.editReply({
        content: '❌ An error occurred. Please try again.'
      });
    }
  }
}

// Export select menu handler for interaction handling
export async function handleSelectMenuInteraction(interaction) {
  try {
    const customId = interaction.customId;
    
    // Handle tournament partner selection
    if (customId.startsWith('tournament_partner_select_')) {
      await handleTournamentPartnerSelect(interaction);
      return;
    }
  } catch (error) {
    console.error('[DISCORD] Error handling select menu interaction:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred. Please try again.',
        ephemeral: true
      });
    }
  }
}

// Export button handler for interaction handling
export async function handleButtonInteraction(interaction) {
  try {
    const customId = interaction.customId;
    
    // Handle tournament buttons
    if (customId.startsWith('register_tournament_') || 
        customId.startsWith('cancel_registration_') ||
        customId.startsWith('join_tournament_') ||
        customId.startsWith('unregister_tournament_') ||
        customId.startsWith('view_tournament_lobby_') ||
        customId.startsWith('tournament_confirm_partner_') ||
        customId.startsWith('tournament_cancel_partner_') ||
        customId.startsWith('tournament_open_search_') ||
        customId.startsWith('tournament_show_full_list_') ||
        customId.startsWith('tournament_partner_next_') ||
        customId.startsWith('tournament_partner_prev_')) {
      await handleTournamentButton(interaction);
      return;
    }
    
    // Handle game line buttons
    // customId format: "action_gameLineId" where gameLineId itself contains underscores
    // So we split on first underscore only
    const [action, ...gameLineIdParts] = customId.split('_');
    const gameLineId = gameLineIdParts.join('_');
    const gameLine = gameLines.get(gameLineId);
    
    if (!gameLine) {
      console.log(`[DISCORD] Game line ${gameLineId} not found. Available lines:`, Array.from(gameLines.keys()));
      return interaction.reply({ 
        content: '❌ Game line not found or has expired. (This can happen if the server restarted. Please create a new game line.)', 
        ephemeral: true 
      });
    }

    const userId = interaction.user.id;

    if (action === 'join') {
      await handleJoinGame(interaction, gameLine, gameLineId);
    } else if (action === 'leave') {
      await handleLeaveGame(interaction, gameLine, gameLineId);
    } else if (action === 'cancel') {
      await handleCancelGame(interaction, gameLine, gameLineId);
    }
  } catch (error) {
    console.error('[DISCORD] Error handling button interaction:', error);
    await interaction.reply({ 
      content: '❌ An error occurred. Please try again.', 
      ephemeral: true 
    });
  }
}

// Command implementations
async function createGameLine(interaction, format) {
  try {
    // Defer reply to prevent timeout
    await interaction.deferReply();
    
    // Validate user exists and has enough coins
    const userValidation = await validateUserForGame(interaction.user.id, interaction.options.getInteger('coins'));
    if (!userValidation.valid) {
      return interaction.editReply({ 
        content: userValidation.message
      });
    }
    
    const channelId = interaction.channel.id;
    const coins = interaction.options.getInteger('coins');
    const modeValue = interaction.options.getInteger('mode');
    const mode = modeValue === 1 ? 'PARTNERS' : 'SOLO';
    const minPoints = interaction.options.getInteger('minpoints') || -100;
    const maxPoints = interaction.options.getInteger('maxpoints') || 500;
    const specialRule1 = interaction.options.getString('special1') || 'NONE';
    const specialRule2 = interaction.options.getString('special2') || 'NONE';
    
    // Gimmick variant (only for /gimmick command)
    const gimmickVariant = format === 'GIMMICK' ? interaction.options.getString('gimmicktype') : null;
    
    // Debug logging for gimmick variant
    if (format === 'GIMMICK') {
      console.log(`[GIMMICK DEBUG] Variant received: ${gimmickVariant}`);
      console.log(`[GIMMICK DEBUG] All options:`, interaction.options.data);
    }
    
    // Nil settings (only for /game (REGULAR) command, others always true/false)
    let nilAllowed, blindNilAllowed;
    if (format === 'REGULAR') {
      nilAllowed = interaction.options.getString('nil') === 'false' ? false : true;
      blindNilAllowed = interaction.options.getString('blindnil') === 'true' ? true : false;
    } else {
      nilAllowed = true;  // Always on for WHIZ, MIRROR, GIMMICK
      blindNilAllowed = false;  // Always off for WHIZ, MIRROR, GIMMICK
    }

    // Debug logging
    console.log(`[DISCORD] Received /${interaction.commandName} command with options:`, {
      coins,
      mode,
      format,
      minPoints,
      maxPoints,
      gimmickVariant,
      specialRule1,
      specialRule2,
      nilAllowed,
      blindNilAllowed
    });

    // Validate coins based on room
    const validCoins = validateCoins(channelId, coins);
    if (!validCoins) {
      const isLowRoom = channelId === LOW_ROOM_ID;
      const range = isLowRoom ? '100k-900k (100k increments)' : '1M-10M (1M increments)';
      return interaction.reply({ 
        content: `❌ Invalid coin amount for this room. Valid range: ${range}`, 
        ephemeral: true 
      });
    }

    // Validate gimmick variant if format is GIMMICK
    if (format === 'GIMMICK' && !gimmickVariant) {
      return interaction.reply({ 
        content: '❌ You must select a gimmick variant when using Gimmick format.', 
        ephemeral: true 
      });
    }

    // Validate Suicide is partners only
    if (gimmickVariant === 'SUICIDE' && mode !== 'PARTNERS') {
      return interaction.reply({ 
        content: '❌ Suicide variant is only available in Partners mode.', 
        ephemeral: true 
      });
    }

    // Create game line
    const gameLineId = `line_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const gameLine = {
      id: gameLineId,
      channelId,
      messageId: null, // Will be set after reply
      createdBy: interaction.user.id,
      createdAt: new Date(),
      settings: {
        coins,
        mode,
        format,
        minPoints,
        maxPoints,
        gimmickVariant,
        specialRule1,
        specialRule2,
        nilAllowed,
        blindNilAllowed
      },
      players: [
        { discordId: interaction.user.id, username: interaction.user.username, seat: 0 } // Host in seat 0
      ]
    };

    gameLines.set(gameLineId, gameLine);

    // Create embed
    const embed = createGameLineEmbed(gameLine);
    const buttons = createGameLineButtons(gameLineId, false);

    const response = await interaction.editReply({ 
      content: '<@&1403953667501195284>',
      embeds: [embed],
      components: [buttons],
      allowedMentions: { roles: ['1403953667501195284'] }
    });

    // Store message ID for later updates
    gameLine.messageId = response.id;
    gameLines.set(gameLineId, gameLine);

    console.log(`[DISCORD] Game line created: ${gameLineId}`);
  } catch (error) {
    console.error('[DISCORD] Error creating game line:', error);
    if (interaction.deferred) {
      await interaction.editReply({ 
        content: '❌ Failed to create game line. Please try again.'
      });
    } else {
    await interaction.reply({ 
        content: '❌ Failed to create game line. Please try again.', 
      ephemeral: true 
    });
    }
  }
}




async function getStats(interaction) {
  try {
    // Defer reply immediately to prevent timeout
    await interaction.deferReply();
    
    const targetUser = interaction.options.getUser('user') || interaction.user;
    
    console.log(`[DISCORD] Getting stats for user: ${targetUser.username} (${targetUser.id})`);
    
    // Get user by Discord ID
    const user = await prisma.user.findUnique({
      where: { discordId: targetUser.id }
    });

    if (!user) {
      return interaction.editReply({ 
        content: '❌ User not found in database.' 
      });
    }

    console.log(`[DISCORD] Found user in database: ${user.username} (${user.id})`);

    // Get league-only stats using DetailedStatsService
    const stats = await DetailedStatsService.getUserStats(user.id, {
      mode: 'ALL',
      format: 'ALL',
      isLeague: true  // Only league games
    });
    
    console.log(`[DISCORD] Stats retrieved: ${stats.totalGames} games, ${stats.gamesWon} wins`);

    // Format coin balance
    const coinBalance = user.coins || 0;
    const coinText = coinBalance >= 1000000 
      ? `${(coinBalance / 1000000).toFixed(2)}M` 
      : `${(coinBalance / 1000).toFixed(0)}k`;

    // Create embed with league stats
    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${targetUser.displayName || targetUser.username}'s League Stats`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setColor(0x0099ff)
      .setTimestamp();

    // Main stats section with coin balance at top
    embed.addFields(
      { 
        name: '💰 **Coin Balance:** ' + coinText + '\n**Played:** ' + stats.totalGames + '\n**Won:** ' + stats.gamesWon + '\n**Win %:** ' + stats.winRate.toFixed(1) + '%\n**Total bags:** ' + stats.bags.total + '\n**Bags per game:** ' + stats.bags.perGame.toFixed(1), 
        value: '', 
        inline: false 
      }
    );

    // Mode breakdown if available
    if (stats.modeBreakdown) {
      const partners = stats.modeBreakdown.partners || { played: 0, won: 0, winRate: 0 };
      const solo = stats.modeBreakdown.solo || { played: 0, won: 0, winRate: 0 };
      
      embed.addFields(
        { 
          name: '🤝 **Partners**', 
          value: `Played: ${partners.played} | Won: ${partners.won} | Win %: ${partners.winRate.toFixed(1)}%`, 
          inline: true 
        },
        { 
          name: '👤 **Solo**', 
          value: `Played: ${solo.played} | Won: ${solo.won} | Win %: ${solo.winRate.toFixed(1)}%`, 
          inline: true 
        }
      );
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[DISCORD] Error getting stats:', error);
    
    if (!interaction.deferred) {
      await interaction.reply({ 
        content: '❌ Failed to get user statistics.', 
        ephemeral: true 
      });
    } else {
      await interaction.editReply({ 
        content: '❌ Failed to get user statistics.' 
      });
    }
  }
}

async function getLeaderboard(interaction) {
  try {
    // Defer reply immediately to prevent timeout
    await interaction.deferReply();
    
    const sortBy = interaction.options.getString('sort') || 'winRate';
    
    console.log(`[DISCORD] Getting leaderboard sorted by: ${sortBy}`);
    
    // Get leaderboard using DetailedStatsService
    const leaderboard = await DetailedStatsService.getLeaderboard({
      mode: 'ALL',
      format: 'ALL',
      isLeague: true,  // Only league games
      limit: 10,
      sortBy: sortBy
    });
    
    console.log(`[DISCORD] Leaderboard retrieved: ${leaderboard.length} users`);
    
    // Create embed with leaderboard
    const embed = new EmbedBuilder()
      .setTitle(`🏆 League Leaderboard`)
      .setDescription(`Sorted by: **${getSortDisplayName(sortBy)}**`)
      .setColor(0x0099ff)
      .setTimestamp();
    
    if (leaderboard.length === 0) {
      embed.addFields({
        name: 'No Data',
        value: 'No league games found.',
        inline: false
      });
    } else {
      // Format leaderboard entries
      const leaderboardText = leaderboard.map((entry, index) => {
        const rank = index + 1;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
        
        let displayValue = '';
        switch (sortBy) {
          case 'gamesPlayed':
            displayValue = `${entry.totalGames} games`;
            break;
          case 'gamesWon':
            displayValue = `${entry.gamesWon} wins`;
            break;
          case 'winRate':
            displayValue = `${entry.winRate.toFixed(1)}%`;
            break;
          case 'nilMadeRate':
            displayValue = `${entry.nils.rate.toFixed(1)}%`;
            break;
          case 'bagsPerGame':
            displayValue = `${entry.bags.perGame.toFixed(1)}`;
            break;
          default:
            displayValue = `${entry.winRate.toFixed(1)}%`;
        }
        
        return `${medal} **${entry.user.username}** - ${displayValue}`;
      }).join('\n');
      
      embed.addFields({
        name: 'Top 10 Players',
        value: leaderboardText,
        inline: false
      });
    }
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[DISCORD] Error getting leaderboard:', error);
    
    if (!interaction.deferred) {
      await interaction.reply({ 
        content: '❌ Failed to get leaderboard.', 
        ephemeral: true 
      });
    } else {
      await interaction.editReply({ 
        content: '❌ Failed to get leaderboard.' 
      });
    }
  }
}

function getSortDisplayName(sortBy) {
  switch (sortBy) {
    case 'gamesPlayed':
      return 'Games Played';
    case 'gamesWon':
      return 'Games Won';
    case 'winRate':
      return 'Win %';
    case 'nilMadeRate':
      return 'Nil Made %';
    case 'bagsPerGame':
      return 'Bags per Game';
    default:
      return 'Win %';
  }
}

async function payUser(interaction) {
  try {
    // Check if user is admin
    const adminUserIds = process.env.DISCORD_ADMIN_IDS?.split(',') || [];
    if (!adminUserIds.includes(interaction.user.id)) {
      return interaction.reply({ 
        content: '❌ You do not have permission to use this command.', 
        ephemeral: true 
      });
    }

    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    // Find user by Discord ID
    const user = await prisma.user.findUnique({
      where: { discordId: targetUser.id }
    });

    if (!user) {
      return interaction.reply({ 
        content: '❌ User not found in database.', 
        ephemeral: true 
      });
    }

    // Update user's coins
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { 
        coins: { increment: amount }
      }
    });

    const embed = new EmbedBuilder()
      .setTitle('💰 Payment Processed')
      .addFields(
        { name: 'Amount', value: `${amount.toLocaleString()} coins`, inline: true },
        { name: 'Recipient', value: `<@${targetUser.id}>`, inline: true },
        { name: 'New Balance', value: `${updatedUser.coins.toLocaleString()} coins`, inline: true },
        { name: 'Processed by', value: `<@${interaction.user.id}>`, inline: false }
      )
      .setColor(0x00ff00)
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('[DISCORD] Error processing payment:', error);
    await interaction.reply({ 
      content: '❌ Failed to process payment.', 
      ephemeral: true 
    });
  }
}

// Helper functions for game lines
async function validateUserForGame(discordId, requiredCoins) {
  try {
    // Check if user exists in database
    const user = await prisma.user.findUnique({
      where: { discordId: discordId },
      select: { id: true, coins: true, username: true }
    });

    if (!user) {
      return {
        valid: false,
        message: '❌ You need to create an account first!\n\nPlease visit **https://www.bux-spades.pro** and login with Discord before creating or joining game lines.'
      };
    }

    // Check if user has enough coins
    if (user.coins < requiredCoins) {
      const coinsDisplay = requiredCoins >= 1000000 
        ? `${requiredCoins / 1000000}M` 
        : `${requiredCoins / 1000}k`;
      
      return {
        valid: false,
        message: `❌ Insufficient coins!\n\nYou need **${coinsDisplay}** coins to join this game, but you only have **${user.coins.toLocaleString()}** coins.\n\n💡 **Options:**\n• Play games with lower coin amounts\n• Open a ticket in Discord to purchase more coins`
      };
    }

    return {
      valid: true,
      user: user
    };
  } catch (error) {
    console.error('[DISCORD] Error validating user:', error);
    return {
      valid: false,
      message: '❌ Error checking your account. Please try again later.'
    };
  }
}

function validateCoins(channelId, coins) {
  if (channelId === LOW_ROOM_ID) {
    // Low room: 100k-900k in 100k increments
    return coins >= 100000 && coins <= 900000 && coins % 100000 === 0;
  } else if (channelId === HIGH_ROOM_ID) {
    // High room: 1M-10M in 1M increments
    return coins >= 1000000 && coins <= 10000000 && coins % 1000000 === 0;
  }
  return false;
}

function createGameLineEmbed(gameLineData) {
  const { settings, players, createdAt } = gameLineData;
  const { coins, mode, format, minPoints, maxPoints, gimmickVariant, specialRule1, specialRule2, nilAllowed, blindNilAllowed } = settings;
  
  // Format coins (e.g., 100000 -> 100k, 1000000 -> 1mil)
  const coinsDisplay = coins >= 1000000 ? `${coins / 1000000}mil` : `${coins / 1000}k`;
  
  // Build game line with bold formatting
  let gameLineText = `**${coinsDisplay} ${mode} ${maxPoints}/${minPoints} ${format}`;
  
  // Add gimmick variant for GIMMICK games
  if (format === 'GIMMICK' && gimmickVariant) {
    gameLineText = `**${coinsDisplay} ${mode} ${maxPoints}/${minPoints} ${gimmickVariant}`;
  }
  
  // Add nil status for REGULAR games
  if (format === 'REGULAR') {
    gameLineText += `\nnil ${nilAllowed ? '☑️' : '❌'} bn ${blindNilAllowed ? '☑️' : '❌'}`;
  }
  
  // Add special rules if present (map SECRET_ASSASSIN -> SECRET)
  const specialRules = [];
  if (specialRule1 && specialRule1 !== 'NONE') {
    specialRules.push(specialRule1 === 'SECRET_ASSASSIN' ? 'SECRET' : specialRule1.toUpperCase());
  }
  if (specialRule2 && specialRule2 !== 'NONE') {
    specialRules.push(String(specialRule2).toUpperCase());
  }
  if (specialRules.length > 0) {
    gameLineText += `\n🎲 **${specialRules.join(' + ')}**`;
  }
  
  gameLineText += '**'; // Close bold
  
  // Organize players by team or individual colors
  let playersText;
  const playersNeeded = 4 - players.length;
  const playersNeededText = playersNeeded > 0 ? `\n\n**${playersNeeded} more player${playersNeeded === 1 ? '' : 's'} needed**` : '';
  
  if (mode === 'SOLO') {
    // For SOLO games, show individual player colors
    const colorEmojis = ['🔴', '🔵', '🟠', '🟢']; // Red (0), Blue (1), Orange (2), Green (3)
    const seats = [0, 1, 2, 3];
    
    playersText = seats.map(seat => {
      const player = players.find(p => p.seat === seat);
      const emoji = colorEmojis[seat];
      return player ? `${emoji} • <@${player.discordId}>` : `${emoji} • _Empty_`;
    }).join('\n');
  } else {
    // For PARTNERS games, show teams
    const redTeam = players.filter(p => p.seat === 0 || p.seat === 2);
    const blueTeam = players.filter(p => p.seat === 1 || p.seat === 3);
    
    const redTeamText = redTeam.length > 0 
      ? redTeam.map(p => `• <@${p.discordId}>`).join('\n')
      : '• _Empty_';
    
    const blueTeamText = blueTeam.length > 0
      ? blueTeam.map(p => `• <@${p.discordId}>`).join('\n')
      : '• _Empty_';
    
    playersText = `🔴 Red Team:\n${redTeamText}\n\n🔵 Blue Team:\n${blueTeamText}`;
  }
  
  const embed = new EmbedBuilder()
    .setTitle(gameLineData.eventId ? '🎮 EVENT GAME LINE' : '🎮 GAME LINE')
    .setDescription(gameLineText)
    .setColor(0x00ff00)
    .setTimestamp();

  const fields = [
    { name: '👤 Host', value: `<@${gameLineData.createdBy}>`, inline: true },
    { name: '👥 Players', value: `${players.length}/4`, inline: true },
    { name: '⏰ Created', value: `<t:${Math.floor(createdAt.getTime() / 1000)}:R>`, inline: true },
    { name: '🎯 Current Players', value: `${playersText}${playersNeededText}`, inline: false }
  ];

  if (gameLineData.eventId) {
    fields.unshift({
      name: '🏆 Event',
      value: gameLineData.eventName || 'Active Event',
      inline: false
    });
  }

  embed.addFields(fields);

  return embed;
}

function createGameLineButtons(gameLineId, isFull) {
  if (isFull) {
    return null; // No buttons when full
  }
  
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`join_${gameLineId}`)
        .setLabel('Join Game')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`leave_${gameLineId}`)
        .setLabel('Leave Game')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌'),
      new ButtonBuilder()
        .setCustomId(`cancel_${gameLineId}`)
        .setLabel('Cancel Game')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🚫')
    );

  return row;
}

async function handleJoinGame(interaction, gameLine, gameLineId) {
  const userId = interaction.user.id;
  
  // Validate user exists and has enough coins
  const userValidation = await validateUserForGame(userId, gameLine.settings.coins);
  if (!userValidation.valid) {
    return interaction.reply({ 
      content: userValidation.message, 
      ephemeral: true 
    });
  }
  
  // Check if already in line
  if (gameLine.players.some(p => p.discordId === userId)) {
    return interaction.reply({ 
      content: '❌ You are already in this game line.', 
      ephemeral: true 
    });
  }
  
  // Check if line is full
  if (gameLine.players.length >= 4) {
    return interaction.reply({ 
      content: '❌ This game line is already full.', 
      ephemeral: true 
    });
  }
  
  // Assign seat based on join order: 0 (host), 2 (partner), 1 (opponent), 3 (opponent partner)
  const seatOrder = [0, 2, 1, 3];
  const seat = seatOrder[gameLine.players.length];
  
  // Add player
  gameLine.players.push({
    discordId: userId,
    username: interaction.user.username,
    seat
  });
  
  gameLines.set(gameLineId, gameLine);
  
  // Check if line is now full
  if (gameLine.players.length === 4) {
    await handleLineFull(interaction, gameLine, gameLineId);
  } else {
    // Update embed
    const embed = createGameLineEmbed(gameLine);
    const buttons = createGameLineButtons(gameLineId, false);
    
    await interaction.update({ 
      embeds: [embed],
      components: [buttons]
    });
  }
}

async function handleLeaveGame(interaction, gameLine, gameLineId) {
  const userId = interaction.user.id;
  
  // Check if in line
  const playerIndex = gameLine.players.findIndex(p => p.discordId === userId);
  if (playerIndex === -1) {
    return interaction.reply({ 
      content: '❌ You are not in this game line.', 
      ephemeral: true 
    });
  }
  
  // Can't leave if you're the host
  if (userId === gameLine.createdBy) {
    return interaction.reply({ 
      content: '❌ Host cannot leave. Use Cancel Game instead.', 
      ephemeral: true 
    });
  }
  
  // Remove player
  gameLine.players.splice(playerIndex, 1);
  gameLines.set(gameLineId, gameLine);
  
  // Update embed
  const embed = createGameLineEmbed(gameLine);
  const buttons = createGameLineButtons(gameLineId, false);
  
  await interaction.update({ 
    embeds: [embed],
    components: [buttons]
  });
}

async function handleCancelGame(interaction, gameLine, gameLineId) {
  const userId = interaction.user.id;
  
  // Only host or admin can cancel
  const adminIds = process.env.DISCORD_ADMIN_IDS?.split(',') || [];
  if (userId !== gameLine.createdBy && !adminIds.includes(userId)) {
    return interaction.reply({ 
      content: '❌ Only the host or an admin can cancel this game line.', 
      ephemeral: true 
    });
  }
  
  // Delete game line
  gameLines.delete(gameLineId);
  
  // Update embed to show cancelled
  const embed = new EmbedBuilder()
    .setTitle('🚫 GAME LINE - CANCELLED')
    .setDescription('This game line has been cancelled.')
    .setColor(0xff0000)
    .setTimestamp();
  
  await interaction.update({ 
    embeds: [embed],
    components: []
  });
}

async function handleLineFull(interaction, gameLine, gameLineId) {
  try {
    // Build game line text matching the original format
    const { settings } = gameLine;
    const coinsDisplay = settings.coins >= 1000000 ? `${settings.coins / 1000000}mil` : `${settings.coins / 1000}k`;
    let gameLineText = `${coinsDisplay} ${settings.mode} ${settings.maxPoints}/${settings.minPoints}`;
    
    // Add format (GIMMICK variant or REGULAR)
    if (settings.format === 'GIMMICK' && settings.gimmickVariant) {
      gameLineText += ` ${settings.gimmickVariant}`;
    } else {
      gameLineText += ` ${settings.format}`;
      // Add nil status for REGULAR games
      if (settings.format === 'REGULAR') {
        const nilAllowed = settings.nilAllowed ? '☑️' : '❌';
        const blindNilAllowed = settings.blindNilAllowed ? '☑️' : '❌';
        gameLineText += `\nnil ${nilAllowed} bn ${blindNilAllowed}`;
      }
    }
    
  // Add special rules if present (map SECRET_ASSASSIN -> SECRET)
  const specialRules = [];
  if (settings.specialRule1 && settings.specialRule1 !== 'NONE') {
    specialRules.push(settings.specialRule1 === 'SECRET_ASSASSIN' ? 'SECRET' : settings.specialRule1.toUpperCase());
  }
  if (settings.specialRule2 && settings.specialRule2 !== 'NONE') {
    specialRules.push(String(settings.specialRule2).toUpperCase());
  }
    if (specialRules.length > 0) {
      gameLineText += `\n🎲 ${specialRules.join(' + ')}`;
    }

    if (gameLine.eventId) {
      gameLineText = `${gameLine.eventName ? `🏆 ${gameLine.eventName}\n` : '🏆 Event Game\n'}${gameLineText}`;
    }
    
    // Update original embed to show FULL
    const fullEmbed = new EmbedBuilder()
      .setTitle(gameLine.eventId ? '🎮 EVENT GAME LINE - FULL' : '🎮 GAME LINE - FULL')
      .setDescription(gameLineText)
      .addFields(
        { name: '👤 Host', value: `<@${gameLine.createdBy}>`, inline: true },
        { name: '👥 Players', value: '4/4', inline: true },
        { name: '⏰ Created', value: `<t:${Math.floor(gameLine.createdAt.getTime() / 1000)}:R>`, inline: true }
      )
      .setColor(0x00ff00)
      .setFooter({ text: 'Game created! Check the reply above for details.' })
      .setTimestamp();
    
    await interaction.update({ 
      embeds: [fullEmbed],
      components: []
    });
    
    // Create game in database
    const gameId = await createGameFromLine(gameLine);
    
    // Set activeGameId for all players and emit socket event to force redirect
    const { default: redisSessionService } = await import('../../services/RedisSessionService.js');
    const { io } = await import('../../index.js');
    
    for (const player of gameLine.players) {
      // Find user by Discord ID
      const user = await prisma.user.findUnique({
        where: { discordId: player.discordId }
      });
      
      if (user) {
        // Update session with activeGameId
        await redisSessionService.updateActiveGame(user.id, gameId);
        console.log(`[DISCORD] Set activeGameId ${gameId} for user ${user.username}`);
        
        // Find user's socket and emit redirect event
        const session = await redisSessionService.getUserSession(user.id);
        if (session?.socketId) {
          const userSocket = io.sockets.sockets.get(session.socketId);
          if (userSocket) {
            console.log(`[DISCORD] Emitting force_redirect_to_table to ${user.username}`);
            userSocket.emit('force_redirect_to_table', { gameId });
          }
        }
      }
    }
    
    // Post "Table Up!" reply
    const redTeam = gameLine.players.filter(p => p.seat === 0 || p.seat === 2);
    const blueTeam = gameLine.players.filter(p => p.seat === 1 || p.seat === 3);
    
    // Reuse gameLineText from above, but without bold formatting
    let tableUpDesc = `${coinsDisplay} ${settings.mode} ${settings.maxPoints}/${settings.minPoints}`;
    
    // Add format (GIMMICK variant or REGULAR)
    if (settings.format === 'GIMMICK' && settings.gimmickVariant) {
      tableUpDesc += ` ${settings.gimmickVariant}`;
    } else {
      tableUpDesc += ` ${settings.format}`;
    }
    
    // Add special rules if present
  const specialRulesUp = [];
  if (gameLine.settings.specialRule1 && gameLine.settings.specialRule1 !== 'NONE') {
    specialRulesUp.push(gameLine.settings.specialRule1 === 'SECRET_ASSASSIN' ? 'SECRET' : gameLine.settings.specialRule1.toUpperCase());
  }
  if (gameLine.settings.specialRule2 && gameLine.settings.specialRule2 !== 'NONE') {
    specialRulesUp.push(String(gameLine.settings.specialRule2).toUpperCase());
  }
    if (specialRulesUp.length > 0) {
      tableUpDesc += `\n🎲 **${specialRulesUp.join(' + ')}**`;
    }

    if (gameLine.eventId) {
      tableUpDesc = `${gameLine.eventName ? `🏆 **${gameLine.eventName}**\n` : '🏆 **Event Game**\n'}${tableUpDesc}`;
    }
    
    tableUpDesc += `\n\n🔴 Red Team: ${redTeam.map(p => `<@${p.discordId}>`).join(', ')}\n` +
                   `🔵 Blue Team: ${blueTeam.map(p => `<@${p.discordId}>`).join(', ')}\n\n` +
                   `Please open your BUX Spades app, login with your Discord profile and you will be directed to your table...\n\n` +
                   `GOOD LUCK! 🍀`;
    
    const tableUpEmbed = new EmbedBuilder()
      .setTitle(gameLine.eventId ? `🎮 Table Up! — ${gameLine.eventName || 'Event Game'}` : '🎮 Table Up!')
      .setDescription(tableUpDesc)
      .setColor(0x0099ff)
      .setTimestamp();
    
    await interaction.followUp({ 
      content: '<@&1403953667501195284>',
      embeds: [tableUpEmbed],
      allowedMentions: { roles: ['1403953667501195284'] }
    });
    
    // Clean up game line from memory
    gameLines.delete(gameLineId);
    
    console.log(`[DISCORD] Table created for game line ${gameLineId}, game ID: ${gameId}`);
  } catch (error) {
    console.error('[DISCORD] Error handling full line:', error);
    await interaction.followUp({ 
      content: '❌ Error creating game table. Please contact an admin.', 
      ephemeral: true 
    });
  }
}

async function createGameFromLine(gameLine) {
  const { settings, players, eventId, eventName } = gameLine;
  const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Sort players by seat to ensure correct order
  const sortedPlayers = [...players].sort((a, b) => a.seat - b.seat);
    
    // Create game in database
    const game = await prisma.game.create({
      data: {
        id: gameId,
      createdById: gameLine.createdBy,
      mode: settings.mode,
      format: settings.format,
      gimmickVariant: settings.gimmickVariant || null,
        isLeague: true,
        isRated: true,
        status: 'WAITING',
      minPoints: settings.minPoints,
      maxPoints: settings.maxPoints,
      nilAllowed: settings.nilAllowed,
      blindNilAllowed: settings.blindNilAllowed,
      specialRules: {
        specialRule1: settings.specialRule1 || 'NONE',
        specialRule2: settings.specialRule2 || 'NONE'
      },
      buyIn: settings.coins,
      eventId: eventId || null,
        currentRound: 1,
        currentTrick: 0,
        currentPlayer: null,
        dealer: Math.floor(Math.random() * 4), // Random dealer 0-3
        createdAt: new Date()
      }
    });

  // Create game players for each Discord user in their assigned seats
  for (const player of sortedPlayers) {
      // Find or create user by Discord ID
      let user = await prisma.user.findUnique({
      where: { discordId: player.discordId }
      });
      
      if (!user) {
        // Create placeholder user for Discord ID
        user = await prisma.user.create({
          data: {
          discordId: player.discordId,
          username: player.username,
            avatarUrl: '/default-pfp.jpg',
          coins: 15000000, // Default coins
            createdAt: new Date()
          }
        });
      }
      
    // Add player to game in their assigned seat
      await prisma.gamePlayer.create({
        data: {
          gameId: game.id,
          userId: user.id,
        seatIndex: player.seat,
        teamIndex: player.seat % 2, // Seats 0,2 = team 0; seats 1,3 = team 1
          isHuman: true,
          isSpectator: false,
          joinedAt: new Date()
        }
      });
    }

    // Create Discord game record for tracking
    await prisma.discordGame.create({
      data: {
        gameId: game.id,
      channelId: gameLine.channelId,
      commandMessageId: gameLine.messageId,
      createdBy: gameLine.createdBy,
        status: 'WAITING',
        createdAt: new Date()
      }
    });

  if (eventId) {
    try {
      await EventService.tagGame(eventId, game.id, true);
      console.log(`[DISCORD] Tagged game ${game.id} with event ${eventId}${eventName ? ` (${eventName})` : ''}`);
    } catch (eventError) {
      console.error('[DISCORD] Failed to tag event game:', eventError);
    }
  }

  console.log(`[DISCORD] Created game ${gameId} from line with players:`, sortedPlayers.map(p => `${p.username} (seat ${p.seat})`));
  
  // CONSOLIDATED: GameManager removed - using GameService + Redis directly
  try {
    const { GameService } = await import('../../services/GameService.js');
    const { default: redisGameState } = await import('../../services/RedisGameStateService.js');
    
    // Populate Redis cache with initial game state
    const fullGameState = await GameService.getGameStateForClient(gameId);
    if (fullGameState) {
      await redisGameState.setGameState(gameId, fullGameState);
      console.log(`[DISCORD] Populated Redis cache for game ${gameId}`);
    }
  } catch (error) {
    console.error(`[DISCORD] Error setting up game state:`, error);
  }
  
  return gameId;
}


// Tournament partner select menu handler
async function handleTournamentPartnerSelect(interaction) {
  try {
    await interaction.deferUpdate();
    
    const customId = interaction.customId;
    // Extract tournamentId: format is "tournament_partner_select_<tournamentId>"
    const tournamentId = customId.replace('tournament_partner_select_', '');
    const userId = interaction.user.id;
    const selectedValue = interaction.values?.[0];
    
    console.log('[TOURNAMENT] Partner select - customId:', customId);
    console.log('[TOURNAMENT] Extracted tournamentId:', tournamentId);
    console.log('[TOURNAMENT] Selected value:', selectedValue);
    
    if (!tournamentId || tournamentId.trim() === '') {
      console.error('[TOURNAMENT] CRITICAL: Empty tournamentId from customId:', customId);
      return interaction.editReply({
        content: '❌ Invalid tournament ID. Please click "Join" again from the tournament embed.',
        components: []
      });
    }
    
    if (!selectedValue) {
      console.error('[TOURNAMENT] CRITICAL: No selected value');
      return interaction.editReply({
        content: '❌ No partner selected. Please try again.',
        components: []
      });
    }
    
    // Get user
    let user = await prisma.user.findUnique({
      where: { discordId: userId }
    });
    
    if (!user) {
      return interaction.editReply({
        content: '❌ User not found. Please try again.',
        components: []
      });
    }
    
    // Get tournament
    console.log('[TOURNAMENT] Looking up tournament with ID:', tournamentId, 'Length:', tournamentId.length);
    
    let tournament;
    try {
      tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: { registrations: true }
      });
    } catch (dbError) {
      console.error('[TOURNAMENT] Database error looking up tournament:', dbError);
      return interaction.editReply({
        content: '❌ Database error. Please try again in a moment.',
        components: []
      });
    }
    
    if (!tournament) {
      // Try to find any tournaments to see if it's a database issue
      try {
        const allTournaments = await prisma.tournament.findMany({
          select: { id: true, name: true, status: true },
          take: 10,
          orderBy: { createdAt: 'desc' }
        });
        console.error('[TOURNAMENT] Tournament not found. ID:', tournamentId);
        console.error('[TOURNAMENT] Available tournaments:', allTournaments.map(t => ({ id: t.id, name: t.name, status: t.status })));
        
        // Check if the tournamentId matches any existing tournament (maybe case sensitivity issue?)
        const matchingTournament = allTournaments.find(t => t.id === tournamentId);
        if (matchingTournament) {
          console.log('[TOURNAMENT] Found matching tournament with different case or format');
          tournament = await prisma.tournament.findUnique({
            where: { id: matchingTournament.id },
            include: { registrations: true }
          });
        } else {
          return interaction.editReply({
            content: `❌ Tournament not found.\n\n**Tournament ID:** \`${tournamentId}\`\n\nPlease click "Join" again from the tournament embed. If this persists, the tournament may have been deleted.`,
            components: []
          });
        }
      } catch (error) {
        console.error('[TOURNAMENT] Error checking available tournaments:', error);
        return interaction.editReply({
          content: `❌ Tournament not found. Please click "Join" again from the tournament embed.`,
          components: []
        });
      }
    }
    
    console.log('[TOURNAMENT] Tournament found:', tournament.name, 'Status:', tournament.status);
    
    if (tournament.status !== 'REGISTRATION_OPEN') {
      return interaction.editReply({
        content: '❌ Registration is closed for this tournament.',
        components: []
      });
    }
    
    // Check if already registered
    const existingRegistration = await prisma.tournamentRegistration.findUnique({
      where: {
        tournamentId_userId: {
          tournamentId,
          userId: user.id
        }
      }
    });
    
    if (existingRegistration) {
      return interaction.editReply({
        content: '❌ You are already registered for this tournament.',
        components: []
      });
    }
    
    // Handle auto-assign
    if (selectedValue === 'auto_assign') {
      await prisma.tournamentRegistration.create({
        data: {
          tournamentId,
          userId: user.id,
          isComplete: false
        }
      });
      
      await interaction.editReply({
        content: '✅ Successfully registered! You will be auto-assigned a partner when registration closes.',
        components: []
      });
      
      await updateTournamentEmbed(null, tournamentId);
      return;
    }
    
    // Handle partner selection
    const partnerDiscordId = selectedValue;
    const partner = await prisma.user.findUnique({
      where: { discordId: partnerDiscordId }
    });
    
    if (!partner) {
      return interaction.editReply({
        content: '❌ Partner not found in database.',
        components: []
      });
    }
    
    if (partner.id === user.id) {
      return interaction.editReply({
        content: '❌ You cannot partner with yourself.',
        components: []
      });
    }
    
    // Check if partner is already registered
    const partnerRegistration = await prisma.tournamentRegistration.findUnique({
      where: {
        tournamentId_userId: {
          tournamentId,
          userId: partner.id
        }
      }
    });
    
    if (partnerRegistration) {
      if (partnerRegistration.partnerId && partnerRegistration.isComplete) {
        return interaction.editReply({
          content: `❌ ${partner.username} is already registered with a partner for this tournament.`,
          components: []
        });
      } else if (!partnerRegistration.partnerId) {
        // Partner is registered alone - auto-assign them
        await prisma.tournamentRegistration.createMany({
          data: [
            {
              tournamentId,
              userId: user.id,
              partnerId: partner.id,
              isComplete: true
            },
            {
              tournamentId,
              userId: partner.id,
              partnerId: user.id,
              isComplete: true
            }
          ],
          skipDuplicates: true
        });
        
        // Update existing registration
        await prisma.tournamentRegistration.update({
          where: { id: partnerRegistration.id },
          data: {
            partnerId: user.id,
            isComplete: true
          }
        });
        
        await interaction.editReply({
          content: `✅ Successfully registered with ${partner.username} for the tournament!`,
          components: []
        });
        
        await updateTournamentEmbed(null, tournamentId);
        return;
      }
    }
    
    // Partner is not registered - show confirmation warning
    const { ButtonBuilder } = await import('discord.js');
    const confirmButton = new ButtonBuilder()
      .setCustomId(`tournament_confirm_partner_${tournamentId}_${partnerDiscordId}`)
      .setLabel('Confirm Registration')
      .setStyle(ButtonStyle.Success);
    
    const cancelButton = new ButtonBuilder()
      .setCustomId(`tournament_cancel_partner_${tournamentId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger);
    
    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
    
    await interaction.editReply({
      content: `⚠️ **Partner Confirmation Required**\n\n` +
        `You selected **${partner.username}** as your partner, but they are not yet registered for this tournament.\n\n` +
        `**Please confirm with ${partner.username} that they are willing and able to play before proceeding.**\n\n` +
        `Once you confirm, ${partner.username} will be automatically registered as your partner.`,
      components: [row]
    });
    
  } catch (error) {
    console.error('[TOURNAMENT] Error handling partner select:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred. Please try again.',
        ephemeral: true
      });
    } else {
      await interaction.editReply({
        content: '❌ An error occurred. Please try again.',
        components: []
      });
    }
  }
}

// Helper function to build partner select menu options
async function buildPartnerOptions(guild, userId, tournamentId, searchQuery = null, limit = 25, offset = 0) {
  // Fetch all members with timeout and error handling
  try {
    // Use Promise.race to add a timeout
    const fetchPromise = guild.members.fetch();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('GuildMembersTimeout')), 8000)
    );
    
    await Promise.race([fetchPromise, timeoutPromise]);
  } catch (error) {
    console.error('[TOURNAMENT] Error fetching guild members:', error.message);
    // Continue with cached members if fetch fails or times out
    if (error.message === 'GuildMembersTimeout' || error.code === 'GuildMembersTimeout') {
      console.log('[TOURNAMENT] Member fetch timed out, using cached members');
    } else {
      // For other errors, still try to use cached members
      console.log('[TOURNAMENT] Using cached members due to fetch error');
    }
  }
  
  let members = Array.from(guild.members.cache.values())
    .filter(m => !m.user.bot && m.user.id !== userId);
  
  // Filter by search query if provided
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    members = members.filter(m => {
      const displayName = (m.displayName || m.user.username).toLowerCase();
      const username = m.user.username.toLowerCase();
      return displayName.includes(query) || username.includes(query);
    });
  }
  
  // Sort alphabetically
  members.sort((a, b) => {
    const nameA = (a.displayName || a.user.username).toLowerCase();
    const nameB = (b.displayName || b.user.username).toLowerCase();
    return nameA.localeCompare(nameB);
  });
  
  // Get existing registrations
  const existingRegistrations = await prisma.tournamentRegistration.findMany({
    where: { tournamentId },
    include: { user: true, partner: true }
  });
  
  // Build sets of registered users
  const registeredWithPartner = new Set();
  const registeredAlone = new Set();
  
  existingRegistrations.forEach(reg => {
    if (reg.partnerId && reg.isComplete) {
      registeredWithPartner.add(reg.user.discordId);
      if (reg.partner?.discordId) {
        registeredWithPartner.add(reg.partner.discordId);
      }
    } else if (!reg.partnerId) {
      registeredAlone.add(reg.user.discordId);
    }
  });
  
  // Filter out already partnered members
  const availableMembers = members.filter(m => !registeredWithPartner.has(m.user.id));
  
  // Build select menu options
  const options = [];
  
  // Add "No Partner (Auto-assign)" option only on first page
  if (offset === 0) {
    options.push({
      label: 'No Partner (Auto-assign)',
      value: 'auto_assign',
      description: 'You will be randomly paired when registration closes',
      emoji: '🎲'
    });
  }
  
  // Calculate pagination
  // Page 1: offset 0, shows auto-assign + 24 members (25 total)
  // Page 2+: offset 24, 49, etc., shows 25 members each (no auto-assign)
  const memberSlots = offset === 0 ? limit - 1 : limit; // First page has 1 slot for auto-assign
  const startIndex = offset === 0 ? 0 : offset - 1; // Adjust for auto-assign on first page
  
  // Add members (with pagination)
  const endIndex = Math.min(startIndex + memberSlots, availableMembers.length);
  for (const member of availableMembers.slice(startIndex, endIndex)) {
    const memberId = member.user.id;
    
    // Check if user exists in database
    const dbUser = await prisma.user.findUnique({
      where: { discordId: memberId }
    });
    
    const isRegisteredAlone = registeredAlone.has(memberId);
    const displayName = member.displayName || member.user.username;
    
    // Truncate display name if too long
    const truncatedName = displayName.length > 80 ? displayName.substring(0, 77) + '...' : displayName;
    const description = dbUser 
      ? (isRegisteredAlone 
          ? 'Already registered (will be your partner)' 
          : 'Not yet registered (needs confirmation)')
      : 'Not in database (needs to play first)';
    
    options.push({
      label: truncatedName,
      value: memberId,
      description: description.length > 100 ? description.substring(0, 97) + '...' : description,
      emoji: isRegisteredAlone ? '✅' : (dbUser ? '⚠️' : '❌')
    });
  }
  
  // Calculate page info
  // First page shows 24 members + auto-assign, subsequent pages show 25 members
  const membersPerPage = limit - 1; // 24 members per page (first page) or 25 (other pages)
  const firstPageMembers = 24;
  const otherPagesMembers = 25;
  
  let totalPages;
  if (availableMembers.length <= firstPageMembers) {
    totalPages = 1;
  } else {
    const remainingMembers = availableMembers.length - firstPageMembers;
    totalPages = 1 + Math.ceil(remainingMembers / otherPagesMembers);
  }
  
  const currentPage = offset === 0 ? 1 : Math.floor((offset - 1) / otherPagesMembers) + 2;
  const hasNext = endIndex < availableMembers.length;
  const hasPrevious = offset > 0;
  
  return { 
    options, 
    totalMembers: availableMembers.length,
    totalPages,
    currentPage,
    hasNext,
    hasPrevious,
    nextOffset: hasNext ? endIndex + 1 : null,
    prevOffset: hasPrevious ? (offset === 0 ? 0 : Math.max(0, startIndex - otherPagesMembers + 1)) : null
  };
}

// Tournament modal handler
async function handleTournamentModal(interaction) {
  try {
    const customId = interaction.customId;
    const tournamentId = customId.split('_').pop();
    const userId = interaction.user.id;
    const partnerName = interaction.fields.getTextInputValue('partner_name').trim();
    
    // Get user
    let user = await prisma.user.findUnique({
      where: { discordId: userId }
    });
    
    if (!user) {
      return interaction.reply({
        content: '❌ User not found. Please try again.',
        ephemeral: true
      });
    }
    
    // Get tournament
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { registrations: true }
    });
    
    if (!tournament) {
      return interaction.reply({
        content: '❌ Tournament not found.',
        ephemeral: true
      });
    }
    
    if (tournament.status !== 'REGISTRATION_OPEN') {
      return interaction.reply({
        content: '❌ Registration is closed for this tournament.',
        ephemeral: true
      });
    }
    
    // Check if already registered
    const existingRegistration = await prisma.tournamentRegistration.findUnique({
      where: {
        tournamentId_userId: {
          tournamentId,
          userId: user.id
        }
      }
    });
    
    if (existingRegistration) {
      return interaction.reply({
        content: '❌ You are already registered for this tournament.',
        ephemeral: true
      });
    }
    
    if (partnerName) {
      // Extract Discord ID from mention format <@USER_ID> or <@!USER_ID>
      let partnerDiscordId = null;
      const mentionMatch = partnerName.match(/<@!?(\d+)>/);
      if (mentionMatch) {
        partnerDiscordId = mentionMatch[1];
      }
      
      // Find partner by Discord ID (if mentioned) or username
      let partner;
      if (partnerDiscordId) {
        partner = await prisma.user.findUnique({
          where: { discordId: partnerDiscordId }
        });
      } else {
        // Search by username
        partner = await prisma.user.findFirst({
          where: {
            username: {
              contains: partnerName,
              mode: 'insensitive'
            }
          }
        });
      }
      
      if (!partner) {
        return interaction.reply({
          content: `❌ Partner "${partnerName}" not found in the server. Make sure they have played at least one game.`,
          ephemeral: true
        });
      }
      
      if (partner.id === user.id) {
        return interaction.reply({
          content: '❌ You cannot partner with yourself.',
          ephemeral: true
        });
      }
      
      // Check if partner is already registered
      const partnerRegistration = await prisma.tournamentRegistration.findUnique({
        where: {
          tournamentId_userId: {
            tournamentId,
            userId: partner.id
          }
        }
      });
      
      if (partnerRegistration) {
        return interaction.reply({
          content: `❌ ${partner.username} is already registered for this tournament.`,
          ephemeral: true
        });
      }
      
      // Register both players as a complete team
      await prisma.tournamentRegistration.createMany({
        data: [
          {
            tournamentId,
            userId: user.id,
            partnerId: partner.id,
            isComplete: true
          },
          {
            tournamentId,
            userId: partner.id,
            partnerId: user.id,
            isComplete: true
          }
        ]
      });
      
      await interaction.reply({
        content: `✅ Successfully registered with ${partner.username} for the tournament!`,
        ephemeral: true
      });
      
    } else {
      // Register without partner (will be auto-assigned later)
      await prisma.tournamentRegistration.create({
        data: {
          tournamentId,
          userId: user.id,
          isComplete: false
        }
      });
      
      await interaction.reply({
        content: '✅ Successfully registered for the tournament! You will be auto-assigned a partner when registration closes.',
        ephemeral: true
      });
    }
    
    await updateTournamentEmbed(null, tournamentId);
    
  } catch (error) {
    console.error('[TOURNAMENT] Error handling modal:', error);
    await interaction.reply({
      content: '❌ An error occurred. Please try again.',
      ephemeral: true
    });
  }
}

// Tournament button handler
async function handleTournamentButton(interaction) {
  try {
    const customId = interaction.customId;
    const userId = interaction.user.id;
    
    // Extract tournamentId based on button type
    let tournamentId;
    if (customId.startsWith('join_tournament_')) {
      tournamentId = customId.replace('join_tournament_', '');
    } else if (customId.startsWith('register_tournament_')) {
      tournamentId = customId.replace('register_tournament_', '');
    } else if (customId.startsWith('unregister_tournament_')) {
      tournamentId = customId.replace('unregister_tournament_', '');
    } else if (customId.startsWith('cancel_registration_')) {
      tournamentId = customId.replace('cancel_registration_', '');
    } else if (customId.startsWith('view_tournament_lobby_')) {
      tournamentId = customId.replace('view_tournament_lobby_', '');
    } else if (customId.startsWith('tournament_open_search_')) {
      tournamentId = customId.replace('tournament_open_search_', '');
    } else if (customId.startsWith('tournament_show_full_list_')) {
      tournamentId = customId.replace('tournament_show_full_list_', '');
    } else {
      // For next/prev buttons, extract differently
      if (customId.startsWith('tournament_partner_next_')) {
        const remaining = customId.replace('tournament_partner_next_', '');
        const lastUnderscoreIndex = remaining.lastIndexOf('_');
        tournamentId = lastUnderscoreIndex !== -1 ? remaining.substring(0, lastUnderscoreIndex) : remaining;
      } else if (customId.startsWith('tournament_partner_prev_')) {
        const remaining = customId.replace('tournament_partner_prev_', '');
        const lastUnderscoreIndex = remaining.lastIndexOf('_');
        tournamentId = lastUnderscoreIndex !== -1 ? remaining.substring(0, lastUnderscoreIndex) : remaining;
      } else {
        tournamentId = customId.split('_').pop(); // Fallback
      }
    }
    
    console.log('[TOURNAMENT] Button click - customId:', customId, 'tournamentId:', tournamentId);
    
    if (!tournamentId || tournamentId.trim() === '') {
      console.error('[TOURNAMENT] CRITICAL: Empty tournamentId from button:', customId);
      return interaction.reply({
        content: '❌ Invalid tournament ID. Please try again.',
        ephemeral: true
      });
    }
    
    // Get or create user
    let user = await prisma.user.findUnique({
      where: { discordId: userId }
    });
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          discordId: userId,
          username: interaction.user.username,
          avatarUrl: interaction.user.avatarURL() || '/default-pfp.jpg',
          coins: 15000000 // Default coins
        }
      });
    }
    
    // Get tournament
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { registrations: true }
    });
    
    if (!tournament) {
      return interaction.reply({
        content: '❌ Tournament not found.',
        ephemeral: true
      });
    }
    
    if (tournament.status !== 'REGISTRATION_OPEN') {
      return interaction.reply({
        content: '❌ Registration is closed for this tournament.',
        ephemeral: true
      });
    }
    
    // Handle both old and new button IDs
    if (customId.startsWith('register_tournament_') || customId.startsWith('join_tournament_')) {
      // Check if already registered
      const existingRegistration = await prisma.tournamentRegistration.findUnique({
        where: {
          tournamentId_userId: {
            tournamentId,
            userId: user.id
          }
        }
      });
      
      if (existingRegistration) {
        return interaction.reply({
          content: '❌ You are already registered for this tournament.',
          ephemeral: true
        });
      }
      
      // Show select menu for partner selection (for partners tournaments)
      if (tournament.mode === 'PARTNERS') {
        // Defer reply immediately to prevent timeout
        await interaction.deferReply({ ephemeral: true });
        
        const { StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
        
        // Get all guild members
        const guild = interaction.guild;
        if (!guild) {
          return interaction.editReply({
            content: '❌ Could not access server members. Please try again.'
          });
        }
        
        // Use helper function to build options
        const { options, totalMembers, totalPages, currentPage, hasNext, hasPrevious } = await buildPartnerOptions(guild, userId, tournamentId, null, 25, 0);
        
        // Discord's StringSelectMenu has a hard limit of 25 options
        // If we have more than 25 members, we must use search or pagination
        if (totalMembers > 25) {
          const searchModal = new ModalBuilder()
            .setCustomId(`tournament_partner_search_${tournamentId}`)
            .setTitle('Search for Partner');
          
          const searchInput = new TextInputBuilder()
            .setCustomId('partner_search')
            .setLabel('Type to search for a partner')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('Start typing a name...');
          
          const actionRow = new ActionRowBuilder().addComponents(searchInput);
          searchModal.addComponents(actionRow);
          
          await interaction.editReply({
            content: `**Partner Selection**\n\n` +
              `There are **${totalMembers} members** in the server.\n\n` +
              `⚠️ **Discord limits dropdowns to 25 options**, so you must use search to find your partner.\n\n` +
              `**Click the search button below to find any member by name.**`,
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`tournament_open_search_${tournamentId}`)
                  .setLabel('🔍 Search for Partner')
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId(`tournament_show_full_list_${tournamentId}`)
                  .setLabel('📋 Show First 25 (A-Z)')
                  .setStyle(ButtonStyle.Secondary)
              )
            ]
          });
          
          return;
        }
        
        // If 25 or fewer options, show select menu directly
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`tournament_partner_select_${tournamentId}`)
          .setPlaceholder('Select a partner or choose auto-assign...')
          .addOptions(options);
        
        const components = [new ActionRowBuilder().addComponents(selectMenu)];
        
        // Add pagination buttons if needed
        if (totalPages > 1) {
          const paginationRow = new ActionRowBuilder();
          if (hasPrevious) {
            paginationRow.addComponents(
              new ButtonBuilder()
                .setCustomId(`tournament_partner_prev_${tournamentId}_0`)
                .setLabel('◀ Previous 25')
                .setStyle(ButtonStyle.Secondary)
            );
          }
          if (hasNext) {
            paginationRow.addComponents(
              new ButtonBuilder()
                .setCustomId(`tournament_partner_next_${tournamentId}_24`)
                .setLabel('Next 25 ▶')
                .setStyle(ButtonStyle.Secondary)
            );
          }
          if (paginationRow.components.length > 0) {
            components.push(paginationRow);
          }
        }
        
        await interaction.editReply({
          content: `**Select your partner:** (Page ${currentPage} of ${totalPages})\n\n` +
            '• Choose a player from the list (alphabetically sorted)\n' +
            '• Players with ✅ are already registered alone\n' +
            '• Players with ⚠️ are not yet registered (they will need to confirm)\n' +
            '• Players with ❌ are not in database (need to play first)\n' +
            '• Or select "No Partner" to be auto-assigned',
          components: components
        });
      } else {
        // Solo tournament - register directly
        await prisma.tournamentRegistration.create({
          data: {
            tournamentId,
            userId: user.id,
            isComplete: true
          }
        });
        
        await interaction.reply({
          content: '✅ Successfully registered for the tournament!',
          ephemeral: true
        });
        
        await updateTournamentEmbed(null, tournamentId);
      }
      
    } else if (customId.startsWith('cancel_registration_') || customId.startsWith('unregister_tournament_')) {
      // Defer reply since we need to do async operations
      await interaction.deferReply({ ephemeral: true });
      
      // Cancel registration
      const registration = await prisma.tournamentRegistration.findUnique({
        where: {
          tournamentId_userId: {
            tournamentId,
            userId: user.id
          }
        },
        include: { partner: true }
      });
      
      if (!registration) {
        return interaction.editReply({
          content: '❌ You are not registered for this tournament.'
        });
      }
      
      // Remove both players if it's a complete team
      if (registration.isComplete && registration.partnerId) {
        await prisma.tournamentRegistration.deleteMany({
          where: {
            tournamentId,
            OR: [
              { userId: user.id },
              { userId: registration.partnerId }
            ]
          }
        });
      } else {
        await prisma.tournamentRegistration.delete({
          where: { id: registration.id }
        });
      }
      
      await interaction.editReply({
        content: '✅ Registration cancelled.'
      });
      
      // Update embed in background (don't await to avoid blocking)
      updateTournamentEmbed(null, tournamentId).catch(err => {
        console.error('[TOURNAMENT] Error updating embed after unregister:', err);
      });
    } else if (customId.startsWith('tournament_open_search_')) {
      // Open search modal
      const tournamentId = customId.replace('tournament_open_search_', '');
      const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
      
      const searchModal = new ModalBuilder()
        .setCustomId(`tournament_partner_search_${tournamentId}`)
        .setTitle('Search for Partner');
      
      const searchInput = new TextInputBuilder()
        .setCustomId('partner_search')
        .setLabel('Type to search for a partner')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Start typing a name...');
      
      const actionRow = new ActionRowBuilder().addComponents(searchInput);
      searchModal.addComponents(actionRow);
      
      await interaction.showModal(searchModal);
    } else if (customId.startsWith('tournament_show_full_list_')) {
      // Show first 25 alphabetically
      await interaction.deferReply({ ephemeral: true });
      
      const tournamentId = customId.replace('tournament_show_full_list_', '');
      const guild = interaction.guild;
      
      if (!guild) {
        return interaction.editReply({
          content: '❌ Could not access server members. Please try again.'
        });
      }
      
      const userId = interaction.user.id;
      
      try {
        const { options, totalMembers, totalPages, currentPage, hasNext, hasPrevious, nextOffset } = await buildPartnerOptions(guild, userId, tournamentId, null, 25, 0);
      
        if (options.length === 0) {
          return interaction.editReply({
            content: '❌ No available partners found.'
          });
        }
        
        const { StringSelectMenuBuilder } = await import('discord.js');
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`tournament_partner_select_${tournamentId}`)
          .setPlaceholder('Select a partner or choose auto-assign...')
          .addOptions(options);
        
        const components = [new ActionRowBuilder().addComponents(selectMenu)];
        
        // Add pagination buttons if needed
        if (totalPages > 1 && hasNext && nextOffset !== null) {
          const paginationRow = new ActionRowBuilder();
          paginationRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`tournament_partner_next_${tournamentId}_${nextOffset}`)
              .setLabel('Next 25 ▶')
              .setStyle(ButtonStyle.Secondary)
          );
          components.push(paginationRow);
        }
        
        await interaction.editReply({
          content: `**Partners (Page ${currentPage} of ${totalPages}):**\n\n` +
            `Showing ${options.length} of ${totalMembers} total members.\n\n` +
            '• Players with ✅ are already registered alone\n' +
            '• Players with ⚠️ are not yet registered (they will need to confirm)\n' +
            '• Players with ❌ are not in database (need to play first)\n' +
            '• Or select "No Partner" to be auto-assigned\n\n' +
            '*Use the navigation buttons to see more members.*',
          components: components
        });
      } catch (error) {
        console.error('[TOURNAMENT] Error in show_full_list:', error);
        await interaction.editReply({
          content: '❌ Error loading members. The server may be too large. Please use the 🔍 Search button instead.'
        });
      }
    } else if (customId.startsWith('tournament_partner_next_')) {
      // Show next 25
      // Format: tournament_partner_next_<tournamentId>_<offset>
      await interaction.deferUpdate();
      
      const remaining = customId.replace('tournament_partner_next_', '');
      const lastUnderscoreIndex = remaining.lastIndexOf('_');
      if (lastUnderscoreIndex === -1) {
        return interaction.editReply({
          content: '❌ Invalid pagination button. Please try clicking "Join" again.',
          components: []
        });
      }
      const tournamentId = remaining.substring(0, lastUnderscoreIndex);
      const currentOffset = parseInt(remaining.substring(lastUnderscoreIndex + 1)) || 0;
      
      console.log('[TOURNAMENT] Next page - tournamentId:', tournamentId, 'offset:', currentOffset);
      
      const guild = interaction.guild;
      if (!guild) {
        return interaction.editReply({
          content: '❌ Could not access server members. Please try again.',
          components: []
        });
      }
      
      const userId = interaction.user.id;
      // Get current page info to calculate next offset
      const currentPageInfo = await buildPartnerOptions(guild, userId, tournamentId, null, 25, currentOffset);
      const newOffset = currentPageInfo.nextOffset || currentOffset;
      
      const { options, totalMembers, totalPages, currentPage, hasNext, hasPrevious, prevOffset } = await buildPartnerOptions(guild, userId, tournamentId, null, 25, newOffset);
      
      if (options.length === 0) {
        return interaction.editReply({
          content: '❌ No more partners available.',
          components: []
        });
      }
      
      const { StringSelectMenuBuilder } = await import('discord.js');
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`tournament_partner_select_${tournamentId}`)
        .setPlaceholder('Select a partner...')
        .addOptions(options);
      
      const components = [new ActionRowBuilder().addComponents(selectMenu)];
      
      // Add pagination buttons
      const paginationRow = new ActionRowBuilder();
      if (hasPrevious) {
        paginationRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`tournament_partner_prev_${tournamentId}_${newOffset - 1}`)
            .setLabel('◀ Previous 25')
            .setStyle(ButtonStyle.Secondary)
        );
      }
      if (hasNext) {
        paginationRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`tournament_partner_next_${tournamentId}_${newOffset}`)
            .setLabel('Next 25 ▶')
            .setStyle(ButtonStyle.Secondary)
        );
      }
      if (paginationRow.components.length > 0) {
        components.push(paginationRow);
      }
      
      await interaction.editReply({
        content: `**Partners (Page ${currentPage} of ${totalPages}):**\n\n` +
          `Showing ${options.length} of ${totalMembers} total members.\n\n` +
          '• Players with ✅ are already registered alone\n' +
          '• Players with ⚠️ are not yet registered (they will need to confirm)\n' +
          '• Players with ❌ are not in database (need to play first)',
        components: components
      });
    } else if (customId.startsWith('tournament_partner_prev_')) {
      // Show previous 25
      // Format: tournament_partner_prev_<tournamentId>_<offset>
      await interaction.deferUpdate();
      
      const remaining = customId.replace('tournament_partner_prev_', '');
      const lastUnderscoreIndex = remaining.lastIndexOf('_');
      if (lastUnderscoreIndex === -1) {
        return interaction.editReply({
          content: '❌ Invalid pagination button. Please try clicking "Join" again.',
          components: []
        });
      }
      const tournamentId = remaining.substring(0, lastUnderscoreIndex);
      const currentOffset = parseInt(remaining.substring(lastUnderscoreIndex + 1)) || 0;
      const newOffset = Math.max(0, currentOffset); // Use the provided offset (already calculated)
      
      console.log('[TOURNAMENT] Prev page - tournamentId:', tournamentId, 'offset:', newOffset);
      
      const guild = interaction.guild;
      if (!guild) {
        return interaction.editReply({
          content: '❌ Could not access server members. Please try again.',
          components: []
        });
      }
      
      const userId = interaction.user.id;
      const { options, totalMembers, totalPages, currentPage, hasNext, hasPrevious, nextOffset, prevOffset } = await buildPartnerOptions(guild, userId, tournamentId, null, 25, newOffset);
      
      if (options.length === 0) {
        return interaction.editReply({
          content: '❌ No partners available.',
          components: []
        });
      }
      
      const { StringSelectMenuBuilder } = await import('discord.js');
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`tournament_partner_select_${tournamentId}`)
        .setPlaceholder(newOffset === 0 ? 'Select a partner or choose auto-assign...' : 'Select a partner...')
        .addOptions(options);
      
      const components = [new ActionRowBuilder().addComponents(selectMenu)];
      
      // Add pagination buttons
      const paginationRow = new ActionRowBuilder();
      if (hasPrevious && prevOffset !== null) {
        paginationRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`tournament_partner_prev_${tournamentId}_${prevOffset}`)
            .setLabel('◀ Previous 25')
            .setStyle(ButtonStyle.Secondary)
        );
      }
      if (hasNext && nextOffset !== null) {
        paginationRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`tournament_partner_next_${tournamentId}_${nextOffset}`)
            .setLabel('Next 25 ▶')
            .setStyle(ButtonStyle.Secondary)
        );
      }
      if (paginationRow.components.length > 0) {
        components.push(paginationRow);
      }
      
      await interaction.editReply({
        content: `**Partners (Page ${currentPage} of ${totalPages}):**\n\n` +
          `Showing ${options.length} of ${totalMembers} total members.\n\n` +
          (newOffset === 0 ? '• Or select "No Partner" to be auto-assigned\n' : '') +
          '• Players with ✅ are already registered alone\n' +
          '• Players with ⚠️ are not yet registered (they will need to confirm)\n' +
          '• Players with ❌ are not in database (need to play first)',
        components: components
      });
    } else if (customId.startsWith('view_tournament_lobby_')) {
      // View lobby - send URL to tournament lobby page
      const clientUrl = process.env.CLIENT_URL || 'https://www.bux-spades.pro';
      const lobbyUrl = `${clientUrl}/tournament/${tournamentId}`;
      
      await interaction.reply({
        content: `🔗 **Tournament Lobby:**\n${lobbyUrl}\n\n*Note: Registration must be done via the Join button above.*`,
        ephemeral: true
      });
    } else if (customId.startsWith('tournament_confirm_partner_')) {
      // Confirm partner registration
      // Format: tournament_confirm_partner_<tournamentId>_<partnerDiscordId>
      await interaction.deferUpdate();
      
      const prefix = 'tournament_confirm_partner_';
      const remaining = customId.substring(prefix.length);
      const lastUnderscoreIndex = remaining.lastIndexOf('_');
      
      if (lastUnderscoreIndex === -1) {
        console.error('[TOURNAMENT] Invalid confirm button format:', customId);
        return interaction.editReply({
          content: '❌ Invalid button format. Please click "Join" again.',
          components: []
        });
      }
      
      const tournamentId = remaining.substring(0, lastUnderscoreIndex);
      const partnerDiscordId = remaining.substring(lastUnderscoreIndex + 1);
      
      console.log('[TOURNAMENT] Confirm partner - customId:', customId);
      console.log('[TOURNAMENT] Confirm partner - extracted tournamentId:', tournamentId, 'Length:', tournamentId.length);
      console.log('[TOURNAMENT] Confirm partner - extracted partnerDiscordId:', partnerDiscordId);
      
      if (!tournamentId || tournamentId.trim() === '') {
        console.error('[TOURNAMENT] Empty tournamentId from confirm button:', customId);
        return interaction.editReply({
          content: '❌ Invalid tournament ID. Please click "Join" again.',
          components: []
        });
      }
      
      // Get user
      let user = await prisma.user.findUnique({
        where: { discordId: userId }
      });
      
      if (!user) {
        return interaction.editReply({
          content: '❌ User not found. Please try again.',
          components: []
        });
      }
      
      // Get partner
      const partner = await prisma.user.findUnique({
        where: { discordId: partnerDiscordId }
      });
      
      if (!partner) {
        return interaction.editReply({
          content: '❌ Partner not found.',
          components: []
        });
      }
      
      // Get tournament
      console.log('[TOURNAMENT] Confirm partner - looking up tournament:', tournamentId);
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: { registrations: true }
      });
      
      if (!tournament) {
        console.error('[TOURNAMENT] Confirm partner - tournament not found:', tournamentId);
        return interaction.editReply({
          content: `❌ Tournament not found. Please click "Join" again from the tournament embed.`,
          components: []
        });
      }
      
      if (tournament.status !== 'REGISTRATION_OPEN') {
        return interaction.editReply({
          content: '❌ Registration is closed for this tournament.',
          components: []
        });
      }
      
      // Check if already registered
      const existingRegistration = await prisma.tournamentRegistration.findUnique({
        where: {
          tournamentId_userId: {
            tournamentId,
            userId: user.id
          }
        }
      });
      
      if (existingRegistration) {
        return interaction.editReply({
          content: '❌ You are already registered for this tournament.',
          components: []
        });
      }
      
      // Check if partner is now registered
      const partnerRegistration = await prisma.tournamentRegistration.findUnique({
        where: {
          tournamentId_userId: {
            tournamentId,
            userId: partner.id
          }
        }
      });
      
      if (partnerRegistration && partnerRegistration.partnerId && partnerRegistration.isComplete) {
        return interaction.editReply({
          content: `❌ ${partner.username} is already registered with a partner.`,
          components: []
        });
      }
      
      // Register both players
      await prisma.tournamentRegistration.createMany({
        data: [
          {
            tournamentId,
            userId: user.id,
            partnerId: partner.id,
            isComplete: true
          },
          {
            tournamentId,
            userId: partner.id,
            partnerId: user.id,
            isComplete: true
          }
        ],
        skipDuplicates: true
      });
      
      // If partner was registered alone, update their registration
      if (partnerRegistration && !partnerRegistration.partnerId) {
        await prisma.tournamentRegistration.update({
          where: { id: partnerRegistration.id },
          data: {
            partnerId: user.id,
            isComplete: true
          }
        });
      }
      
      await interaction.editReply({
        content: `✅ Successfully registered with ${partner.username} for the tournament!\n\n<@${partnerDiscordId}> has been automatically registered as your partner.`,
        components: []
      });
      
      await updateTournamentEmbed(null, tournamentId);
    } else if (customId.startsWith('tournament_cancel_partner_')) {
      // Cancel partner selection
      await interaction.deferUpdate();
      
      // Just cancel - no need to extract tournamentId
      await interaction.editReply({
        content: '❌ Partner selection cancelled.',
        components: []
      });
    }
    
  } catch (error) {
    console.error('[TOURNAMENT] Error handling button:', error);
    await interaction.reply({
      content: '❌ An error occurred. Please try again.',
      ephemeral: true
    });
  }
}

// Update tournament embed with current registration stats
async function updateTournamentEmbed(interaction, tournamentId) {
  try {
    const { DiscordTournamentService } = await import('../../services/DiscordTournamentService.js');
    const { TournamentService } = await import('../../services/TournamentService.js');
    
    const tournament = await TournamentService.getTournament(tournamentId);
    if (!tournament || !tournament.discordMessageId) {
      console.warn('[TOURNAMENT] Cannot update embed - tournament or Discord message ID missing');
      return;
    }
    
    // Use DiscordTournamentService to update the embed
    const { client } = await import('../bot.js');
    if (client && client.isReady()) {
      await DiscordTournamentService.updateTournamentEmbed(client, tournament);
    } else {
      console.warn('[TOURNAMENT] Discord client not ready, cannot update embed');
    }
    
  } catch (error) {
    console.error('[TOURNAMENT] Error updating embed:', error);
  }
}

// Tournament creation removed - tournaments can only be created via admin panel
