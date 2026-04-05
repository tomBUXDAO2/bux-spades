/**
 * Expert Spades bot policy — card play from user-specified rules.
 * Uses full trick history + optional all-four hands (Redis) for voids and counts.
 */

const RANK_ORDER = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  J: 11, Q: 12, K: 13, A: 14
};

export function cardValue(rank) {
  return RANK_ORDER[rank] ?? 0;
}

export function normalizeCard(card) {
  if (typeof card === 'string') {
    const m = card.match(/^([A-Z]+)([0-9AQJK]{1,2})$/i);
    if (m) {
      const suit = m[1].toUpperCase();
      const rank = m[2].toUpperCase() === '0' ? '10' : m[2].toUpperCase();
      return { suit, rank };
    }
    return { suit: card.slice(0, -1).toUpperCase(), rank: card.slice(-1).toUpperCase() };
  }
  return { suit: card.suit, rank: card.rank };
}

function sortAsc(cards) {
  return [...cards].sort((a, b) => cardValue(a.rank) - cardValue(b.rank));
}

function sortDesc(cards) {
  return [...cards].sort((a, b) => cardValue(b.rank) - cardValue(a.rank));
}

/** Sum bids; nil = 0 */
export function tableBidTotalFromBids(bidsBySeat) {
  if (!bidsBySeat || !bidsBySeat.length) return 0;
  return bidsBySeat.reduce((sum, b) => {
    if (b === null || b === undefined || b === '') return sum;
    const n = Number(b);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

export function isNilBid(b) {
  if (b === null || b === undefined || b === '') return false;
  return Number(b) === 0;
}

export function collectPlayedCards(game, currentTrick) {
  const out = [];
  const completed = game?.play?.completedTricks || [];
  for (const t of completed) {
    for (const c of t.cards || []) {
      out.push({
        suit: c.suit,
        rank: c.rank,
        seatIndex: c.seatIndex
      });
    }
  }
  for (const c of currentTrick || []) {
    out.push({
      suit: c.suit,
      rank: c.rank,
      seatIndex: c.seatIndex
    });
  }
  return out;
}

/** Known voids: seat -> Set of suits they proved void in */
export function inferVoidsFromTricks(game, currentTrick) {
  const voids = [0, 1, 2, 3].map(() => new Set());
  const processTrick = (cards) => {
    if (!cards || cards.length === 0) return;
    const leadSuit = cards[0].suit;
    for (const c of cards) {
      if (c.seatIndex == null) continue;
      if (c.suit !== leadSuit) {
        voids[c.seatIndex].add(leadSuit);
      }
    }
  };
  for (const t of game?.play?.completedTricks || []) {
    processTrick(t.cards || []);
  }
  processTrick(currentTrick || []);
  return voids;
}

export function provisionalWinnerSeat(trick) {
  if (!trick || trick.length === 0) return null;
  const leadSuit = trick[0].suit;
  const spades = trick.filter((c) => c.suit === 'SPADES');
  const pool = spades.length > 0 ? spades : trick.filter((c) => c.suit === leadSuit);
  if (pool.length === 0) return trick[0].seatIndex;
  return pool.reduce((best, c) => (cardValue(c.rank) > cardValue(best.rank) ? c : best)).seatIndex;
}

export function wouldWinWithCard(trick, card, seatIndex) {
  const hyp = trick.concat([{ suit: card.suit, rank: card.rank, seatIndex }]);
  return provisionalWinnerSeat(hyp) === seatIndex;
}

export function highestInSuit(trick, suit) {
  const inS = trick.filter((c) => c.suit === suit);
  if (!inS.length) return null;
  return sortDesc(inS)[0];
}

export function minimalWinningInLeadSuit(trick, hand, leadSuit) {
  const leadCards = hand.filter((c) => c.suit === leadSuit);
  if (!leadCards.length) return null;
  // Trumped side-suit lead: spades in trick beat lead suit — can't win with lead suit
  if (leadSuit !== 'SPADES' && trick.some((c) => c.suit === 'SPADES')) {
    return null;
  }
  const hi = highestInSuit(trick, leadSuit);
  const need = hi ? cardValue(hi.rank) : 0;
  for (const c of sortAsc(leadCards)) {
    if (cardValue(c.rank) > need) return c;
  }
  return null;
}

export function minimalWinningSpade(trick, hand) {
  const spades = sortAsc(hand.filter((c) => c.suit === 'SPADES'));
  if (!spades.length) return null;
  const trickSpades = sortAsc(trick.filter((c) => c.suit === 'SPADES'));
  if (!trickSpades.length) return spades[0];
  const top = trickSpades[trickSpades.length - 1];
  const need = cardValue(top.rank);
  for (const s of spades) {
    if (cardValue(s.rank) > need) return s;
  }
  return null;
}

export function nilPickHighestLosing(trick, seatIndex, legalCards) {
  if (!legalCards?.length) return null;
  for (const c of sortDesc(legalCards)) {
    if (!wouldWinWithCard(trick, c, seatIndex)) return c;
  }
  return sortAsc(legalCards)[0];
}

/** Median spade by rank (for “mid spade” cut) */
export function pickMidSpade(spades) {
  const s = sortAsc(spades);
  if (!s.length) return null;
  return s[Math.floor((s.length - 1) / 2)];
}

/** Count times seat followed (played) lead suit S in completed tricks */
export function countNilFollowsInSuit(game, nilSeat, suit) {
  let n = 0;
  for (const t of game?.play?.completedTricks || []) {
    const cards = t.cards || [];
    if (cards.length < 2) continue;
    const leadSuit = cards[0].suit;
    if (leadSuit !== suit) continue;
    const played = cards.find((c) => c.seatIndex === nilSeat);
    if (played && played.suit === leadSuit) n++;
  }
  return n;
}

export function buildExpertContext(base) {
  const trick = base.trick || [];
  const isLeading = trick.length === 0;
  const leadSuit = isLeading ? null : trick[0].suit;
  const partnerSeat = base.partnerSeat ?? (base.seatIndex + 2) % 4;
  const partnerHasPlayed = trick.some((c) => c.seatIndex === partnerSeat);

  const {
    game,
    seatIndex,
    hand,
    spadesBroken,
    bidsBySeat,
    allHands
  } = { ...base, trick, isLeading, leadSuit, partnerSeat, partnerHasPlayed };

  const tableTotal = tableBidTotalFromBids(bidsBySeat);
  const takeAllMode = tableTotal >= 11;
  const cautiousMode = tableTotal <= 10;
  const aggressiveTable = tableTotal >= 12;

  const myBid = bidsBySeat[seatIndex];
  const partnerBid = bidsBySeat[partnerSeat];
  const selfNil = isNilBid(myBid);
  const partnerNil = isNilBid(partnerBid);

  const oppSeats = [0, 1, 2, 3].filter((s) => s !== seatIndex && s !== partnerSeat);
  const oppNilSeat = oppSeats.find((s) => isNilBid(bidsBySeat[s])) ?? null;

  const nilSeats = [0, 1, 2, 3].filter((s) => isNilBid(bidsBySeat[s]));
  const team0Nil = nilSeats.some((s) => s % 2 === 0);
  const team1Nil = nilSeats.some((s) => s % 2 === 1);
  const doubleNil = team0Nil && team1Nil;

  const myTeamKey = seatIndex % 2;
  const t1 = game.team1TotalScore ?? 0;
  const t2 = game.team2TotalScore ?? 0;
  const myScore = myTeamKey === 0 ? t1 : t2;
  const oppScore = myTeamKey === 0 ? t2 : t1;
  const weAreAhead = myScore > oppScore;

  const played = collectPlayedCards(game, trick);
  const voids = inferVoidsFromTricks(game, trick);

  const teamKey = seatIndex % 2;
  const myTeamBags =
    teamKey === 0 ? game.team1Bags ?? 0 : game.team2Bags ?? 0;
  const bagPressure = myTeamBags >= 8;

  const trickWins = game.trickWins || [0, 0, 0, 0];
  const teamTricks = (trickWins[seatIndex] || 0) + (trickWins[partnerSeat] || 0);
  const teamBid =
    (Number.isFinite(Number(myBid)) ? Number(myBid) : 0) +
    (Number.isFinite(Number(partnerBid)) ? Number(partnerBid) : 0);
  const contractLocked = cautiousMode && teamTricks >= teamBid;
  const tricksCompletedCount = (game?.play?.completedTricks || []).length;
  const isFirstTrickOfHand = tricksCompletedCount === 0;

  const partnerVoidSuits = voids[partnerSeat] || new Set();

  return {
    ...base,
    trick,
    isLeading,
    leadSuit,
    partnerSeat,
    partnerHasPlayed,
    tableTotal,
    takeAllMode,
    cautiousMode,
    aggressiveTable,
    selfNil,
    partnerNil,
    oppNilSeat,
    doubleNil,
    weAreAhead,
    played,
    voids,
    partnerVoidSuits,
    bagPressure,
    teamTricks,
    teamBid,
    contractLocked,
    tricksCompletedCount,
    isFirstTrickOfHand,
    allHands: allHands || null
  };
}

function partnerWinning(trick, partnerSeat) {
  return trick.length > 0 && provisionalWinnerSeat(trick) === partnerSeat;
}

function oppNilWinning(trick, oppNilSeat) {
  return oppNilSeat != null && trick.length && provisionalWinnerSeat(trick) === oppNilSeat;
}

/** Spades remaining in play (approx): 13 minus spades seen */
export function spadesRemainingCount(played, hand) {
  const seen = new Set();
  for (const c of played) {
    if (c.suit === 'SPADES') seen.add(`${c.rank}`);
  }
  for (const c of hand) {
    if (normalizeCard(c).suit === 'SPADES') seen.add(`${normalizeCard(c).rank}`);
  }
  return 13 - seen.size;
}

// --- Play branches ---

function playSelfNil(ctx) {
  const { hand, trick, seatIndex, leadSuit, isLeading, takeAllMode, cautiousMode } = ctx;
  if (isLeading) {
    const nonSp = sortAsc(hand.filter((c) => c.suit !== 'SPADES'));
    if (nonSp.length) return nonSp[0];
    return sortAsc(hand)[0];
  }
  const follow = hand.filter((c) => c.suit === leadSuit);
  if (follow.length) {
    const pick = nilPickHighestLosing(trick, seatIndex, follow);
    return pick || sortAsc(follow)[0];
  }
  const trickHasSpade = trick.some((c) => c.suit === 'SPADES');
  const mySp = hand.filter((c) => c.suit === 'SPADES');
  const myNon = hand.filter((c) => c.suit !== 'SPADES');
  if (!trickHasSpade && myNon.length) {
    return sortDesc(myNon)[0];
  }
  if (mySp.length) {
    const pick = nilPickHighestLosing(trick, seatIndex, mySp);
    if (pick) return pick;
    if (cautiousMode) {
      const mustWin = mySp.every((c) => wouldWinWithCard(trick, c, seatIndex));
      if (mustWin) return sortDesc(mySp)[0];
    }
    if (takeAllMode) {
      const w = minimalWinningSpade(trick, hand);
      if (w) return w;
    }
    return sortAsc(mySp)[0];
  }
  return sortDesc(hand)[0];
}

function playCoverNil(ctx) {
  const {
    hand,
    trick,
    seatIndex,
    partnerSeat,
    leadSuit,
    isLeading,
    spadesBroken,
    partnerVoidSuits,
    aggressiveTable,
    partnerHasPlayed
  } = ctx;

  if (isLeading) {
    const suits = groupBySuit(hand);
    const nonSp = ['HEARTS', 'DIAMONDS', 'CLUBS'];
    for (const s of nonSp) {
      if (partnerVoidSuits.has(s)) {
        const cards = sortDesc(suits[s] || []);
        if (cards.length) return cards[0];
      }
    }
    for (const s of nonSp) {
      const ace = (suits[s] || []).find((c) => c.rank === 'A');
      if (ace) return ace;
    }
    for (const s of nonSp) {
      const cards = sortDesc(suits[s] || []);
      if (cards.length) return cards[0];
    }
    if (spadesBroken && (suits.SPADES || []).length) {
      return sortDesc(suits.SPADES)[0];
    }
    return sortDesc(hand)[0];
  }

  if (partnerHasPlayed) {
    const nilWinning = partnerWinning(trick, partnerSeat);
    if (!nilWinning) {
      if (aggressiveTable) {
        const w = minimalWinningInLeadSuit(trick, hand, leadSuit);
        if (w) return w;
        const sp = minimalWinningSpade(trick, hand);
        if (sp) return sp;
      }
      const leadCards = hand.filter((c) => c.suit === leadSuit);
      if (leadCards.length) return sortAsc(leadCards)[0];
      const nonSp = sortAsc(hand.filter((c) => c.suit !== 'SPADES'));
      return (nonSp.length ? nonSp : sortAsc(hand))[0];
    }
    // Nil partner is winning the trick — must take it if possible (e.g. spade lead + nil played 8♠, we have 10♠)
    const leadCards = hand.filter((c) => c.suit === leadSuit);
    if (leadCards.length) {
      const q = leadCards.find((c) => c.rank === 'Q');
      const k = leadCards.find((c) => c.rank === 'K');
      const a = leadCards.find((c) => c.rank === 'A');
      if (q && k && a) return q;
      let win = minimalWinningInLeadSuit(trick, hand, leadSuit);
      if (!win && leadSuit === 'SPADES') {
        win = minimalWinningSpade(trick, hand);
      }
      if (win) return win;
      for (const c of sortDesc(leadCards)) {
        if (wouldWinWithCard(trick, c, seatIndex)) return c;
      }
      return sortAsc(leadCards)[0];
    }
    const cut = minimalWinningSpade(trick, hand);
    if (cut) return cut;
    const nonSp = sortAsc(hand.filter((c) => c.suit !== 'SPADES'));
    return (nonSp.length ? nonSp : sortAsc(hand))[0];
  }

  const nilLed = trick.length && trick[0].seatIndex === partnerSeat;
  const leadCards = hand.filter((c) => c.suit === leadSuit);
  if (leadCards.length) {
    if (nilLed) return sortAsc(leadCards)[0];
    const win = minimalWinningInLeadSuit(trick, hand, leadSuit);
    if (win) return win;
    return sortDesc(leadCards)[0];
  }
  const spades = hand.filter((c) => c.suit === 'SPADES');
  const nonSp = hand.filter((c) => c.suit !== 'SPADES');
  if (nilLed) {
    if (nonSp.length) return sortAsc(nonSp)[0];
    const pick = nilPickHighestLosing(trick, seatIndex, spades);
    if (pick) return pick;
    return spades.length ? sortAsc(spades)[0] : sortAsc(hand)[0];
  }
  const cut = minimalWinningSpade(trick, hand);
  if (cut) return cut;
  return spades.length ? sortAsc(spades)[0] : sortAsc(nonSp.length ? nonSp : hand)[0];
}

function playDefendOppNil(ctx) {
  const {
    hand,
    trick,
    seatIndex,
    partnerSeat,
    leadSuit,
    isLeading,
    spadesBroken,
    oppNilSeat,
    takeAllMode,
    game,
    cautiousMode
  } = ctx;

  if (isLeading) {
    const suits = groupBySuit(hand);
    const nonSp = ['HEARTS', 'DIAMONDS', 'CLUBS'];
    const scored = nonSp
      .map((s) => ({
        suit: s,
        score: countNilFollowsInSuit(game, oppNilSeat, s),
        voided: (ctx.voids[oppNilSeat] || new Set()).has(s)
      }))
      .filter((x) => !x.voided)
      .sort((a, b) => b.score - a.score);
    for (const { suit } of scored) {
      const ace = (suits[suit] || []).find((c) => c.rank === 'A');
      if (ace) return ace;
    }
    for (const s of nonSp) {
      if ((ctx.voids[oppNilSeat] || new Set()).has(s)) continue;
      const cards = sortDesc(suits[s] || []);
      if (cards.length) return cards[0];
    }
    return sortAsc(
      hand.filter((c) => c.suit !== 'SPADES' || spadesBroken)
    )[0] || sortAsc(hand)[0];
  }

  if (oppNilWinning(trick, oppNilSeat)) {
    const leadCards = hand.filter((c) => c.suit === leadSuit);
    if (leadCards.length) {
      const los = leadCards.filter((c) => !wouldWinWithCard(trick, c, seatIndex));
      if (los.length) return sortAsc(los)[0];
      return sortAsc(leadCards)[0];
    }
    const nonSp = sortDesc(hand.filter((c) => c.suit !== 'SPADES'));
    if (nonSp.length) return nonSp[0];
    if (!spadesBroken) {
      const sp = hand.filter((c) => c.suit === 'SPADES');
      return sp.length ? sortAsc(sp)[0] : sortAsc(hand)[0];
    }
    return sortAsc(hand)[0];
  }

  const leadCards = hand.filter((c) => c.suit === leadSuit);
  if (leadCards.length) {
    if (partnerWinning(trick, partnerSeat)) return sortAsc(leadCards)[0];
    const win = minimalWinningInLeadSuit(trick, hand, leadSuit);
    if (win) return win;
    return takeAllMode ? sortDesc(leadCards)[0] : sortAsc(leadCards)[0];
  }

  if (!spadesBroken) {
    const nonSp = sortDesc(hand.filter((c) => c.suit !== 'SPADES'));
    if (nonSp.length) return nonSp[0];
  }
  if (takeAllMode) {
    const cut = minimalWinningSpade(trick, hand);
    if (cut) return cut;
  }
  const sp = hand.filter((c) => c.suit === 'SPADES');
  if (cautiousMode && partnerWinning(trick, partnerSeat) && sp.length && !spadesBroken) {
    const mid = pickMidSpade(sp);
    if (mid) return mid;
  }
  if (sp.length && spadesBroken) {
    const cut = minimalWinningSpade(trick, hand);
    if (cut) return cut;
    return sortAsc(sp)[0];
  }
  return sortAsc(hand.filter((c) => c.suit !== 'SPADES'))[0] || sortAsc(hand)[0];
}

function playAggressive(ctx) {
  const { hand, trick, partnerSeat, leadSuit, isLeading, spadesBroken, seatIndex } = ctx;
  if (isLeading) {
    const suits = groupBySuit(hand);
    const nonSp = ['HEARTS', 'DIAMONDS', 'CLUBS'];
    for (const s of nonSp) {
      const ace = (suits[s] || []).find((c) => c.rank === 'A');
      if (ace) return ace;
    }
    const mids = (s) =>
      (suits[s] || []).filter((c) => ['9', '10', 'J'].includes(c.rank));
    for (const s of nonSp) {
      const m = sortAsc(mids(s));
      if (m.length) return m[0];
    }
    const spAce = (suits.SPADES || []).find((c) => c.rank === 'A');
    if (spAce && spadesBroken) return spAce;
    let longest = null;
    let len = 0;
    for (const s of Object.keys(suits)) {
      if (s === 'SPADES' && !spadesBroken) continue;
      if ((suits[s] || []).length > len) {
        len = suits[s].length;
        longest = s;
      }
    }
    if (longest) return sortDesc(suits[longest])[0];
    const ns = hand.filter((c) => c.suit !== 'SPADES');
    return sortAsc(ns.length ? ns : hand)[0];
  }

  const leadCards = hand.filter((c) => c.suit === leadSuit);
  if (leadCards.length) {
    if (partnerWinning(trick, partnerSeat)) return sortAsc(leadCards)[0];
    const win = minimalWinningInLeadSuit(trick, hand, leadSuit);
    if (win) return win;
    return sortAsc(leadCards)[0];
  }

  const oppWinning =
    trick.length &&
    provisionalWinnerSeat(trick) !== seatIndex &&
    provisionalWinnerSeat(trick) !== partnerSeat;
  if (oppWinning && !spadesBroken) {
    const cut = minimalWinningSpade(trick, hand);
    if (cut) return cut;
  }
  const cut = minimalWinningSpade(trick, hand);
  if (cut) return cut;
  return sortAsc(hand.filter((c) => c.suit !== 'SPADES'))[0] || sortAsc(hand)[0];
}

function playCautious(ctx) {
  const {
    hand,
    trick,
    seatIndex,
    partnerSeat,
    leadSuit,
    isLeading,
    spadesBroken,
    contractLocked,
    bagPressure,
    cautiousMode
  } = ctx;

  if (contractLocked && cautiousMode) {
    const leadCards = hand.filter((c) => c.suit === leadSuit);
    if (leadCards.length) return sortAsc(leadCards)[0];
    const dump = sortDesc(hand.filter((c) => c.suit !== 'SPADES'));
    if (dump.length) return dump[0];
  }

  if (isLeading) {
    const suits = groupBySuit(hand);
    let bestS = null;
    let bestL = 0;
    for (const s of ['HEARTS', 'DIAMONDS', 'CLUBS']) {
      const len = (suits[s] || []).length;
      if (len > bestL) {
        bestL = len;
        bestS = s;
      }
    }
    if (bestS) return sortAsc(suits[bestS])[0];
    return sortAsc(hand.filter((c) => c.suit !== 'SPADES' || spadesBroken))[0] || sortAsc(hand)[0];
  }

  const leadCards = hand.filter((c) => c.suit === leadSuit);
  if (leadCards.length) {
    if (partnerWinning(trick, partnerSeat)) {
      if (bagPressure) {
        const los = leadCards.filter((c) => !wouldWinWithCard(trick, c, seatIndex));
        if (los.length) return sortAsc(los)[0];
      }
      return sortAsc(leadCards)[0];
    }
    const win = minimalWinningInLeadSuit(trick, hand, leadSuit);
    if (win && !bagPressure) return win;
    if (win && bagPressure && teamNeedsTricks(ctx)) return win;
    return sortAsc(leadCards)[0];
  }

  const sp = hand.filter((c) => c.suit === 'SPADES');
  if (partnerWinning(trick, partnerSeat) && sp.length && !spadesBroken) {
    if (ctx.isFirstTrickOfHand) {
      const hi = sortDesc(hand.filter((c) => c.suit !== 'SPADES'));
      if (hi.length) return hi[0];
    }
    return pickMidSpade(sp) || sortAsc(sp)[0];
  }
  if (sp.length && spadesBroken) {
    const cut = minimalWinningSpade(trick, hand);
    if (cut) return cut;
  }
  const nonSp = sortAsc(hand.filter((c) => c.suit !== 'SPADES'));
  return (nonSp.length ? nonSp : sortAsc(hand))[0];
}

function teamNeedsTricks(ctx) {
  return ctx.teamTricks < ctx.teamBid;
}

function playDoubleNil(ctx) {
  if (ctx.weAreAhead) {
    if (ctx.selfNil) return playSelfNil(ctx);
    if (ctx.partnerNil) return playCoverNil({ ...ctx, doubleNil: false });
    return playCautious(ctx);
  }
  if (ctx.oppNilSeat != null) {
    return playDefendOppNil({ ...ctx, doubleNil: false });
  }
  return playAggressive(ctx);
}

function groupBySuit(cards) {
  const m = { SPADES: [], HEARTS: [], DIAMONDS: [], CLUBS: [] };
  for (const c of cards) {
    if (m[c.suit]) m[c.suit].push(c);
  }
  return m;
}

/**
 * Choose a card (expert). Caller enforces special modes (Assassin/Screamer/LOWBALL) separately.
 */
export function expertChooseCard(ctx) {
  const x = buildExpertContext(ctx);
  const { doubleNil, selfNil, partnerNil, oppNilSeat } = x;

  if (doubleNil) return playDoubleNil(x);
  if (selfNil) return playSelfNil(x);
  if (partnerNil) return playCoverNil(x);
  if (oppNilSeat != null && !selfNil && !partnerNil) return playDefendOppNil(x);
  if (x.takeAllMode) return playAggressive(x);
  return playCautious(x);
}
