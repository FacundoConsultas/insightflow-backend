const express = require('express');
const cors = require('cors');
const app = express();
const analisisRoutes = require('./routes/analisisRoutes');

app.use(cors());
app.use(express.json());

// Ruta de prueba
app.get('/', (req, res) => res.send('API Funcionando 🚀'));

app.use('/api/analisis', analisisRoutes);

module.exports = app;