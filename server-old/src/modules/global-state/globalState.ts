import { AuthenticatedSocket } from '../socket-auth';

// Global state
export const authenticatedSockets = new Map<string, AuthenticatedSocket>();
export const onlineUsers = new Set<string>();

// Session management
export const userSessions = new Map<string, string>(); // userId -> sessionId
export const sessionToUser = new Map<string, string>(); // sessionId -> userId

// Inactivity tracking
export const tableInactivityTimers = new Map<string, NodeJS.Timeout>();
export const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes in milliseconds
