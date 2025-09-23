import type { Game } from './types/game';

// Global games store
export const games: Game[] = [];

// Global state for seat replacements and disconnect timeouts
export const seatReplacements = new Map<string, { gameId: string; seatIndex: number; timer: NodeJS.Timeout; expiresAt: number }>();
export const disconnectTimeouts = new Map<string, NodeJS.Timeout>();

// Turn timeout tracking
export const turnTimeouts = new Map<string, { gameId: string; playerId: string; playerIndex: number; phase: 'bidding' | 'playing'; timer: NodeJS.Timeout | null; warningTimer: NodeJS.Timeout | null; consecutiveTimeouts: number; startTime: number }>(); 
