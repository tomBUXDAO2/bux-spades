/**
 * Session management utilities
 */

// Session management
const userSessions = new Map<string, string>(); // userId -> sessionId
const sessionToUser = new Map<string, string>(); // sessionId -> userId

/**
 * Creates a new user session
 */
export function createUserSession(userId: string): string {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  userSessions.set(userId, sessionId);
  sessionToUser.set(sessionId, userId);
  return sessionId;
}

/**
 * Gets user ID from session ID
 */
export function getUserIdFromSession(sessionId: string): string | undefined {
  return sessionToUser.get(sessionId);
}

/**
 * Gets session ID from user ID
 */
export function getSessionFromUser(userId: string): string | undefined {
  return userSessions.get(userId);
}

/**
 * Removes a user session
 */
export function removeUserSession(userId: string): void {
  const sessionId = userSessions.get(userId);
  if (sessionId) {
    userSessions.delete(userId);
    sessionToUser.delete(sessionId);
  }
}
