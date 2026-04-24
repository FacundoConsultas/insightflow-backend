import { Queue } from 'bullmq';
import redisConnection from '../config/redisClient.js';

// Esta es la fila de mensajes esperando ser procesados
export const analysisQueue = new Queue('analisis-mensajes', {
  connection: redisConnection,
});

console.log('🚀 Fila de análisis lista');