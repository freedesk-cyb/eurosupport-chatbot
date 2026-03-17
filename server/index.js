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
    // Usamos gemini-1.5-flash que es el modelo más estable y rápido actualmente
    model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    console.log("AI: Gemini Initialized (Model: gemini-1.5-flash)");
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
            reply: "El servicio de IA no está configurado (API Key faltante). Por favor, configúrala en el panel de Vercel.", 
            suggestedCompany: null 
        });
    }

    try {
        console.log("AI: Processing message...");
        const prompt = `
            Eres "Asistente EuroSupport". Responde en ESPAÑOL.
            CONTEXTO: ${globalKnowledgeBase || "Manual vacío."}
            REGLAS:
            1. Usa el contexto para responder.
            2. Áreas: Euroconnect (Red), TI Euromotors (Mecánica), Mesa de Ayuda SIS (Software).
            3. Formato JSON: { "reply": "...", "suggestedCompany": "..." }

            MENSAJE: ${message}
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const jsonResponse = jsonMatch ? JSON.parse(jsonMatch[0]) : { reply: text, suggestedCompany: null };

        res.json(jsonResponse);
    } catch (error) {
        console.error('AI Error:', error);
        
        let detail = error.message || "Error desconocido";
        let userMessage = "Lo siento, tengo un problema técnico al conectar con mi cerebro (Gemini).";
        
        if (detail.includes("404")) {
            userMessage = "ERROR 404: Vercel sigue usando una versión antigua del sistema. Por favor, haz un 'Redeploy' en Vercel desmarcando 'Use existing build cache'.";
        } else if (detail.includes("API_KEY_INVALID")) {
            userMessage = "La API Key configurada no es válida.";
        }

        res.status(500).json({ 
            reply: userMessage + " Detalle: " + detail, 
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
