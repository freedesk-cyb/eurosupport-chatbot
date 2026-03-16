const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Global knowledge base in-memory (For Vercel, this is ephemeral per instance)
// To make it persistent for everyone forever, a real DB (like Supabase/Mongo) is required.
let globalKnowledgeBase = "";

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Simple Auth Middleware
const isAdmin = (req, res, next) => {
    // In a real app, check session/token. Simulation for now.
    next();
};

// Upload Endpoint
app.post('/api/upload', upload.single('document'), async (req, res) => {
    try {
        const { password } = req.body;
        if (password !== 'admin123') { // Simple password check
            return res.status(401).json({ error: 'Contraseña incorrecta para carga de conocimiento.' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }
        
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        globalKnowledgeBase = result.value || "";
        
        res.json({ message: 'Global knowledge updated successfully!', size: globalKnowledgeBase.length });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ error: 'Failed to process document.' });
    }
});

// Chat Endpoint
app.post('/api/chat', (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required.' });

    const query = message.toLowerCase();
    let response = "";
    let suggestedCompany = null;

    // Check for "crear ticket" or "problema" to trigger special behavior
    if (query.includes('ticket') || query.includes('problema') || query.includes('crear')) {
        response = "Entiendo que quieres crear un ticket. Por favor, dime ¿cuál es exactamente el problema que tienes? (Ej: red, correos, software)";
        
        // Logical routing based on problem details if provided in same message
        if (query.includes('red') || query.includes('internet') || query.includes('conexion')) {
            suggestedCompany = 'Euroconnect';
            response = "Para problemas de red, el ticket debe crearse en **Euroconnect**. He resaltado el punto donde debes hacer click.";
        } else if (query.includes('hardware') || query.includes('computadora') || query.includes('laptop')) {
            suggestedCompany = 'TI Euromotors';
            response = "Para problemas de equipos, el ticket debe crearse en **TI Euromotors**. He resaltado el punto correspondiente.";
        } else if (query.includes('sistema') || query.includes('software') || query.includes('contraseña')) {
            suggestedCompany = 'Mesa de Ayuda SIS';
            response = "Para problemas de sistemas o software, el ticket debe crearse en **Mesa de Ayuda SIS**. Mira el recuadro resaltado.";
        }
    } else {
        const docText = globalKnowledgeBase.toLowerCase();
        if (!docText) {
            response = "Lo siento, aún no he cargado la base de conocimientos. Por favor, sube un documento Word en el panel de administrador.";
        } else {
            const sections = docText.split(/[.\n]/);
            const matches = sections.filter(s => s.includes(query) && s.trim().length > 10);

            if (matches.length > 0) {
                response = "He encontrado esta información para ayudarte: \n\n" + matches.slice(0, 2).join('.\n') + ".";
            } else {
                response = "No estoy seguro de cómo ayudarte con eso basado en el documento actual. ¿Podrías intentar con otras palabras o contactar a soporte técnico directamente?";
            }
        }
    }

    // Default company suggestions if not set by ticket logic
    if (!suggestedCompany) {
        if (query.includes('euroconnect') || query.includes('camion') || query.includes('transporte') || query.includes('logistica')) {
            suggestedCompany = 'Euroconnect';
        } else if (query.includes('euromotors') || query.includes('carro') || query.includes('auto') || query.includes('motor')) {
            suggestedCompany = 'TI Euromotors';
        } else if (query.includes('sis') || query.includes('sistema') || query.includes('ayuda')) {
            suggestedCompany = 'Mesa de Ayuda SIS';
        }
    }

    res.json({ reply: response, suggestedCompany });
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
