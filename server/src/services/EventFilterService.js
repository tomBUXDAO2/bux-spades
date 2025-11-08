export class EventFilterService {
  static normalizeValue(value) {
    if (typeof value === 'string') {
      return value.toUpperCase();
    }
    return value;
  }

  static normalizeArray(values = []) {
    if (!Array.isArray(values)) return [];
    return values
      .map((value) => this.normalizeValue(value))
      .filter((value) => value !== undefined && value !== null && value !== '');
  }

  static evaluate(filters, payload = {}) {
    if (!filters || filters.allowAll) {
      return { allowed: true };
    }

    const {
      channelId,
      coins,
      format,
      mode,
      minPoints,
      maxPoints,
      specialRule1,
      specialRule2,
      gimmickVariant,
      nilAllowed,
      blindNilAllowed,
    } = payload;

    const normalizedFormat = this.normalizeValue(format);
    const normalizedMode = this.normalizeValue(mode);
    const normalizedSpecialRule1 = this.normalizeValue(specialRule1);
    const normalizedSpecialRule2 = this.normalizeValue(specialRule2);
    const normalizedGimmickVariant = this.normalizeValue(gimmickVariant);

    const formatList = this.normalizeArray(filters.allowedFormats || filters.formats);
    if (formatList.length && !formatList.includes(normalizedFormat)) {
      return {
        allowed: false,
        reason: `This event only allows formats: ${formatList.join(', ')}`,
      };
    }

    const modeList = this.normalizeArray(filters.allowedModes || filters.modes);
    if (modeList.length && !modeList.includes(normalizedMode)) {
      return {
        allowed: false,
        reason: `This event only allows modes: ${modeList.join(', ')}`,
      };
    }

    const gimmickList = this.normalizeArray(filters.allowedGimmickVariants || filters.gimmickVariants);
    if (gimmickList.length && normalizedGimmickVariant && !gimmickList.includes(normalizedGimmickVariant)) {
      return {
        allowed: false,
        reason: `This event only allows gimmick variants: ${gimmickList.join(', ')}`,
      };
    }

    const special1List = this.normalizeArray(filters.allowedSpecialRule1 || filters.specialRule1);
    if (special1List.length && normalizedSpecialRule1 && !special1List.includes(normalizedSpecialRule1)) {
      return {
        allowed: false,
        reason: `Special rule 1 must be one of: ${special1List.join(', ')}`,
      };
    }

    const special2List = this.normalizeArray(filters.allowedSpecialRule2 || filters.specialRule2);
    if (special2List.length && normalizedSpecialRule2 && !special2List.includes(normalizedSpecialRule2)) {
      return {
        allowed: false,
        reason: `Special rule 2 must be one of: ${special2List.join(', ')}`,
      };
    }

    if (filters.nilAllowed !== undefined && filters.nilAllowed !== null) {
      const expectedNil = Boolean(filters.nilAllowed);
      if (Boolean(nilAllowed) !== expectedNil) {
        return {
          allowed: false,
          reason: `Nil bids must be ${expectedNil ? 'enabled' : 'disabled'} for this event`,
        };
      }
    }

    if (filters.blindNilAllowed !== undefined && filters.blindNilAllowed !== null) {
      const expectedBlindNil = Boolean(filters.blindNilAllowed);
      if (Boolean(blindNilAllowed) !== expectedBlindNil) {
        return {
          allowed: false,
          reason: `Blind Nil must be ${expectedBlindNil ? 'enabled' : 'disabled'} for this event`,
        };
      }
    }

    if (filters.allowedRooms && Array.isArray(filters.allowedRooms) && filters.allowedRooms.length) {
      if (!filters.allowedRooms.includes(channelId)) {
        return {
          allowed: false,
          reason: 'This command can only be used in the designated event channel.',
        };
      }
    }

    if (filters.minCoins !== undefined && filters.minCoins !== null) {
      if (coins < Number(filters.minCoins)) {
        return {
          allowed: false,
          reason: `Buy-in must be at least ${Number(filters.minCoins).toLocaleString()} coins.`,
        };
      }
    }

    if (filters.maxCoins !== undefined && filters.maxCoins !== null) {
      if (coins > Number(filters.maxCoins)) {
        return {
          allowed: false,
          reason: `Buy-in must be no more than ${Number(filters.maxCoins).toLocaleString()} coins.`,
        };
      }
    }

    if (Array.isArray(filters.coins) && filters.coins.length) {
      const coinValues = filters.coins.map((value) => Number(value));
      if (!coinValues.includes(coins)) {
        return {
          allowed: false,
          reason: `Buy-in must be one of: ${coinValues.map((value) => value.toLocaleString()).join(', ')}`,
        };
      }
    }

    const allowedMinPoints = Array.isArray(filters.minPoints) ? filters.minPoints : filters.allowedMinPoints;
    if (Array.isArray(allowedMinPoints) && allowedMinPoints.length) {
      if (!allowedMinPoints.includes(minPoints)) {
        return {
          allowed: false,
          reason: `Minimum points must be one of: ${allowedMinPoints.join(', ')}`,
        };
      }
    } else if (filters.minPoints !== undefined && filters.minPoints !== null && !Array.isArray(filters.minPoints)) {
      if (minPoints !== Number(filters.minPoints)) {
        return {
          allowed: false,
          reason: `Minimum points must be ${Number(filters.minPoints)}`,
        };
      }
    }

    const allowedMaxPoints = Array.isArray(filters.maxPoints) ? filters.maxPoints : filters.allowedMaxPoints;
    if (Array.isArray(allowedMaxPoints) && allowedMaxPoints.length) {
      if (!allowedMaxPoints.includes(maxPoints)) {
        return {
          allowed: false,
          reason: `Maximum points must be one of: ${allowedMaxPoints.join(', ')}`,
        };
      }
    } else if (filters.maxPoints !== undefined && filters.maxPoints !== null && !Array.isArray(filters.maxPoints)) {
      if (maxPoints !== Number(filters.maxPoints)) {
        return {
          allowed: false,
          reason: `Maximum points must be ${Number(filters.maxPoints)}`,
        };
      }
    }

    if (Array.isArray(filters.exactGames) && filters.exactGames.length) {
      const matched = filters.exactGames.some((match) => {
        const normalizedMatch = Object.entries(match || {}).reduce((acc, [key, value]) => {
          acc[key] = this.normalizeValue(value);
          return acc;
        }, {});

        const checks = [
          normalizedMatch.format ? normalizedMatch.format === normalizedFormat : true,
          normalizedMatch.mode ? normalizedMatch.mode === normalizedMode : true,
          normalizedMatch.gimmickVariant ? normalizedMatch.gimmickVariant === normalizedGimmickVariant : true,
          normalizedMatch.specialRule1 ? normalizedMatch.specialRule1 === normalizedSpecialRule1 : true,
          normalizedMatch.specialRule2 ? normalizedMatch.specialRule2 === normalizedSpecialRule2 : true,
          normalizedMatch.coins ? Number(normalizedMatch.coins) === coins : true,
          normalizedMatch.minPoints ? Number(normalizedMatch.minPoints) === minPoints : true,
          normalizedMatch.maxPoints ? Number(normalizedMatch.maxPoints) === maxPoints : true,
          normalizedMatch.nilAllowed !== undefined
            ? Boolean(normalizedMatch.nilAllowed) === Boolean(nilAllowed)
            : true,
          normalizedMatch.blindNilAllowed !== undefined
            ? Boolean(normalizedMatch.blindNilAllowed) === Boolean(blindNilAllowed)
            : true,
        ];

        return checks.every(Boolean);
      });

      if (!matched) {
        return {
          allowed: false,
          reason: 'That combination does not match any event game lines. Please use one of the approved configurations.',
        };
      }
    }

    return { allowed: true };
  }
}

export default EventFilterService;

