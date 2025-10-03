import type { GameState, Card, Rank, Suit } from "../../../types/game";

export const createMockGame = (): GameState => {
  // Create the hands array first with realistic mixed card distributions
  const hands = [
    [
      { rank: 'A', suit: '♠' },
      { rank: 'K', suit: '♠' },
      { rank: 'Q', suit: '♠' },
      { rank: 'J', suit: '♠' },
      { rank: '10', suit: '♠' },
      { rank: 'A', suit: '♥' },
      { rank: 'K', suit: '♥' },
      { rank: 'Q', suit: '♥' },
      { rank: 'A', suit: '♦' },
      { rank: 'K', suit: '♦' },
      { rank: 'A', suit: '♣' },
      { rank: 'K', suit: '♣' },
      { rank: 'Q', suit: '♣' }
    ],
    [
      { rank: '9', suit: '♠' },
      { rank: '8', suit: '♠' },
      { rank: '7', suit: '♠' },
      { rank: '6', suit: '♠' },
      { rank: '5', suit: '♠' },
      { rank: 'J', suit: '♥' },
      { rank: '10', suit: '♥' },
      { rank: '9', suit: '♥' },
      { rank: '8', suit: '♥' },
      { rank: 'Q', suit: '♦' },
      { rank: 'J', suit: '♦' },
      { rank: '10', suit: '♦' },
      { rank: 'J', suit: '♣' }
    ],
    [
      { rank: '4', suit: '♠' },
      { rank: '3', suit: '♠' },
      { rank: '2', suit: '♠' },
      { rank: '7', suit: '♥' },
      { rank: '6', suit: '♥' },
      { rank: '5', suit: '♥' },
      { rank: '4', suit: '♥' },
      { rank: '3', suit: '♥' },
      { rank: '2', suit: '♥' },
      { rank: '9', suit: '♦' },
      { rank: '8', suit: '♦' },
      { rank: '7', suit: '♦' },
      { rank: '6', suit: '♦' }
    ],
    [
      { rank: '5', suit: '♦' },
      { rank: '4', suit: '♦' },
      { rank: '3', suit: '♦' },
      { rank: '2', suit: '♦' },
      { rank: '9', suit: '♣' },
      { rank: '8', suit: '♣' },
      { rank: '7', suit: '♣' },
      { rank: '6', suit: '♣' },
      { rank: '5', suit: '♣' },
      { rank: '4', suit: '♣' },
      { rank: '3', suit: '♣' },
      { rank: '2', suit: '♣' },
      { rank: '10', suit: '♣' }
    ]
  ];

  return {
    id: 'test-game-1',
    name: 'Test Game',
    status: 'PLAYING',
    gameMode: 'PARTNERS',
    currentPlayer: 'user-1',
    players: [
      {
        id: 'user-1',
        username: 'Test Player 1',
        avatar: '/default-pfp.jpg',
        seatIndex: 0,
        team: 0,
        type: 'human',
        connected: true,
        hand: hands[0],
        bid: 3,
        tricks: 0,
        points: 0,
        bags: 0
      },
      {
        id: 'user-2',
        username: 'Test Player 2',
        avatar: '/default-pfp.jpg',
        seatIndex: 1,
        team: 1,
        type: 'human',
        connected: true,
        hand: hands[1],
        bid: 2,
        tricks: 0,
        points: 0,
        bags: 0
      },
      {
        id: 'user-3',
        username: 'Test Player 3',
        avatar: '/default-pfp.jpg',
        seatIndex: 2,
        team: 0,
        type: 'human',
        connected: true,
        hand: hands[2],
        bid: 4,
        tricks: 0,
        points: 0,
        bags: 0
      },
      {
        id: 'user-4',
        username: 'Test Player 4',
        avatar: '/default-pfp.jpg',
        seatIndex: 3,
        team: 1,
        type: 'human',
        connected: true,
        hand: hands[3],
        bid: 4,
        tricks: 0,
        points: 0,
        bags: 0
      }
    ],
    bidding: {
      currentBidderIndex: 0,
      bids: [3, 2, 4, 4],
      totalBids: 13
    },
    play: {
      currentPlayerIndex: 0,
      currentTrick: [],
      tricks: [],
      leadSuit: null
    },
    scores: {
      'user-1': 0,
      'user-2': 0,
      'user-3': 0,
      'user-4': 0
    },
    teamScores: {
      'team-0': 0,
      'team-1': 0
    },
    trickScores: {
      'user-1': 0,
      'user-2': 0,
      'user-3': 0,
      'user-4': 2
    }
  };
};
