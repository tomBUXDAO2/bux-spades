import { Request, Response, NextFunction } from 'express';

interface Bucket {
	count: number;
	expiresAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit({ windowMs = 60_000, max = 60, key = 'default' }: { windowMs?: number; max?: number; key?: string } = {}) {
	return (req: Request, res: Response, next: NextFunction) => {
		const ip = req.ip || req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown';
		const bucketKey = `${key}:${ip}`;
		const now = Date.now();
		const b = buckets.get(bucketKey);
		if (!b || b.expiresAt < now) {
			buckets.set(bucketKey, { count: 1, expiresAt: now + windowMs });
			return next();
		}
		if (b.count >= max) {
			return res.status(429).json({ error: 'Too many requests' });
		}
		b.count += 1;
		next();
	};
} 