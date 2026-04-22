import express from 'express';
import { crearAnalisis, obtenerHistorial, eliminarAnalisis } from '../controllers/analisisController.js';

const router = express.Router();

// POST: Crea un nuevo análisis inteligente
router.post('/', crearAnalisis);

// GET: Recupera el historial (puedes filtrar con ?categoria=Queja)
router.get('/', obtenerHistorial);

// DELETE: Borra un registro específico por su ID
router.delete('/:id', eliminarAnalisis);

export default router;