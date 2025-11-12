import EventService from './EventService.js';
import EventAnalyticsService from './EventAnalyticsService.js';

const schedulerState = {
  intervalId: null,
  lastEventId: null,
  client: null,
};

const ANNOUNCEMENT_CHANNEL_ID = process.env.DISCORD_EVENTS_ANNOUNCEMENT_CHANNEL_ID || null;
const EVENT_ROLE_ID = process.env.DISCORD_EVENT_ROLE_ID || null;

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export async function startEventScheduler(discordClient) {
  if (!discordClient) {
    console.warn('[EVENT SCHEDULER] Discord client not provided. Scheduler not started.');
    return;
  }

  schedulerState.client = discordClient;

  if (schedulerState.intervalId) {
    clearInterval(schedulerState.intervalId);
  }

  await tickInternal();

  schedulerState.intervalId = setInterval(async () => {
    try {
      await tickInternal();
    } catch (error) {
      console.error('[EVENT SCHEDULER] Tick error:', error);
    }
  }, REFRESH_INTERVAL_MS);

  console.log('[EVENT SCHEDULER] Started with interval', REFRESH_INTERVAL_MS);
}

export async function stopEventScheduler() {
  if (schedulerState.intervalId) {
    clearInterval(schedulerState.intervalId);
    schedulerState.intervalId = null;
  }

  schedulerState.client = null;
  schedulerState.lastEventId = null;

  console.log('[EVENT SCHEDULER] Stopped');
}

async function tickInternal() {
  const event = await EventService.getActiveEvent({ includeCriteria: true, includeStats: true });
  if (!event) {
    if (schedulerState.lastEventId) {
      try {
        const completedEvent = await EventService.getEventById(schedulerState.lastEventId, {
          includeCriteria: true,
          includeStats: true,
        });
        if (completedEvent && completedEvent.status === 'COMPLETED') {
          await announceEventEnd(completedEvent);
        }
      } catch (error) {
        console.error('[EVENT SCHEDULER] Failed to fetch completed event for wrap-up:', error);
      }
    }
    schedulerState.lastEventId = null;
    return;
  }

  if (event.status === 'ACTIVE' && schedulerState.lastEventId !== event.id) {
    await announceEventStart(event);
    schedulerState.lastEventId = event.id;
  }

  if (event.status === 'ACTIVE') {
    await postMidEventUpdate(event);
  }

  if (event.status === 'COMPLETED' && schedulerState.lastEventId === event.id) {
    await announceEventEnd(event);
    schedulerState.lastEventId = null;
  }
}

async function announceEventStart(event) {
  try {
    const channel = await getAnnouncementChannel();
    if (!channel) return;

    const embed = await EventAnalyticsService.buildEventStartEmbed(event);
    const content = EVENT_ROLE_ID ? `<@&${EVENT_ROLE_ID}>` : null;

    await channel.send({
      content,
      embeds: [embed],
      allowedMentions: EVENT_ROLE_ID ? { roles: [EVENT_ROLE_ID] } : { parse: [] },
    });

    console.log('[EVENT SCHEDULER] Start announcement posted for event', event.id);
  } catch (error) {
    console.error('[EVENT SCHEDULER] Failed to post start announcement:', error);
  }
}

async function postMidEventUpdate(event) {
  try {
    const channel = await getAnnouncementChannel();
    if (!channel) return;

    const embed = await EventAnalyticsService.buildEventProgressEmbed(event);
    await channel.send({ embeds: [embed] });
    console.log('[EVENT SCHEDULER] Progress update posted for event', event.id);
  } catch (error) {
    console.error('[EVENT SCHEDULER] Failed to post progress update:', error);
  }
}

async function announceEventEnd(event) {
  try {
    const channel = await getAnnouncementChannel();
    if (!channel) return;

    const embed = await EventAnalyticsService.buildEventEndEmbed(event);
    const content = EVENT_ROLE_ID ? `<@&${EVENT_ROLE_ID}>` : null;

    await channel.send({
      content,
      embeds: [embed],
      allowedMentions: EVENT_ROLE_ID ? { roles: [EVENT_ROLE_ID] } : { parse: [] },
    });

    console.log('[EVENT SCHEDULER] End announcement posted for event', event.id);
  } catch (error) {
    console.error('[EVENT SCHEDULER] Failed to post end announcement:', error);
  }
}

async function getAnnouncementChannel() {
  if (!schedulerState.client) {
    console.warn('[EVENT SCHEDULER] Discord client not available');
    return null;
  }

  if (!ANNOUNCEMENT_CHANNEL_ID) {
    console.warn('[EVENT SCHEDULER] Announcement channel ID not configured');
    return null;
  }

  try {
    const channel = await schedulerState.client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
    if (!channel) {
      console.warn('[EVENT SCHEDULER] Announcement channel not found');
    }
    return channel;
  } catch (error) {
    console.error('[EVENT SCHEDULER] Error fetching announcement channel:', error);
    return null;
  }
}

