import { Worker } from 'bullmq';
import redisConnection from '../config/redisClient.js';

const worker = new Worker('analisis-mensajes', async (job) => {
  console.log(`🤖 Procesando ticket ID: ${job.id}`);
  const { texto } = job.data;

  // Aquí es donde llamaremos a Groq/IA más adelante
  console.log(`Analizando: ${texto}`);

  return { status: 'completed' };
}, { 
  connection: redisConnection,
  concurrency: 5 // Esto permite procesar 5 mensajes a la vez (Nivel Pro)
});

worker.on('completed', (job) => console.log(`✅ Ticket ${job.id} analizado`));
worker.on('failed', (job, err) => console.error(`❌ Falló ticket ${job.id}:`, err));

export default worker;