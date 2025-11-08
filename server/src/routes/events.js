import express from 'express';
import EventService from '../services/EventService.js';

const router = express.Router();

router.get('/active', async (req, res) => {
  try {
    const event = await EventService.getActiveEvent({
      includeCriteria: true,
      includeStats: false,
    });
    res.json({ event });
  } catch (error) {
    console.error('[EVENTS] Error fetching active event:', error);
    res.status(500).json({ error: 'Failed to fetch active event' });
  }
});

router.get('/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await EventService.getEventById(eventId, {
      includeCriteria: true,
      includeStats: false,
    });
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json({ event });
  } catch (error) {
    console.error('[EVENTS] Error fetching event:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

export const eventRoutes = router;

