import 'dotenv/config';
import app from './src/app.js'; // IMPORTANTE: En ES Modules la extensión .js es OBLIGATORIA

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});