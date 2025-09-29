import { Router } from 'express';
import { register, login, getProfile, updateProfile, updateSoundPreference } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.get('/profile', requireAuth, getProfile);
router.put('/profile', requireAuth, updateProfile);
router.put('/sound-preference', requireAuth, updateSoundPreference);
export default router; 