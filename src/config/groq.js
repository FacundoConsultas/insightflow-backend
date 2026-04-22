import Groq from "groq-sdk";
import 'dotenv/config';

// Inicializamos el cliente de Groq usando la variable de entorno que pusiste en Render
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export default groq;