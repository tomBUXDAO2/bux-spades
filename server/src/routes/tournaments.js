import express from 'express';
import { TournamentService } from '../services/TournamentService.js';

const router = express.Router();

// List active / upcoming tournaments for the lobby section (must be before /:id)
router.get('/', async (req, res) => {
  try {
    const tournaments = await TournamentService.getTournaments({ limit: 30 });
    const visible = (tournaments || []).filter(
      (t) => t.status !== 'CANCELLED' && !t.leagueId
    );
    res.json({ tournaments: visible });
  } catch (error) {
    console.error('[TOURNAMENTS] Error listing tournaments:', error);
    res.status(500).json({ error: 'Failed to list tournaments' });
  }
});

// Get tournament by ID (public - for lobby page)
router.get('/:tournamentId', async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const tournament = await TournamentService.getTournament(tournamentId);

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    res.json({ tournament });
  } catch (error) {
    console.error('[TOURNAMENTS] Error fetching tournament:', error);
    res.status(500).json({ error: 'Failed to fetch tournament' });
  }
});

export { router as tournamentRoutes };
