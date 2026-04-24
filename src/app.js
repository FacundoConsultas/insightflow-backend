import express from 'express';
import cors from 'cors';
import analisisRoutes from './routes/analisisRoutes.js';

const app = express();

// Configuración de CORS más robusta
app.use(cors({
  origin: '*', // Permite peticiones de cualquier origen (Vercel, Localhost, etc.)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Ruta de prueba
app.get('/', (req, res) => res.send('API Funcionando 🚀'));

app.use('/api/analisis', analisisRoutes);

export default app;