import { GameFormat, GimmickType, GameFormatConfig } from './gameFormatTypes';

/**
 * Creates game format configuration from settings
 */
export function createGameFormatConfig(settings: any): GameFormatConfig {
  const format = determineGameFormat(settings.biddingOption);
  const gimmickType = determineGimmickType(settings.biddingOption);
  
  // Handle specialRules - it can be an object or array
  let specialRules: string[] = [];
  if (settings.specialRules) {
    if (Array.isArray(settings.specialRules)) {
      specialRules = settings.specialRules;
    } else if (typeof settings.specialRules === 'object') {
      // Convert object to array of rule names
      specialRules = Object.keys(settings.specialRules).filter(key => settings.specialRules[key] === true);
    }
  }
  
  return {
    format,
    gimmickType: format === 'GIMMICK' ? gimmickType : undefined,
    allowNil: settings.allowNil !== false,
    allowBlindNil: settings.allowBlindNil === true,
    specialRules
  };
}

/**
 * Determines game format from bidding option
 */
function determineGameFormat(biddingOption: string): GameFormat {
  const option = biddingOption.toUpperCase();
  
  if (option === 'WHIZ') {
    return 'WHIZ';
  } else if (option === 'MIRROR' || option === 'MIRRORS') {
    return 'MIRROR';
  } else if (['SUICIDE', 'BID_4_OR_NIL', 'BID_3', 'BID_HEARTS', 'CRAZY_ACES'].includes(option)) {
    return 'GIMMICK';
  } else {
    return 'REGULAR';
  }
}

/**
 * Determines gimmick type from bidding option
 */
function determineGimmickType(biddingOption: string): GimmickType | undefined {
  const option = biddingOption.toUpperCase();
  
  switch (option) {
    case 'SUICIDE':
      return 'SUICIDE';
    case 'BID_4_OR_NIL':
    case '4 OR NIL':
      return 'BID_4_OR_NIL';
    case 'BID_3':
    case 'BID3':
      return 'BID_3';
    case 'BID_HEARTS':
    case 'BID HEARTS':
      return 'BID_HEARTS';
    case 'CRAZY_ACES':
    case 'CRAZY ACES':
      return 'CRAZY_ACES';
    default:
      return undefined;
  }
}
