import { AnyZodObject, ZodEffects } from 'zod';
import { Request, Response, NextFunction } from 'express';

export function validate(schema: AnyZodObject | ZodEffects<any>, source: 'body' | 'query' | 'params' = 'body') {
	return (req: Request, res: Response, next: NextFunction) => {
		try {
			const data = (req as any)[source];
			schema.parse(data);
			return next();
		} catch (err: any) {
			return res.status(400).json({ error: 'Validation failed', details: err?.errors || err?.message });
		}
	};
} 