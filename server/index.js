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
console.log("SYSTEM: EuroSupport AI v1.1.0 Starting...");
const apiKey = process.env.GEMINI_API_KEY;
let genAI = null;
let model = null;

if (apiKey) {
    try {
        genAI = new GoogleGenerativeAI(apiKey);
        // Usamos el nombre de modelo más estándar
        model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        console.log("AI: Gemini Initialized (Model: gemini-1.5-flash) - v1.1.0");
    } catch (e) {
        console.error("AI: Initialization failed:", e);
    }
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
        console.log("AI: Knowledge updated (v1.1.0)");
        res.json({ message: 'Conocimiento actualizado!', size: globalKnowledgeBase.length });
    } catch (error) {
        res.status(500).json({ error: 'Error al procesar documento.' });
    }
});

app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required.' });

    if (!model) {
        return res.json({ 
            reply: "[v1.1.0] Error: La IA no está inicializada. Revisa la API Key en Vercel.", 
            suggestedCompany: null 
        });
    }

    try {
        const prompt = `
            Eres "Asistente EuroSupport" (v1.1.0). 
            Contexto: ${globalKnowledgeBase || "Manual no cargado."}
            Instrucciones: Responde en español usando el contexto.
            Formato: JSON { "reply": "...", "suggestedCompany": "..." }
            
            Mensaje: ${message}
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const jsonResponse = jsonMatch ? JSON.parse(jsonMatch[0]) : { reply: text, suggestedCompany: null };

        res.json(jsonResponse);
    } catch (error) {
        console.error('AI Error (v1.1.0):', error);
        
        let detail = error.message || "Unknown Error";
        let userMessage = "[v1.1.0] Error persistente detectado.";
        
        if (detail.includes("404")) {
            userMessage = "Vercel sigue ejecutando código antiguo. Por favor, asegúrate de hacer un 'Redeploy' con 'Purge build cache'.";
        }

        res.status(500).json({ 
            reply: `${userMessage}\nDetalle Técnico: ${detail}`, 
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
