/**
 * Allowlisted Giphy media hosts for chat GIF messages.
 * Messages that are plain text pass through; only bare media URLs are validated.
 */

const GIPHY_HOST_RE = /^(?:media\d*\.|i\.)giphy\.com$/i;
const MEDIA_EXT_RE = /\.(?:gif|webp|png|jpe?g|mp4)(?:\?|$)/i;

export function isAllowedGifUrl(text) {
  try {
    const u = new URL(String(text || '').trim());
    if (u.protocol !== 'https:') return false;
    return GIPHY_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

/** Normalize/validate outbound chat text. Throws Error with status 400 on bad media URLs. */
export function sanitizeChatMessage(message) {
  const text = String(message || '').trim();
  if (!text) {
    const err = new Error('Message cannot be empty');
    err.status = 400;
    throw err;
  }

  if (/^https?:\/\//i.test(text)) {
    if (isAllowedGifUrl(text)) return text;
    if (MEDIA_EXT_RE.test(text)) {
      const err = new Error('Only Giphy GIFs can be shared as media');
      err.status = 400;
      throw err;
    }
  }

  return text;
}
