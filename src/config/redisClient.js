import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // Requerido por BullMQ
});

redisConnection.on('error', (err) => console.error('❌ Redis Error:', err));
redisConnection.on('connect', () => console.log('✅ Conectado a Redis'));

export default redisConnection;