import type { Game, GamePlayer, Card, Suit, Rank } from '../../types/game';

const SUITS: Suit[] = ['SPADES', 'HEARTS', 'DIAMONDS', 'CLUBS'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/**
 * Creates a standard 52-card deck
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/**
 * Shuffles a deck of cards using Fisher-Yates algorithm
 */
export function shuffle(deck: Card[]): Card[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Assigns dealer for the next hand
 */
export function assignDealer(players: (GamePlayer | null)[], previousDealerIndex?: number): number {
  const playerIndexes = players.map((p, i) => p ? i : null).filter((i): i is number => i !== null);
  if (playerIndexes.length === 0) {
    throw new Error('No valid players to assign dealer');
  }
  if (previousDealerIndex !== undefined) {
    const nextDealerIndex = (previousDealerIndex + 1) % 4;
    return playerIndexes.includes(nextDealerIndex) ? nextDealerIndex : playerIndexes[0];
  }
  return playerIndexes[Math.floor(Math.random() * playerIndexes.length)];
}

/**
 * Deals cards to all players starting from the player to the left of the dealer
 */
export function dealCards(players: (GamePlayer | null)[], dealerIndex: number): Card[][] {
  const deck = shuffle(createDeck());
  const hands: Card[][] = [[], [], [], []];
  let current = (dealerIndex + 1) % 4;
  for (const card of deck) {
    hands[current].push(card);
    current = (current + 1) % 4;
  }
  return hands;
}

/**
 * Deals a new hand for an existing game
 */
export function dealNewHand(game: Game): void {
  const newDealerIndex = (game.dealerIndex + 1) % 4;
  game.dealerIndex = newDealerIndex;
  
  const hands = dealCards(game.players, newDealerIndex);
  game.hands = hands;
  
  // Assign hands to individual players
  game.hands.forEach((hand, index) => {
    if (game.players[index]) {
      game.players[index]!.hand = hand;
    }
  });
  
  // Reset player trick counts for new hand
  game.players.forEach(player => {
    if (player) {
      player.tricks = 0;
    }
  });
}
