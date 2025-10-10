import express from 'express';
import { gameRoutes } from './games.js';
import { authRoutes } from './auth.js';
import { statsRoutes } from './stats.js';
import discordRoutes from './discord.js';
import adminRoutes from './admin.js';

export function setupRoutes(app) {
  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api/games', gameRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/discord', discordRoutes); // Discord OAuth routes
  app.use('/api/admin', adminRoutes); // Admin routes

  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  // Error handler
  app.use((error, req, res, next) => {
    console.error('[API] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  });
}
