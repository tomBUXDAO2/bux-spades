/**
 * Resolve @mentions in chat text against a candidate list (longest username first).
 * Supports multi-word usernames inserted via autocomplete.
 */

export const EVERYONE_MENTION = 'everyone';

/** True if text contains a standalone @everyone token. */
export function hasEveryoneMention(text) {
  if (!text || typeof text !== 'string') return false;
  return /(?:^|[^A-Za-z0-9._-])@everyone(?:$|[^A-Za-z0-9_])/i.test(text);
}

/**
 * @param {string} text
 * @param {Array<{ id?: string, userId?: string, username?: string, userName?: string, name?: string }>} candidates
 * @returns {Array<{ userId: string, username: string }>}
 */
export function resolveMentions(text, candidates = []) {
  if (!text || typeof text !== 'string' || !Array.isArray(candidates) || !candidates.length) {
    return [];
  }

  const normalized = [];
  const seenIds = new Set();
  for (const c of candidates) {
    const userId = c?.id || c?.userId;
    const username = String(c?.username || c?.userName || c?.name || '').trim();
    if (!userId || !username || seenIds.has(userId)) continue;
    // @everyone is admin-only and handled separately
    if (username.toLowerCase() === EVERYONE_MENTION) continue;
    seenIds.add(userId);
    normalized.push({ userId, username });
  }

  normalized.sort((a, b) => b.username.length - a.username.length);

  const found = new Map();
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '@') {
      i += 1;
      continue;
    }
    // Skip email-like: word char immediately before @
    if (i > 0 && /[A-Za-z0-9._-]/.test(text[i - 1])) {
      i += 1;
      continue;
    }

    const rest = text.slice(i + 1);
    let matched = null;
    for (const c of normalized) {
      if (rest.length < c.username.length) continue;
      if (rest.slice(0, c.username.length).toLowerCase() !== c.username.toLowerCase()) continue;
      const after = rest[c.username.length];
      // Allow end, whitespace, or punctuation — not another username char
      if (after && /[A-Za-z0-9_]/.test(after)) continue;
      matched = c;
      break;
    }

    if (matched) {
      found.set(matched.userId, matched);
      i += 1 + matched.username.length;
    } else {
      i += 1;
    }
  }

  return Array.from(found.values());
}

/**
 * Emit an event to every connected socket for a user.
 * @param {import('socket.io').Server} io
 * @param {string} userId
 * @param {string} event
 * @param {any} payload
 */
export function emitToUser(io, userId, event, payload) {
  if (!io || !userId) return;
  for (const sock of io.sockets.sockets.values()) {
    if (sock.userId === userId) {
      sock.emit(event, payload);
    }
  }
}
