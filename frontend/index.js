require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');

const app = express();
app.use(cors());
app.use(express.json());

// We use NATIVE FETCH to call Gemini REST API directly (no SDK, avoids v1beta bug)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
// Using v1 (stable) endpoint directly
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

console.log("SYSTEM: EuroSupport AI v2.0.0 (Direct REST API Mode)");

let globalKnowledgeBase = "";

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Upload Endpoint
app.post('/api/upload', upload.single('document'), async (req, res) => {
    try {
        const { password } = req.body;
        if (password !== 'admin123') return res.status(401).json({ error: 'Contraseña incorrecta.' });
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        globalKnowledgeBase = result.value || "";
        console.log("Knowledge updated, length:", globalKnowledgeBase.length);
        res.json({ message: 'Conocimiento actualizado!', size: globalKnowledgeBase.length });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ error: 'Error al procesar el documento.' });
    }
});

// Chat Endpoint - Direct REST to Gemini v1 (stable)
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required.' });

    if (!GEMINI_API_KEY) {
        return res.json({ reply: "Falta la API Key de Gemini. Configúrala en Variables de Entorno de Vercel.", suggestedCompany: null });
    }

    const prompt = `
        Eres "Asistente EuroSupport", un agente de soporte técnico corporativo profesional. Responde siempre en ESPAÑOL.
        
        BASE DE CONOCIMIENTO:
        ${globalKnowledgeBase || "El manual aún no ha sido cargado. Usa tu conocimiento general de IT."}
        
        INSTRUCCIONES:
        1. Responde de forma amable, profesional y concisa basándote en la base de conocimiento.
        2. Si el problema es de red/internet/conectividad, el área es "Euroconnect".
        3. Si el problema es de mecánica/vehículos/transporte, el área es "TI Euromotors".
        4. Si el problema es de software/SIS/sistemas, el área es "Mesa de Ayuda SIS".
        5. CRÍTICO: Responde SOLO con un objeto JSON válido, sin markdown, sin texto extra:
           { "reply": "tu respuesta aquí", "suggestedCompany": "Euroconnect" }
        
        MENSAJE DEL USUARIO: ${message}
    `;

    try {
        const response = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 512 }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("Gemini API Error:", response.status, errText);
            throw new Error(`Gemini responded with ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const jsonResponse = jsonMatch ? JSON.parse(jsonMatch[0]) : { reply: text, suggestedCompany: null };

        res.json(jsonResponse);
    } catch (error) {
        console.error("Chat Error:", error.message);
        res.status(500).json({
            reply: `Error al conectar con la IA: ${error.message}`,
            suggestedCompany: null
        });
    }
});

// Login Endpoint
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'euro123') {
        res.json({ success: true, user: { name: 'Admin', role: 'admin' } });
    } else {
        res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }
});

module.exports = app;
