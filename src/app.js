import express from 'express';
import cors from 'cors';
import analisisRoutes from './routes/analisisRoutes.js'; // CAMBIO: import y agregado de .js

const app = express();

app.use(cors());
app.use(express.json());

// Ruta de prueba
app.get('/', (req, res) => res.send('API Funcionando 🚀'));

app.use('/api/analisis', analisisRoutes);

export default app;