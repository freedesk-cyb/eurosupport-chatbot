require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Gemini safely
const apiKey = process.env.GEMINI_API_KEY;
let genAI = null;
let model = null;

if (apiKey) {
    genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    console.log("AI: Gemini Initialized with API Key");
} else {
    console.error("AI: GEMINI_API_KEY is missing in environment variables");
}

let globalKnowledgeBase = "";

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/api/upload', upload.single('document'), async (req, res) => {
    try {
        const { password } = req.body;
        if (password !== 'admin123') return res.status(401).json({ error: 'Contraseña incorrecta.' });
        if (!req.file) return res.status(400).json({ error: 'No file.' });
        
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        globalKnowledgeBase = result.value || "";
        console.log("AI: Knowledge updated, length:", globalKnowledgeBase.length);
        res.json({ message: 'Conocimiento actualizado!', size: globalKnowledgeBase.length });
    } catch (error) {
        res.status(500).json({ error: 'Error al procesar documento.' });
    }
});

app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required.' });

    // Fallback if AI is not configured
    if (!model) {
        return res.json({ 
            reply: "El servicio de IA no está configurado (API Key faltante en Vercel). Por favor, contacta al administrador.", 
            suggestedCompany: null 
        });
    }

    try {
        const prompt = `
            Eres "Asistente EuroSupport". Responde en ESPAÑOL.
            CONTEXTO DEL MANUAL:
            ${globalKnowledgeBase || "El manual está actualmente vacío. Pide al usuario que suba las instrucciones en el panel de administración (icono de rayo)."}

            REGLAS:
            1. Si el manual tiene la respuesta, úsala. Si no, usa tu conocimiento general sobre IT de forma profesional.
            2. Identifica el área del problema:
               - Redes -> "Euroconnect"
               - Mecánica/Vehículos -> "TI Euromotors"
               - Software/Sistemas -> "Mesa de Ayuda SIS"
            3. Responde estrictamente con este formato JSON:
               { "reply": "...", "suggestedCompany": "Euroconnect" o "TI Euromotors" o "Mesa de Ayuda SIS" o null }

            USUARIO: ${message}
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const jsonResponse = jsonMatch ? JSON.parse(jsonMatch[0]) : { reply: text, suggestedCompany: null };

        res.json(jsonResponse);
    } catch (error) {
        console.error('AI Processing Error:', error);
        
        let errorMsg = "Hubo un error al conectar con Gemini.";
        if (error.message) {
            if (error.message.includes("API_KEY_INVALID")) errorMsg = "La API Key de Gemini no es válida. Por favor, revísala.";
            else if (error.message.includes("quota")) errorMsg = "Has superado el límite de uso gratuito de Gemini.";
            else errorMsg += " Detalle: " + error.message;
        }

        res.status(500).json({ 
            reply: errorMsg, 
            suggestedCompany: null 
        });
    }
});

// Mock Login Endpoint
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'euro123') {
        res.json({ success: true, user: { name: 'Admin', role: 'admin' } });
    } else {
        res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }
});

module.exports = app;
