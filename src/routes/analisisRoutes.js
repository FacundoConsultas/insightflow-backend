import express from 'express';
import { crearAnalisis, obtenerHistorial } from '../controllers/analisisController.js';

const router = express.Router();

// POST: Crea un nuevo análisis procesado por IA y lo guarda
router.post('/', crearAnalisis);

// GET: Recupera todos los análisis guardados en Supabase
router.get('/', obtenerHistorial);

export default router;