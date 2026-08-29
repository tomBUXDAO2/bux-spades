import express from 'express';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

function mapGiphyItems(data) {
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => {
      const images = item?.images || {};
      const previewUrl =
        images.fixed_width_small?.url ||
        images.preview_gif?.url ||
        images.fixed_height_small?.url ||
        images.downsized_still?.url;
      const url =
        images.downsized?.url ||
        images.fixed_width?.url ||
        images.original?.url ||
        previewUrl;
      if (!url) return null;
      return {
        id: item.id,
        title: item.title || '',
        previewUrl: previewUrl || url,
        url
      };
    })
    .filter(Boolean);
}

async function giphyFetch(pathname, query) {
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) {
    const err = new Error('GIF search is not configured');
    err.status = 503;
    throw err;
  }
  const params = new URLSearchParams({
    api_key: apiKey,
    limit: String(query.limit || 24),
    rating: 'pg-13',
    ...query.extra
  });
  const res = await fetch(`https://api.giphy.com/v1/gifs/${pathname}?${params}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[GIFS] Giphy error', res.status, body.slice(0, 200));
    const err = new Error('GIF search failed');
    err.status = 502;
    throw err;
  }
  return res.json();
}

router.get('/search', authenticateToken, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '24'), 10) || 24, 1), 48);
    const json = await giphyFetch('search', { limit, extra: { q } });
    res.json({ gifs: mapGiphyItems(json.data) });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('[GIFS] search', error);
    res.status(status).json({ error: error.message || 'GIF search failed' });
  }
});

router.get('/trending', authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '24'), 10) || 24, 1), 48);
    const json = await giphyFetch('trending', { limit, extra: {} });
    res.json({ gifs: mapGiphyItems(json.data) });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('[GIFS] trending', error);
    res.status(status).json({ error: error.message || 'GIF trending failed' });
  }
});

export default router;
