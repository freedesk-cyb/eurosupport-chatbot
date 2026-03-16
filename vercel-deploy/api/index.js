const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// For Vercel, we'll use /tmp to store the persistent knowledge base text
// Note: This is ephemeral but sufficient for a demo session.
const KB_PATH = path.join('/tmp', 'knowledge_base.txt');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Upload Endpoint
app.post('/api/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }
        
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        const text = result.value || "";
        
        // Save to /tmp
        fs.writeFileSync(KB_PATH, text);
        
        res.json({ message: 'File uploaded and parsed successfully!', size: text.length });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ error: 'Failed to process document.' });
    }
});

// Chat Endpoint
app.post('/api/chat', (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required.' });

    let docText = "";
    if (fs.existsSync(KB_PATH)) {
        docText = fs.readFileSync(KB_PATH, 'utf8').toLowerCase();
    }

    const query = message.toLowerCase();
    let response = "";

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

    // Suggest a company based on keywords
    let suggestedCompany = null;
    if (query.includes('euroconnect') || query.includes('camion') || query.includes('transporte') || query.includes('logistica')) {
        suggestedCompany = 'Euroconnect';
    } else if (query.includes('euromotors') || query.includes('carro') || query.includes('auto') || query.includes('motor')) {
        suggestedCompany = 'TI Euromotors';
    } else if (query.includes('sis') || query.includes('sistema') || query.includes('ayuda') || query.includes('ticket')) {
        suggestedCompany = 'Mesa de Ayuda SIS';
    }

    res.json({ reply: response, suggestedCompany });
});

module.exports = app;
