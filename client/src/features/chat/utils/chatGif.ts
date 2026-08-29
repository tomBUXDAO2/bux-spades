const GIPHY_HOST_RE = /^(?:media\d*\.|i\.)giphy\.com$/i;

export function parseChatGifUrl(message: string | null | undefined): string | null {
  const text = String(message || '').trim();
  if (!/^https:\/\//i.test(text)) return null;
  try {
    const u = new URL(text);
    if (!GIPHY_HOST_RE.test(u.hostname)) return null;
    return text;
  } catch {
    return null;
  }
}

export type GifSearchResult = {
  id: string;
  title: string;
  previewUrl: string;
  url: string;
};
