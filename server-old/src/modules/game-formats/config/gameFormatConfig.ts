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
  
  // Determine allowNil / allowBlindNil from either top-level or specialRules object
  const allowNilFlag = typeof settings.allowNil === 'boolean'
    ? settings.allowNil
    : (settings.specialRules && typeof settings.specialRules.allowNil === 'boolean')
      ? settings.specialRules.allowNil
      : true; // default allowNil true

  const allowBlindNilFlag = typeof settings.allowBlindNil === 'boolean'
    ? settings.allowBlindNil
    : (settings.specialRules && typeof settings.specialRules.allowBlindNil === 'boolean')
      ? settings.specialRules.allowBlindNil
      : false; // default blind nil false
  
  return {
    format,
    gimmickType: format === 'GIMMICK' ? gimmickType : undefined,
    allowNil: allowNilFlag,
    allowBlindNil: allowBlindNilFlag,
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
  } else if ([ 'SUICIDE', 'BID_4_OR_NIL', 'BID_3', 'BID_HEARTS', 'CRAZY_ACES', '4 OR NIL', 'BID 3', 'BID HEARTS', 'CRAZY ACES' ].includes(option)) {
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
  
  if (option === 'SUICIDE' || option === 'BID_4_OR_NIL' || option === '4 OR NIL') {
    return 'BID_4_OR_NIL';
  } else if (option === 'BID_3' || option === 'BID 3') {
    return 'BID_3';
  } else if (option === 'BID_HEARTS' || option === 'BID HEARTS') {
    return 'BID_HEARTS';
  } else if (option === 'CRAZY_ACES' || option === 'CRAZY ACES') {
    return 'CRAZY_ACES';
  } else if (option === 'SUICIDE') {
    return 'SUICIDE';
  }
  
  return undefined;
}
