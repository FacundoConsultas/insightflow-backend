const express = require('express');
const router = express.Router();
const analisisController = require('../controllers/analisisController');

router.post('/', analisisController.analizarTexto);
router.get('/historial', analisisController.obtenerHistorial);

module.exports = router;