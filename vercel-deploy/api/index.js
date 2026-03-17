require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');

const app = express();
app.use(cors());
app.use(express.json());

// Groq API Configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama3-8b-8192"; // Fast, free model from Groq

console.log("SYSTEM: EuroSupport AI v3.0.0 (Groq + Llama 3)");

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

// Chat Endpoint - Powered by Groq (Llama 3)
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required.' });

    if (!GROQ_API_KEY) {
        return res.json({
            reply: "Falta la API Key de Groq. Configúrala como 'GROQ_API_KEY' en las Variables de Entorno de Vercel.",
            suggestedCompany: null
        });
    }

    const systemPrompt = `
        Eres "Asistente EuroSupport", un agente de soporte técnico corporativo amable y profesional. 
        Responde SIEMPRE en español y de forma concisa.

        BASE DE CONOCIMIENTO DEL MANUAL:
        ${globalKnowledgeBase || "El manual no ha sido cargado. Usa tu conocimiento general de IT para ayudar."}

        INSTRUCCIONES CRITICAS:
        1. Usa la base de conocimiento anterior como tu fuente principal de respuestas.
        2. Detecta el área del problema del usuario y asigna la empresa correcta:
           - Problemas de red, internet, conectividad, VPN -> "Euroconnect"
           - Problemas de vehículos, mecánica, talleres, motores -> "TI Euromotors"
           - Problemas de software, sistemas, contraseñas, SIS, ERP -> "Mesa de Ayuda SIS"
        3. Si no coincide con ningún área, devuelve null en suggestedCompany.
        4. Responde SOLO y ÚNICAMENTE con un objeto JSON válido. Sin texto extra, sin markdown:
           { "reply": "Tu respuesta profesional aquí", "suggestedCompany": "Euroconnect" }
    `;

    try {
        const response = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: message }
                ],
                temperature: 0.7,
                max_tokens: 512,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Groq API Error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content || "{}";

        let jsonResponse;
        try {
            jsonResponse = JSON.parse(text);
        } catch {
            jsonResponse = { reply: text, suggestedCompany: null };
        }

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
