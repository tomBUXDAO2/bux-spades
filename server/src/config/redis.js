import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  console.error('[REDIS] Connection error:', err);
});

redisClient.on('connect', () => {
  console.log('[REDIS] Connected to Redis');
});

redisClient.on('ready', () => {
  console.log('[REDIS] Ready to accept commands');
});

redisClient.on('end', () => {
  console.log('[REDIS] Connection ended');
});

// Connect to Redis
async function connectRedis() {
  try {
    await redisClient.connect();
    console.log('[REDIS] Successfully connected to Redis');
  } catch (error) {
    console.error('[REDIS] Failed to connect:', error);
  }
}

// Connect in background
connectRedis();

export { redisClient };
