require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Groq API Configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

console.log("SYSTEM: EuroSupport AI v4.0.0 (Smart Routing + Manual Pre-Analysis)");

// Knowledge Storage
const KNOWLEDGE_FILE = path.join(__dirname, 'knowledge_store.json');
let globalKnowledgeBase = "";    // Raw text from manual
let routingMap = {               // Pre-analyzed routing map extracted from manual
    euroconnect: [],             // Keywords/topics for Euroconnect
    euromotors: [],              // Keywords/topics for TI Euromotors
    sis: [],                     // Keywords/topics for Mesa de Ayuda SIS
    analyzed: false
};

// Persistence functions
function saveKnowledge() {
    try {
        const data = {
            globalKnowledgeBase,
            routingMap
        };
        fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(data, null, 2));
        console.log("Knowledge persisted to", KNOWLEDGE_FILE);
    } catch (e) {
        console.error("Failed to save knowledge:", e.message);
    }
}

function loadKnowledge() {
    try {
        if (fs.existsSync(KNOWLEDGE_FILE)) {
            const data = JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, 'utf8'));
            globalKnowledgeBase = data.globalKnowledgeBase || "";
            routingMap = data.routingMap || routingMap;
            console.log("Knowledge loaded from", KNOWLEDGE_FILE, "(Size:", globalKnowledgeBase.length, ")");
        }
    } catch (e) {
        console.error("Failed to load knowledge:", e.message);
    }
}

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Helper: Call Groq AI
async function callGroq(systemPrompt, userMessage, jsonMode = true) {
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
                { role: "user", content: userMessage }
            ],
            temperature: 0.1,
            max_tokens: 1024,
            ...(jsonMode ? { response_format: { type: "json_object" } } : {})
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq Error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || "";
}

// PHASE 1: Analyze the manual on upload and build a routing map
async function analyzeManualForRouting(manualText) {
    const analysisPrompt = `
Eres un experto en análisis de documentos corporativos. Tu tarea es leer el siguiente manual de soporte técnico
y extraer EXACTAMENTE qué temas, problemas o palabras clave corresponden a cada departamento.

DEPARTAMENTOS:
- "euroconnect": Todo lo relacionado con red, internet, conectividad, VPN, switches, routers, fibra, wifi
- "euromotors": Todo lo relacionado con vehículos, mecánica, talleres, flotas, camiones, autos, motores
- "sis": Todo lo relacionado con software, sistemas, contraseñas, correo, ERP, apps, hardware de cómputo

Lee el manual cuidadosamente y extrae los temas específicos mencionados en él para cada departamento.
Si el manual no menciona un departamento, deja su lista vacía.

Responde SOLO con este JSON:
{
  "euroconnect": ["tema1", "tema2", "..."],
  "euromotors": ["tema1", "tema2", "..."],
  "sis": ["tema1", "tema2", "..."],
  "summary": "Resumen en 2 líneas de qué cubre este manual"
}
`;

    try {
        const result = await callGroq(analysisPrompt, manualText.substring(0, 6000));
        const parsed = JSON.parse(result);
        return parsed;
    } catch (e) {
        console.error("Manual analysis failed:", e.message);
        return { euroconnect: [], euromotors: [], sis: [], summary: "Análisis no disponible" };
    }
}

// Upload Endpoint - Now with AI pre-analysis
app.post('/api/upload', upload.single('document'), async (req, res) => {
    try {
        const { password } = req.body;
        if (password !== 'admin123') return res.status(401).json({ error: 'Contraseña incorrecta.' });
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

        // Extract text from Word document
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        globalKnowledgeBase = result.value || "";

        console.log("Manual uploaded, length:", globalKnowledgeBase.length);

        if (!GROQ_API_KEY) {
            return res.json({ message: 'Conocimiento actualizado (sin análisis IA - falta API Key)', size: globalKnowledgeBase.length });
        }

        // PHASE 1: Pre-analyze the manual with AI to build routing map
        console.log("Analyzing manual for routing...");
        const analysis = await analyzeManualForRouting(globalKnowledgeBase);

        routingMap = {
            euroconnect: analysis.euroconnect || [],
            euromotors: analysis.euromotors || [],
            sis: analysis.sis || [],
            analyzed: true,
            summary: analysis.summary || ""
        };

        console.log("Routing map built:", JSON.stringify(routingMap, null, 2));

        // Persist knowledge to file
        saveKnowledge();

        res.json({
            message: '¡Manual analizado y cargado con éxito!',
            size: globalKnowledgeBase.length,
            routing_summary: routingMap.summary,
            topics_found: {
                euroconnect: routingMap.euroconnect.length,
                euromotors: routingMap.euromotors.length,
                sis: routingMap.sis.length
            }
        });
    } catch (error) {
        console.error("Upload/Analysis error:", error);
        res.status(500).json({ error: 'Error al procesar el documento: ' + error.message });
    }
});

// Chat Endpoint - Uses pre-analyzed routing map
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required.' });

    if (!GROQ_API_KEY) {
        return res.json({
            reply: "Falta la API Key de Groq. Configúrala en las Variables de Entorno de Vercel.",
            suggestedCompany: null
        });
    }

    // Build routing context from pre-analyzed map
    const routingContext = routingMap.analyzed
        ? `
MAPA DE RUTAS APRENDIDO DEL MANUAL:
- Temas de EUROCONNECT (Red/Internet): ${routingMap.euroconnect.join(', ') || 'No identificados en el manual'}
- Temas de TI EUROMOTORS (Vehículos): ${routingMap.euromotors.join(', ') || 'No identificados en el manual'}
- Temas de MESA DE AYUDA SIS (Software): ${routingMap.sis.join(', ') || 'No identificados en el manual'}
`
        : `
CLASIFICACIÓN ESTÁNDAR (sin manual cargado):
- EUROCONNECT: internet, red, wifi, VPN, router, switch, cable, conexión, DNS
- TI EUROMOTORS: camión, vehículo, motor, taller, mecánico, flota, llanta
- MESA DE AYUDA SIS: contraseña, software, sistema, correo, ERP, impresora, laptop
`;

    const systemPrompt = `
Eres "Asistente EuroSupport", un experto en soporte técnico corporativo. Responde en ESPAÑOL.

BASE DE CONOCIMIENTO DEL MANUAL:
${globalKnowledgeBase ? globalKnowledgeBase.substring(0, 4000) : "Manual no cargado."}

${routingContext}

INSTRUCCIONES:
1. Responde la pregunta del usuario usando la base de conocimiento.
2. Determina a qué empresa debe dirigirse el usuario para crear su ticket basándote en el MAPA DE RUTAS.
3. Si el tema del usuario coincide con algún tema del mapa de rutas, usa ese departamento.
4. Si no coincide con ninguno, usa null.

FORMATO OBLIGATORIO - responde SOLO con este JSON:
{ "reply": "Respuesta aquí", "suggestedCompany": "Euroconnect" }

Valores válidos para suggestedCompany: "Euroconnect", "TI Euromotors", "Mesa de Ayuda SIS", null
`;

    try {
        const text = await callGroq(systemPrompt, message);

        let jsonResponse;
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            jsonResponse = jsonMatch ? JSON.parse(jsonMatch[0]) : { reply: text, suggestedCompany: null };
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
 
// Load knowledge on startup
loadKnowledge();

module.exports = app;
