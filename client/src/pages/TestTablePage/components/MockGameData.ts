import type { GameState, Card, Player, Bot, Suit, Rank } from "../../../types/game";

const SUITS: Suit[] = ["SPADES", "HEARTS", "DIAMONDS", "CLUBS"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

function buildFullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export const uiTestBotId = (seat: 1 | 2 | 3) => `ui-test-bot-${seat}`;

/**
 * Static table for /test-table: logged-in user at seat 0, three bots, full 13-card hands,
 * a full trick (four cards, seats 0–3) on the table for layout tuning. No server or socket.
 */
export function createUiTestMockGame(humanUserId: string, humanDisplayName = "You"): GameState {
  const deck = buildFullDeck();
  const hands: Card[][] = [0, 1, 2, 3].map((i) => deck.slice(i * 13, (i + 1) * 13));

  const currentTrickFour: Card[] = [
    { suit: "HEARTS", rank: "7", seatIndex: 0 },
    { suit: "HEARTS", rank: "J", seatIndex: 1 },
    { suit: "HEARTS", rank: "Q", seatIndex: 2 },
    { suit: "HEARTS", rank: "3", seatIndex: 3 },
  ];

  const human: Player = {
    id: humanUserId,
    userId: humanUserId,
    name: humanDisplayName,
    username: humanDisplayName,
    avatarUrl: "/default-pfp.jpg",
    seatIndex: 0,
    position: 0,
    team: 0,
    isDealer: false,
    hand: hands[0],
    bid: 3,
    tricks: 0,
    type: "human",
  };

  const bots: Bot[] = ([1, 2, 3] as const).map((seat) => ({
    id: uiTestBotId(seat),
    username: `Bot ${seat}`,
    avatar: "/default-pfp.jpg",
    type: "bot" as const,
    position: seat,
    seatIndex: seat,
    hand: hands[seat],
    bid: 3,
    tricks: 0,
    team: seat === 1 || seat === 3 ? 1 : 0,
    isDealer: seat === 3,
  }));

  return {
    id: "ui-test-table",
    status: "PLAYING",
    gameMode: "PARTNERS",
    currentPlayer: uiTestBotId(2),
    currentTrick: currentTrickFour,
    currentTrickCards: currentTrickFour,
    completedTricks: [],
    rules: {
      gameType: "REGULAR",
      allowNil: true,
      allowBlindNil: true,
      numHands: 8,
      coinAmount: 100,
      bidType: "REGULAR",
    },
    round: 1,
    currentRound: 1,
    maxPoints: 500,
    minPoints: -500,
    team1TotalScore: 0,
    team2TotalScore: 0,
    team1Bags: 0,
    team2Bags: 0,
    rated: false,
    creatorId: humanUserId,
    hands,
    players: [human, bots[0], bots[1], bots[2]],
    bidding: {
      currentBidderIndex: 0,
      bids: [3, 3, 3, 4],
      totalBids: 13,
    },
    play: {
      currentPlayerIndex: 2,
      currentTrick: currentTrickFour,
      tricks: [],
      leadSuit: "HEARTS",
      spadesBroken: false,
      completedTricks: [],
    },
  };
}
