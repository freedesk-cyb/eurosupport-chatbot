require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Global knowledge base in-memory
let globalKnowledgeBase = "";

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Upload Endpoint
app.post('/api/upload', upload.single('document'), async (req, res) => {
    try {
        const { password } = req.body;
        if (password !== 'admin123') { 
            return res.status(401).json({ error: 'Contraseña incorrecta.' });
        }

        if (!req.file) return res.status(400).json({ error: 'No file.' });
        
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        globalKnowledgeBase = result.value || "";
        
        res.json({ message: 'Conocimiento actualizado!', size: globalKnowledgeBase.length });
    } catch (error) {
        res.status(500).json({ error: 'Error al procesar documento.' });
    }
});

// Chat Endpoint - AI POWERED
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required.' });

    try {
        const prompt = `
            Eres "Asistente EuroSupport", un experto en soporte técnico corporativo. 
            Tu objetivo es guiar al usuario usando EXCLUSIVAMENTE el siguiente manual de conocimiento como base de verdad.

            MANUAL DE CONOCIMIENTO (CONTEXTO):
            ${globalKnowledgeBase || "El manual está vacío. Pide al usuario que suba uno en el panel de administración."}

            REGLAS DE RESPUESTA:
            1. Responde de forma profesional, amable y concisa.
            2. Identifica si el problema del usuario pertenece a una de estas 3 áreas:
               - Red / Internet / Conectividad -> Sugerir: "Euroconnect"
               - Vehículos / Motores / Talleres -> Sugerir: "TI Euromotors"
               - Software / SIS / Sistemas especializados -> Sugerir: "Mesa de Ayuda SIS"
            3. Si no puedes responder con el manual, indícalo amablemente.
            4. IMPORTANTE: Tu respuesta DEBE ser un objeto JSON estrictamente válido con este formato:
               { "reply": "Tu respuesta aquí...", "suggestedCompany": "Euroconnect" o "TI Euromotors" o "Mesa de Ayuda SIS" o null }

            PREGUNTA DEL USUARIO: ${message}
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Clean JSON from Markdown if present
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const jsonResponse = jsonMatch ? JSON.parse(jsonMatch[0]) : { reply: text, suggestedCompany: null };

        res.json(jsonResponse);
    } catch (error) {
        console.error('AI Error:', error);
        res.status(500).json({ reply: "Lo siento, mi cerebro artificial está experimentando una sobrecarga. Intentemos de nuevo en un momento. 🛠️", suggestedCompany: null });
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
