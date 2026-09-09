/**
 * Expert Spades bot policy — card play from user-specified rules.
 * Uses full trick history + optional all-four hands (Redis) for voids and counts.
 */

const RANK_ORDER = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  J: 11, Q: 12, K: 13, A: 14
};

/** When at least this many spades are still unplayed (approx), void sluffs prefer losing side suits before losing spades. */
export const SPADES_SAVE_TRUMP_THRESHOLD = 5;

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
  const n = Number(b);
  return n === 0;
}

/** Redis/JSON may use string seat indices — required for partner/win checks */
export function normSeat(s) {
  if (s === null || s === undefined || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
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
      const si = normSeat(c.seatIndex);
      if (si == null || si < 0 || si > 3) continue;
      if (c.suit !== leadSuit) {
        voids[si].add(leadSuit);
      }
    }
  };
  for (const t of game?.play?.completedTricks || []) {
    processTrick(t.cards || []);
  }
  processTrick(currentTrick || []);
  return voids;
}

function winningCardAmong(cards) {
  if (!cards?.length) return null;
  const leadSuit = cards[0].suit;
  const spades = cards.filter((c) => c.suit === 'SPADES');
  const pool = spades.length > 0 ? spades : cards.filter((c) => c.suit === leadSuit);
  if (!pool.length) return cards[0];
  return pool.reduce((best, c) => (cardValue(c.rank) > cardValue(best.rank) ? c : best));
}

/**
 * Human-visible cover intel: partner void, or Ace-of-suit already out and partner
 * followed under that Ace (nil highest-losing ⇒ that play is their suit max).
 * Returns Map suit -> { void: true } | { maxRankValue: number }.
 */
export function inferPartnerNilSuitIntel(game, partnerSeat) {
  const intel = new Map();
  const voids = inferVoidsFromTricks(game, []);
  const pVoids = voids[normSeat(partnerSeat)] || new Set();
  for (const s of pVoids) {
    intel.set(s, { void: true });
  }

  const aceSeenBeforeTrick = (suit, trickIndex) => {
    const completed = game?.play?.completedTricks || [];
    for (let i = 0; i < trickIndex; i++) {
      for (const c of completed[i]?.cards || []) {
        if (c.suit === suit && c.rank === 'A') return true;
      }
    }
    return false;
  };

  const completed = game?.play?.completedTricks || [];
  for (let ti = 0; ti < completed.length; ti++) {
    const cards = completed[ti]?.cards || [];
    if (cards.length < 2) continue;
    const leadSuit = cards[0].suit;
    if (intel.get(leadSuit)?.void) continue;

    const pIdx = cards.findIndex((c) => normSeat(c.seatIndex) === normSeat(partnerSeat));
    if (pIdx < 0) continue;
    const pCard = cards[pIdx];
    if (pCard.suit !== leadSuit) {
      intel.set(leadSuit, { void: true });
      continue;
    }

    const before = cards.slice(0, pIdx);
    const aceInBefore = before.some((c) => c.suit === leadSuit && c.rank === 'A');
    const aceAlreadyOut = aceSeenBeforeTrick(leadSuit, ti) || aceInBefore;
    if (!aceAlreadyOut) continue;

    // Only trust absolute max when the Ace of this suit is currently winning
    // (no trump yet, or trump is the Ace of spades on a spade lead).
    const winCard = winningCardAmong(before.length ? before : [cards[0]]);
    if (!winCard || winCard.suit !== leadSuit || winCard.rank !== 'A') continue;

    const maxRankValue = cardValue(pCard.rank);
    const prev = intel.get(leadSuit);
    if (!prev || prev.void) {
      intel.set(leadSuit, { void: false, maxRankValue });
    } else if (typeof prev.maxRankValue === 'number') {
      intel.set(leadSuit, {
        void: false,
        maxRankValue: Math.min(prev.maxRankValue, maxRankValue)
      });
    }
  }
  return intel;
}

/** Cheapest card that wins the current trick (cover overtake). */
export function cheapestWinningCover(trick, hand, seatIndex, leadSuit) {
  const leadCards = hand.filter((c) => c.suit === leadSuit);
  if (leadCards.length) {
    const winners = leadCards.filter((c) => wouldWinWithCard(trick, c, seatIndex));
    if (winners.length) return sortAsc(winners)[0];
    return null;
  }
  return minimalWinningSpade(trick, hand);
}

function longestNonSpadeSuit(hand) {
  const suits = groupBySuit(hand);
  let best = null;
  let bestLen = 0;
  for (const s of ['HEARTS', 'DIAMONDS', 'CLUBS']) {
    const len = (suits[s] || []).length;
    if (len > bestLen) {
      bestLen = len;
      best = s;
    }
  }
  return best;
}

export function provisionalWinnerSeat(trick) {
  if (!trick || trick.length === 0) return null;
  const leadSuit = trick[0].suit;
  const spades = trick.filter((c) => c.suit === 'SPADES');
  const pool = spades.length > 0 ? spades : trick.filter((c) => c.suit === leadSuit);
  if (pool.length === 0) return normSeat(trick[0].seatIndex);
  const raw = pool.reduce((best, c) => (cardValue(c.rank) > cardValue(best.rank) ? c : best)).seatIndex;
  return normSeat(raw);
}

export function wouldWinWithCard(trick, card, seatIndex) {
  const si = normSeat(seatIndex);
  const hyp = trick.concat([{ suit: card.suit, rank: card.rank, seatIndex: si }]);
  return normSeat(provisionalWinnerSeat(hyp)) === normSeat(seatIndex);
}

/**
 * When you cannot (or should not) win, dump the lowest card. If every card wins, play lowest anyway.
 * If preferSaveTrump, use the lowest losing non-spade before any losing spade (keeps trump for later cuts).
 */
export function lowestSluffNotWinning(trick, hand, seatIndex, preferSaveTrump = false) {
  const si = normSeat(seatIndex);
  const losers = hand.filter((c) => !wouldWinWithCard(trick, c, si));
  if (losers.length) {
    if (preferSaveTrump) {
      const nonSp = sortAsc(losers.filter((c) => c.suit !== 'SPADES'));
      if (nonSp.length) return nonSp[0];
    }
    return sortAsc(losers)[0];
  }
  return sortAsc(hand)[0];
}

function preferSaveTrumpFromCtx(ctx) {
  return (ctx.spadesRemainingApprox ?? 0) >= SPADES_SAVE_TRUMP_THRESHOLD;
}

/** Lowest card in lead suit that does not win the current trick (for bag / contract-made dumps). */
export function lowestLosingInLeadSuit(trick, hand, leadSuit, seatIndex) {
  if (!leadSuit) return null;
  const si = normSeat(seatIndex);
  const leadCards = hand.filter((c) => c.suit === leadSuit);
  const losers = leadCards.filter((c) => !wouldWinWithCard(trick, c, si));
  if (!losers.length) return null;
  return sortAsc(losers)[0];
}

/** Spades already played this hand (completed tricks + current trick). */
export function countSpadesPlayed(played) {
  let n = 0;
  for (const c of played || []) {
    if (normalizeCard(c).suit === 'SPADES') n++;
  }
  return n;
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

function isAceOfSpades(card) {
  return card?.suit === 'SPADES' && String(card.rank).toUpperCase() === 'A';
}

/**
 * Highest spade for leads, but keep A♠ unless bag-cashing or it's the only spade.
 * Burning A♠ early wastes control in Suicide / high table-bid hands.
 */
function highestSpadePreferConserveAce(spades, allowAce = false) {
  const desc = sortDesc(spades || []);
  if (!desc.length) return null;
  if (allowAce || desc.length === 1) return desc[0];
  const nonAce = desc.find((c) => !isAceOfSpades(c));
  return nonAce || desc[0];
}

export function nilPickHighestLosing(trick, seatIndex, legalCards) {
  if (!legalCards?.length) return null;
  for (const c of sortDesc(legalCards)) {
    if (!wouldWinWithCard(trick, c, seatIndex)) return c;
  }
  return sortAsc(legalCards)[0];
}

/** Ten+ — awkward for nil to hold late; prefer dumping from short suits. */
const NIL_HIGH_RANK_MIN = 10;

function suitCountsExcludingSpades(hand) {
  const counts = {};
  for (const c of hand) {
    if (c.suit === 'SPADES') continue;
    counts[c.suit] = (counts[c.suit] || 0) + 1;
  }
  return counts;
}

/**
 * Self-nil void dump: highest non-spade, short suits (< 3) first.
 * Used when the trick has no spade yet — never trump in that case.
 */
export function nilDumpNonSpadePreferShort(hand) {
  const nonSp = hand.filter((c) => c.suit !== 'SPADES');
  if (!nonSp.length) return null;
  const counts = suitCountsExcludingSpades(hand);
  return [...nonSp].sort((a, b) => {
    const shortA = counts[a.suit] < 3 ? 0 : 1;
    const shortB = counts[b.suit] < 3 ? 0 : 1;
    if (shortA !== shortB) return shortA - shortB;
    if (counts[a.suit] !== counts[b.suit]) return counts[a.suit] - counts[b.suit];
    return cardValue(b.rank) - cardValue(a.rank);
  })[0];
}

/**
 * When trick is already cut: dump a high (T+) non-spade from a short suit if available.
 */
export function nilDumpHighFromShortNonSpade(hand) {
  const counts = suitCountsExcludingSpades(hand);
  const candidates = hand.filter(
    (c) =>
      c.suit !== 'SPADES' &&
      (counts[c.suit] || 0) < 3 &&
      cardValue(c.rank) >= NIL_HIGH_RANK_MIN
  );
  if (!candidates.length) return null;
  return sortDesc(candidates)[0];
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
    const played = cards.find((c) => normSeat(c.seatIndex) === normSeat(nilSeat));
    if (played && played.suit === leadSuit) n++;
  }
  return n;
}

/** Boss spade in hand (A♠, or K♠ if A♠ gone, etc.) — a book we can always take later. */
export function handHasGuaranteedBook(hand, played) {
  if (!hand?.length) return false;
  const playedSpades = new Set();
  for (const c of played || []) {
    const n = normalizeCard(c);
    if (n.suit === 'SPADES') playedSpades.add(n.rank);
  }
  const order = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
  for (const r of order) {
    if (playedSpades.has(r)) continue;
    return hand.some((c) => c.suit === 'SPADES' && c.rank === r);
  }
  return false;
}

/** Highest card in lead suit that still loses the current trick. */
export function highestLosingInLeadSuit(trick, hand, leadSuit, seatIndex) {
  if (!leadSuit) return null;
  const si = normSeat(seatIndex);
  const leadCards = hand.filter((c) => c.suit === leadSuit);
  const losers = leadCards.filter((c) => !wouldWinWithCard(trick, c, si));
  if (!losers.length) return null;
  return sortDesc(losers)[0];
}

/** Highest card that does not win — prefer high non-spade dumps when avoiding bags. */
export function highestSluffNotWinning(trick, hand, seatIndex) {
  const si = normSeat(seatIndex);
  const losers = hand.filter((c) => !wouldWinWithCard(trick, c, si));
  if (losers.length) {
    const nonSp = sortDesc(losers.filter((c) => c.suit !== 'SPADES'));
    if (nonSp.length) return nonSp[0];
    return sortDesc(losers)[0];
  }
  return sortDesc(hand)[0];
}

export function buildExpertContext(base) {
  const trick = base.trick || [];
  const isLeading = trick.length === 0;
  const leadSuit = isLeading ? null : trick[0].suit;
  const partnerSeat = base.partnerSeat ?? (base.seatIndex + 2) % 4;
  const partnerHasPlayed = trick.some((c) => normSeat(c.seatIndex) === normSeat(partnerSeat));

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

  const myBid = bidsBySeat?.[seatIndex];
  const partnerBid = bidsBySeat?.[partnerSeat];
  const partnerPl = game?.players?.[partnerSeat];
  const myPl = game?.players?.[seatIndex];
  const selfNil =
    isNilBid(myBid) || myPl?.isNil === true || myPl?.isBlindNil === true;
  const partnerNil =
    isNilBid(partnerBid) ||
    partnerPl?.isNil === true ||
    partnerPl?.isBlindNil === true;

  const bidsSafe = Array.isArray(bidsBySeat) ? bidsBySeat : [];
  const oppSeats = [0, 1, 2, 3].filter((s) => s !== seatIndex && s !== partnerSeat);
  const oppNilSeat = oppSeats.find((s) => isNilBid(bidsSafe[s])) ?? null;

  const nilSeats = [0, 1, 2, 3].filter((s) => isNilBid(bidsSafe[s]));
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
  const severeBagPressure = myTeamBags >= 9;

  const trickWins = game.trickWins || [0, 0, 0, 0];
  const teamTricks = (trickWins[seatIndex] || 0) + (trickWins[partnerSeat] || 0);
  const teamBid =
    (Number.isFinite(Number(myBid)) ? Number(myBid) : 0) +
    (Number.isFinite(Number(partnerBid)) ? Number(partnerBid) : 0);
  const contractMade = teamBid > 0 && teamTricks >= teamBid;
  const contractLocked = cautiousMode && contractMade;

  const oppTeamTricks =
    (trickWins[oppSeats[0]] || 0) + (trickWins[oppSeats[1]] || 0);
  const oppTeamBid = oppSeats.reduce((sum, s) => {
    const b = bidsSafe[s];
    return sum + (Number.isFinite(Number(b)) ? Number(b) : 0);
  }, 0);
  const oppContractMade = oppTeamBid > 0 && oppTeamTricks >= oppTeamBid;
  const bothContractsMade = contractMade && oppContractMade;
  const tricksNeeded = Math.max(0, (teamBid || 0) - teamTricks);

  const spadesPlayedCount = countSpadesPlayed(played);
  const spadesRemainingApprox = Math.max(0, 13 - spadesPlayedCount);
  const tricksCompletedCount = (game?.play?.completedTricks || []).length;
  const isFirstTrickOfHand = tricksCompletedCount === 0;

  const partnerVoidSuits = voids[partnerSeat] || new Set();

  const nilStillAlive = (seat, flagged) => {
    if (!flagged) return false;
    const si = normSeat(seat);
    if (si == null) return false;
    if (Number(trickWins[si] || 0) > 0) return false;
    for (const t of game?.play?.completedTricks || []) {
      const w = normSeat(
        t?.winnerIndex ?? t?.winnerSeatIndex ?? t?.winningSeatIndex ?? t?.winnerSeat
      );
      if (w === si) return false;
    }
    return true;
  };

  const selfNilAlive = nilStillAlive(seatIndex, selfNil);
  const partnerNilAlive = nilStillAlive(partnerSeat, partnerNil);
  const oppNilSeatsAlive = oppSeats.filter((s) =>
    nilStillAlive(s, isNilBid(bidsSafe[s]))
  );
  const oppNilSeatAlive = oppNilSeatsAlive[0] ?? null;

  const hasGuaranteedBook = handHasGuaranteedBook(hand, played);
  /** Pure bag dodge: both sides made, or we need only 1 and hold a sure book (e.g. A♠). */
  const avoidBagsMode =
    !selfNilAlive &&
    !partnerNilAlive &&
    (bothContractsMade || (tricksNeeded === 1 && hasGuaranteedBook));

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
    selfNilAlive,
    partnerNilAlive,
    oppNilSeat,
    oppNilSeatAlive,
    oppNilSeatsAlive,
    doubleNil,
    weAreAhead,
    played,
    voids,
    partnerVoidSuits,
    bagPressure,
    severeBagPressure,
    teamTricks,
    teamBid,
    contractMade,
    contractLocked,
    oppTeamTricks,
    oppTeamBid,
    oppContractMade,
    bothContractsMade,
    tricksNeeded,
    hasGuaranteedBook,
    avoidBagsMode,
    spadesRemainingApprox,
    tricksCompletedCount,
    isFirstTrickOfHand,
    allHands: allHands || null
  };
}

function partnerWinning(trick, partnerSeat) {
  if (!trick.length) return false;
  return normSeat(provisionalWinnerSeat(trick)) === normSeat(partnerSeat);
}

/** Contract already made + bag risk, or explicit avoid-bags mode (nil paths excluded). */
function shouldDumpForBags(ctx) {
  if (ctx.selfNilAlive || ctx.partnerNilAlive) return false;
  if (ctx.avoidBagsMode) return true;
  if (!ctx.bagPressure && !ctx.severeBagPressure) return false;
  if (!ctx.teamBid || ctx.teamBid <= 0) return false;
  return ctx.teamTricks >= ctx.teamBid;
}

/**
 * Avoid bags: duck / dump highest losers; if partner already winning, overtake with a high
 * winner so the team bags once while shedding junk.
 */
function playAvoidBags(ctx) {
  const { hand, trick, seatIndex, partnerSeat, leadSuit, isLeading, spadesBroken } = ctx;

  if (isLeading) {
    const suits = groupBySuit(hand);
    let bestS = null;
    let bestL = -1;
    for (const s of ['HEARTS', 'DIAMONDS', 'CLUBS']) {
      const len = (suits[s] || []).length;
      if (len > bestL) {
        bestL = len;
        bestS = s;
      }
    }
    if (bestS && (suits[bestS] || []).length) {
      return sortAsc(suits[bestS])[0];
    }
    // Only spades left — lead lowest (keep boss for the one needed book later)
    return sortAsc(hand)[0];
  }

  const leadCards = hand.filter((c) => c.suit === leadSuit);

  // Partner winning → take it ourselves with a HIGH winner (shed junk + one bag)
  if (partnerWinning(trick, partnerSeat)) {
    if (leadCards.length) {
      const winners = leadCards.filter((c) => wouldWinWithCard(trick, c, seatIndex));
      if (winners.length) return sortDesc(winners)[0];
      return sortDesc(leadCards)[0];
    }
    const spades = sortDesc(hand.filter((c) => c.suit === 'SPADES'));
    const winningSpades = spades.filter((c) => wouldWinWithCard(trick, c, seatIndex));
    if (winningSpades.length) return winningSpades[0];
    // Cannot overtake — dump highest offsuit under partner
    return highestSluffNotWinning(trick, hand, seatIndex);
  }

  if (leadCards.length) {
    const hiLose = highestLosingInLeadSuit(trick, hand, leadSuit, seatIndex);
    if (hiLose) return hiLose;
    // Forced to win — play highest (shed) rather than cheap winner kept for later
    return sortDesc(leadCards)[0];
  }

  // Void: dump highest non-spade that doesn't take; never cut unless every card wins
  const hiSluff = highestSluffNotWinning(trick, hand, seatIndex);
  if (hiSluff && !wouldWinWithCard(trick, hiSluff, seatIndex)) return hiSluff;
  const nonSp = sortDesc(hand.filter((c) => c.suit !== 'SPADES'));
  if (nonSp.length) {
    const safe = nonSp.filter((c) => !wouldWinWithCard(trick, c, seatIndex));
    if (safe.length) return safe[0];
    return nonSp[0];
  }
  // Only spades — play lowest that loses, else lowest
  const spades = sortAsc(hand.filter((c) => c.suit === 'SPADES'));
  for (const s of spades) {
    if (!wouldWinWithCard(trick, s, seatIndex)) return s;
  }
  return spades[0] || sortAsc(hand)[0];
}

/** Following lead suit: lowest card that does not take partner's book; else minimal forced steal. */
function lowestFollowingLeadSuitWithoutStealing(trick, hand, leadSuit, seatIndex, partnerSeat) {
  const leadCards = hand.filter((c) => c.suit === leadSuit);
  if (!leadCards.length || !partnerWinning(trick, partnerSeat)) return null;
  const losers = leadCards.filter((c) => !wouldWinWithCard(trick, c, seatIndex));
  if (losers.length) return sortAsc(losers)[0];
  return sortAsc(leadCards)[0];
}

/**
 * Void in lead: partner already winning — sluff high non-spade; if only spades, lowest spade that loses
 * to partner's winner, else smallest spade (minimal overcut when forced).
 */
function voidWhenPartnerWinning(trick, hand, seatIndex, partnerSeat) {
  if (!partnerWinning(trick, partnerSeat)) return null;
  const hiDump = sortDesc(hand.filter((c) => c.suit !== 'SPADES'));
  if (hiDump.length) return hiDump[0];
  const spades = sortAsc(hand.filter((c) => c.suit === 'SPADES'));
  if (!spades.length) return null;
  for (const s of spades) {
    if (!wouldWinWithCard(trick, s, seatIndex)) return s;
  }
  return spades[0];
}

function oppNilWinning(trick, oppNilSeat) {
  return (
    oppNilSeat != null &&
    trick.length &&
    normSeat(provisionalWinnerSeat(trick)) === normSeat(oppNilSeat)
  );
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
  const { hand, trick, seatIndex, leadSuit, isLeading } = ctx;
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

  // Void in lead suit
  const trickHasSpade = trick.some((c) => c.suit === 'SPADES');
  const mySp = hand.filter((c) => c.suit === 'SPADES');
  const myNon = hand.filter((c) => c.suit !== 'SPADES');

  // No spade in trick yet → NEVER cut; dump highest non-spades, short suits first
  if (!trickHasSpade) {
    const dump = nilDumpNonSpadePreferShort(hand);
    if (dump) return dump;
    // Only spades left — any play cuts; play lowest
    if (mySp.length) return sortAsc(mySp)[0];
    return sortDesc(hand)[0];
  }

  // Trick already cut: ditch high short-suit side cards, else highest losing spade
  // (never overcut if a side-suit dump or losing spade exists)
  const shortHigh = nilDumpHighFromShortNonSpade(hand);
  if (shortHigh) return shortHigh;
  if (mySp.length) {
    const pick = nilPickHighestLosing(trick, seatIndex, mySp);
    if (pick && !wouldWinWithCard(trick, pick, seatIndex)) return pick;
    // All spades would overcut — sluff a non-spade if possible
    const dump = nilDumpNonSpadePreferShort(hand);
    if (dump) return dump;
    return sortAsc(mySp)[0];
  }
  return nilDumpNonSpadePreferShort(hand) || sortDesc(myNon.length ? myNon : hand)[0];
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
    partnerHasPlayed,
    game
  } = ctx;

  const partnerPlayedInTrick = trick.some(
    (c) => normSeat(c.seatIndex) === normSeat(partnerSeat)
  );
  const needBooks = teamNeedsTricks(ctx);
  const suitIntel = inferPartnerNilSuitIntel(game, partnerSeat);

  if (isLeading) {
    const suits = groupBySuit(hand);
    const nonSp = ['HEARTS', 'DIAMONDS', 'CLUBS'];

    // 1) Punch proven partner voids (side suits)
    for (const s of nonSp) {
      const intel = suitIntel.get(s);
      if (partnerVoidSuits.has(s) || intel?.void) {
        const cards = sortDesc(suits[s] || []);
        if (cards.length) return cards[0];
      }
    }

    // 2) After spades broken: lead high spades until partner is void (conserve A♠ unless bag mode)
    const partnerVoidSpades =
      partnerVoidSuits.has('SPADES') || suitIntel.get('SPADES')?.void === true;
    const cashAceOk = ctx.avoidBagsMode || shouldDumpForBags(ctx);
    if (spadesBroken && !partnerVoidSpades && (suits.SPADES || []).length) {
      return highestSpadePreferConserveAce(suits.SPADES, cashAceOk);
    }

    // 3) Cash a non-spade Ace
    for (const s of nonSp) {
      const ace = (suits[s] || []).find((c) => c.rank === 'A');
      if (ace) return ace;
    }

    // 4) Known-safe suits: Ace seen + partner max known → lead high above their max
    for (const s of nonSp) {
      const intel = suitIntel.get(s);
      if (!intel || intel.void || typeof intel.maxRankValue !== 'number') continue;
      const safe = sortDesc(suits[s] || []).filter(
        (c) => cardValue(c.rank) > intel.maxRankValue
      );
      if (safe.length) return safe[0];
    }

    // 5) No Ace / no known-safe → highest from longest non-spade
    const longest = longestNonSpadeSuit(hand);
    if (longest && (suits[longest] || []).length) {
      return sortDesc(suits[longest])[0];
    }

    for (const s of nonSp) {
      const cards = sortDesc(suits[s] || []);
      if (cards.length) return cards[0];
    }
    if (spadesBroken && (suits.SPADES || []).length) {
      return highestSpadePreferConserveAce(suits.SPADES, cashAceOk);
    }
    const leadPool = cashAceOk ? hand : hand.filter((c) => !isAceOfSpades(c));
    return sortDesc(leadPool.length ? leadPool : hand)[0];
  }

  // --- Following ---
  if (partnerHasPlayed || partnerPlayedInTrick) {
    const nilWinning = partnerWinning(trick, partnerSeat);
    if (nilWinning) {
      // Always overtake with the cheapest card that beats partner
      const cover = cheapestWinningCover(trick, hand, seatIndex, leadSuit);
      if (cover) return cover;
      // Cannot beat them — dump lowest legal
      const leadCards = hand.filter((c) => c.suit === leadSuit);
      if (leadCards.length) return sortAsc(leadCards)[0];
      return lowestSluffNotWinning(trick, hand, seatIndex, true);
    }

    // Partner already played and is NOT winning — take a free book if we still need tricks
    if (needBooks) {
      const w =
        minimalWinningInLeadSuit(trick, hand, leadSuit) ||
        minimalWinningSpade(trick, hand);
      if (w) return w;
    }
    const leadCards = hand.filter((c) => c.suit === leadSuit);
    if (leadCards.length) return sortAsc(leadCards)[0];
    const nonSpDump = sortAsc(hand.filter((c) => c.suit !== 'SPADES'));
    return (nonSpDump.length ? nonSpDump : sortAsc(hand))[0];
  }

  // Partner has not yet played this trick
  const nilLed =
    trick.length > 0 &&
    normSeat(trick[0].seatIndex) === normSeat(partnerSeat);
  const leadCards = hand.filter((c) => c.suit === leadSuit);
  if (leadCards.length) {
    if (nilLed) return sortAsc(leadCards)[0];
    // Opp/third hand before partner: play HIGHEST in suit (not cheapest winner).
    // Cheapest (e.g. 3 under a 2) lets a later seat overtake and set partner.
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
  // Void before partner: cut with cheapest winning spade — never burn A♠ when a
  // lower trump already wins. Highest-spade cuts wasted the Ace (Suicide / table ≥12).
  // Bag-avoidance may still cash A♠ elsewhere when both sides have made.
  if (spades.length) {
    const cut = minimalWinningSpade(trick, hand);
    if (cut) return cut;
    if (nonSp.length) return sortAsc(nonSp)[0];
    return sortAsc(spades)[0];
  }
  if (nonSp.length) return sortAsc(nonSp)[0];
  return sortAsc(hand)[0];
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
    game
  } = ctx;

  // Must never run defend-nil tactics while we (or partner) are still on a live nil.
  if (ctx.selfNilAlive ?? ctx.selfNil) return playSelfNil(ctx);
  if (ctx.partnerNilAlive ?? ctx.partnerNil) return playCoverNil({ ...ctx, doubleNil: false });

  const needBooks = teamNeedsTricks(ctx);
  const voidsOpp = ctx.voids[oppNilSeat] || new Set();

  const midLowInSuit = (cards) => {
    const s = sortAsc(cards);
    if (!s.length) return null;
    return s[Math.floor((s.length - 1) / 3)];
  };

  /** True if we play after the opp nil on this trick (sitting over them). */
  const sitsOverOppNil = () => {
    if (oppNilSeat == null) return false;
    if (!trick.length) return false;
    const leadSeat = normSeat(trick[0].seatIndex);
    if (leadSeat == null) return false;
    const order = [0, 1, 2, 3].map((i) => (leadSeat + i) % 4);
    const myPos = order.indexOf(normSeat(seatIndex));
    const nilPos = order.indexOf(normSeat(oppNilSeat));
    if (myPos < 0 || nilPos < 0) return false;
    return myPos > nilPos;
  };

  if (isLeading) {
    const suits = groupBySuit(hand);
    const nonSp = ['HEARTS', 'DIAMONDS', 'CLUBS'];
    const scored = nonSp
      .map((s) => ({
        suit: s,
        score: countNilFollowsInSuit(game, oppNilSeat, s),
        voided: voidsOpp.has(s)
      }))
      .filter((x) => !x.voided)
      .sort((a, b) => b.score - a.score);

    // Need books + on lead: still prefer mid/low through (not sitting over). Cash only when over.
    for (const { suit } of scored) {
      const cards = suits[suit] || [];
      if (!cards.length) continue;
      const mid = midLowInSuit(cards);
      if (mid) return mid;
    }
    for (const s of nonSp) {
      if (voidsOpp.has(s)) continue;
      const mid = midLowInSuit(suits[s] || []);
      if (mid) return mid;
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
  const over = sitsOverOppNil();

  if (leadCards.length) {
    const duck = lowestFollowingLeadSuitWithoutStealing(trick, hand, leadSuit, seatIndex, partnerSeat);
    if (duck !== null) return duck;
    if (shouldDumpForBags(ctx)) {
      const dump = lowestLosingInLeadSuit(trick, hand, leadSuit, seatIndex);
      if (dump) return dump;
    }

    // Need books and sitting over their nil → cash / take cheap winners
    if (needBooks && over) {
      const win = minimalWinningInLeadSuit(trick, hand, leadSuit);
      if (win) return win;
      return sortDesc(leadCards)[0];
    }

    // Otherwise pressure with mid/low; don't slam Aces through them for free
    if (!needBooks || !over) {
      const mid = midLowInSuit(leadCards);
      if (mid && !wouldWinWithCard(trick, mid, seatIndex)) return mid;
      const los = leadCards.filter((c) => !wouldWinWithCard(trick, c, seatIndex));
      if (los.length) return sortAsc(los)[0];
    }

    const win = minimalWinningInLeadSuit(trick, hand, leadSuit);
    if (win) return win;
    return takeAllMode ? sortDesc(leadCards)[0] : sortAsc(leadCards)[0];
  }

  if (shouldDumpForBags(ctx) && !teamNeedsTricks(ctx)) {
    return lowestSluffNotWinning(trick, hand, seatIndex, preferSaveTrumpFromCtx(ctx));
  }

  const partnerVoid = voidWhenPartnerWinning(trick, hand, seatIndex, partnerSeat);
  if (partnerVoid) return partnerVoid;

  const oppTeamWinning =
    trick.length > 0 &&
    (() => {
      const w = normSeat(provisionalWinnerSeat(trick));
      return (
        w != null &&
        w !== normSeat(seatIndex) &&
        w !== normSeat(partnerSeat)
      );
    })();
  const needBookForContract = teamNeedsTricks(ctx);

  // Prefer not breaking spades vs their nil — unless we still need tricks for our bid.
  if (needBookForContract && oppTeamWinning && over) {
    const cut = minimalWinningSpade(trick, hand);
    if (cut) return cut;
  }

  if (!spadesBroken) {
    const nonSp = hand.filter((c) => c.suit !== 'SPADES');
    if (nonSp.length) {
      return shouldDumpForBags(ctx) ? sortAsc(nonSp)[0] : sortDesc(nonSp)[0];
    }
  }
  if ((takeAllMode || needBookForContract) && over) {
    const cut = minimalWinningSpade(trick, hand);
    if (cut) return cut;
  }
  const sp = hand.filter((c) => c.suit === 'SPADES');
  if (sp.length && spadesBroken) {
    const cut = over ? minimalWinningSpade(trick, hand) : null;
    if (cut) return cut;
    return sortAsc(sp)[0];
  }
  return sortAsc(hand.filter((c) => c.suit !== 'SPADES'))[0] || sortAsc(hand)[0];
}

function playAggressive(ctx) {
  const {
    hand,
    trick,
    partnerSeat,
    leadSuit,
    isLeading,
    spadesBroken,
    seatIndex,
    aggressiveTable
  } = ctx;
  if (isLeading) {
    if (shouldDumpForBags(ctx)) {
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
      return (
        sortAsc(hand.filter((c) => c.suit !== 'SPADES' || spadesBroken))[0] ||
        sortAsc(hand)[0]
      );
    }
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
    const duck = lowestFollowingLeadSuitWithoutStealing(trick, hand, leadSuit, seatIndex, partnerSeat);
    if (duck !== null) return duck;
    if (shouldDumpForBags(ctx)) {
      const dump = highestLosingInLeadSuit(trick, hand, leadSuit, seatIndex);
      if (dump) return dump;
    }
    const win = minimalWinningInLeadSuit(trick, hand, leadSuit);
    if (win) return win;
    return sortAsc(leadCards)[0];
  }

  if (shouldDumpForBags(ctx) && !teamNeedsTricks(ctx)) {
    if (partnerWinning(trick, partnerSeat)) {
      return playAvoidBags(ctx);
    }
    return highestSluffNotWinning(trick, hand, seatIndex);
  }

  // Table 12–13: void with partner winning — dump lowest losers, not high cards (nil paths use other plays)
  let partnerVoid = null;
  if (partnerWinning(trick, partnerSeat)) {
    partnerVoid = aggressiveTable
      ? lowestSluffNotWinning(trick, hand, seatIndex, preferSaveTrumpFromCtx(ctx))
      : voidWhenPartnerWinning(trick, hand, seatIndex, partnerSeat);
  }
  if (partnerVoid) return partnerVoid;

  const wSeat = normSeat(provisionalWinnerSeat(trick));
  const oppWinning =
    trick.length &&
    wSeat != null &&
    wSeat !== normSeat(seatIndex) &&
    wSeat !== normSeat(partnerSeat);
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
    if (leadCards.length) {
      const duck = lowestFollowingLeadSuitWithoutStealing(trick, hand, leadSuit, seatIndex, partnerSeat);
      if (duck !== null) return duck;
      return sortAsc(leadCards)[0];
    }
    const dumpLow = sortAsc(hand.filter((c) => c.suit !== 'SPADES'));
    if (dumpLow.length) return dumpLow[0];
    const pv = voidWhenPartnerWinning(trick, hand, seatIndex, partnerSeat);
    if (pv) return pv;
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
      if (shouldDumpForBags(ctx)) {
        return playAvoidBags(ctx);
      }
      const duck = lowestFollowingLeadSuitWithoutStealing(trick, hand, leadSuit, seatIndex, partnerSeat);
      if (duck !== null) return duck;
    }
    if (shouldDumpForBags(ctx)) {
      const dump = highestLosingInLeadSuit(trick, hand, leadSuit, seatIndex);
      if (dump) return dump;
    }
    const win = minimalWinningInLeadSuit(trick, hand, leadSuit);
    if (win && !bagPressure) return win;
    if (win && bagPressure && teamNeedsTricks(ctx)) return win;
    return sortAsc(leadCards)[0];
  }

  if (shouldDumpForBags(ctx) && !teamNeedsTricks(ctx)) {
    if (partnerWinning(trick, partnerSeat)) {
      return playAvoidBags(ctx);
    }
    return highestSluffNotWinning(trick, hand, seatIndex);
  }

  const partnerVoid = voidWhenPartnerWinning(trick, hand, seatIndex, partnerSeat);
  if (partnerVoid) return partnerVoid;

  const sp = hand.filter((c) => c.suit === 'SPADES');
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
  // Own / partner nil only while still alive; once set, attack remaining opp nil.
  if (ctx.selfNilAlive) return playSelfNil(ctx);
  if (ctx.partnerNilAlive) return playCoverNil({ ...ctx, doubleNil: false });
  const opp = ctx.oppNilSeatAlive ?? ctx.oppNilSeat;
  if (opp != null) {
    return playDefendOppNil({
      ...ctx,
      oppNilSeat: opp,
      selfNil: false,
      partnerNil: false,
      selfNilAlive: false,
      partnerNilAlive: false,
      doubleNil: false
    });
  }
  if (ctx.weAreAhead) {
    return playCautious(ctx);
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
  const selfNilAlive = x.selfNilAlive ?? x.selfNil;
  const partnerNilAlive = x.partnerNilAlive ?? x.partnerNil;
  const oppNilAlive = x.oppNilSeatAlive ?? null;

  // Live nils first; once a nil is set, stop covering and attack remaining opp nils.
  if (selfNilAlive) return playSelfNil(x);
  if (partnerNilAlive) return playCoverNil(x);
  if (oppNilAlive != null) {
    return playDefendOppNil({
      ...x,
      oppNilSeat: oppNilAlive,
      selfNil: false,
      partnerNil: false,
      selfNilAlive: false,
      partnerNilAlive: false
    });
  }
  // Both contracts made, or need 1 + guaranteed book → dodge bags
  if (x.avoidBagsMode) return playAvoidBags(x);
  if (x.takeAllMode) return playAggressive(x);
  return playCautious(x);
}
