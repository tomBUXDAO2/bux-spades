import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
	user?: { id: string };
}

export const requireAuth: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
	try {
		const authHeader = req.headers.authorization;
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return res.status(401).json({ error: 'Authentication required' });
		}
		const token = authHeader.split(' ')[1];
		const secret = process.env.JWT_SECRET;
		if (!secret) {
			return res.status(500).json({ error: 'Server configuration error' });
		}
		const decoded = jwt.verify(token, secret) as { userId: string };
		if (!decoded?.userId) {
			return res.status(401).json({ error: 'Invalid token' });
		}
		(req as AuthenticatedRequest).user = { id: decoded.userId };
		return next();
	} catch (err) {
		return res.status(401).json({ error: 'Invalid token' });
	}
}; 