export type GameMode = 'PARTNERS' | 'SOLO';
export type BiddingOption = 'REGULAR' | 'WHIZ' | 'MIRROR' | 'GIMMICK';
export type GamePlayOption = 'NONE' | 'SCREAMER' | 'ASSASSIN';
export type GimmickType = 'SUICIDE' | 'BID4NIL' | 'BID3' | 'BIDHEARTS' | 'CRAZY ACES';
export type Suit = 'SPADES' | 'HEARTS' | 'DIAMONDS' | 'CLUBS';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
	suit: Suit;
	rank: Rank;
	playedBy?: string;
	playerIndex?: number;
}

export interface GamePlayer {
	id: string; // Ensure id is always a string and never null
	username: string;
	avatar: string | null;
	type: 'human' | 'bot';
	position?: number;
	hand?: Card[];
	bid?: number;
	tricks?: number;
	team?: number;
	isDealer?: boolean;
	discordId?: string; // Discord ID for Discord mentions
	// Game state persistence fields
	points?: number;
	nil?: boolean;
	blindNil?: boolean;
	connected?: boolean;
	bags?: number;
	lastAction?: string;
	lastActionTime?: number;
}

export interface GameRules {
  gameType: GameMode;
  allowNil: boolean;
  allowBlindNil: boolean;
  minPoints: number;
  maxPoints: number;
  coinAmount: number;
  bidType: BiddingOption;
  specialRules?: {
    screamer: boolean;
    assassin: boolean;
  };
  gimmickType?: GimmickType;
}
export interface Game {
	id: string;
	gameMode: GameMode;
	maxPoints: number;
	minPoints: number;
	buyIn: number;
	forcedBid?: GimmickType;
	specialRules: {
		screamer?: boolean;
		assassin?: boolean;
	};
	players: (GamePlayer | null)[];
	spectators: GamePlayer[];
	status: 'WAITING' | 'BIDDING' | 'PLAYING' | 'FINISHED' | 'CANCELLED';
	completedTricks: Card[][];
	rules: {
		gameType: GameMode;
		allowNil: boolean;
		allowBlindNil: boolean;
		coinAmount: number;
		maxPoints: number;
		minPoints: number;
		bidType: BiddingOption;
		specialRules?: {
			screamer?: boolean;
			assassin?: boolean;
		};
		gimmickType?: GimmickType;
	};
	isBotGame: boolean;
	dealerIndex?: number;
	hands?: Card[][];
	bidding?: {
		currentPlayer: string;
		currentBidderIndex: number;
		bids: (number | null)[];
		nilBids: Record<string, boolean>;
	};
	play?: {
		currentPlayer: string;
		currentPlayerIndex: number;
		currentTrick: Card[];
		leadSuit?: Suit;
		tricks: {
			cards: Card[];
			winnerIndex: number;
		}[];
		trickNumber: number;
		spadesBroken?: boolean;
	};
	team1Bags?: number;
	team2Bags?: number;
	// Solo mode properties
	playerScores?: number[];
	playerBags?: number[];
	winningPlayer?: number;
	winningTeam?: 'team1' | 'team2';
	currentPlayer?: string;
	lastActivity?: number; // Timestamp of last activity
	// NEW: Database tracking fields
	dbGameId?: string; // Database game ID for updates
	createdAt?: number; // Game creation timestamp
	rounds?: any[]; // Game rounds for logging
	// League game property
	league?: boolean; // Whether this is a league game created via Discord
	// Rated game property
	rated?: boolean; // Whether this is a rated game (4 human players)
	// League ready states (index 0..3 corresponds to seat)
	leagueReady?: boolean[];
	// Game state persistence fields
	currentRound?: number;
	currentTrick?: number;
	dealer?: number;
	roundHistory?: any[];
	currentTrickCards?: Card[];
	lastAction?: string;
	lastActionTime?: number;
	updatedAt?: number;
	// Additional properties
	completed?: boolean;
	winner?: number;
	finalScore?: number;
	solo?: boolean;
	creatorId?: string;
	allowNil?: boolean;
	allowBlindNil?: boolean;
	team1TotalScore?: number;
	team2TotalScore?: number;
} 