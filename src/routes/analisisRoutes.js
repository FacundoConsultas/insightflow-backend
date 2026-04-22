import express from 'express';
import { crearAnalisis } from '../controllers/analisisController.js'; // Importación nombrada y con .js

const router = express.Router();

// Ruta para crear un nuevo análisis
router.post('/', crearAnalisis);

// Si todavía no creaste la función de historial, podés dejarla comentada 
// o crearla después en el controlador. Por ahora la comentamos para que no falle:
// router.get('/historial', obtenerHistorial);

export default router;