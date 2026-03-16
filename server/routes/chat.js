const express = require('express');
const router = express.Router();

router.post('/', (req, res) => {
    const { message } = req.body;
    
    if (!message) {
        return res.status(400).json({ error: 'Message is required.' });
    }

    const docText = (global.parsedDocumentText || "").toLowerCase();
    const query = message.toLowerCase();

    // Very basic keyword matching for demonstration.
    // In a real app, this could be sent to an LLM or a vector search.
    
    let response = "";

    if (!docText) {
        response = "Lo siento, aún no he cargado la base de conocimientos. Por favor, sube un documento Word en el panel de administrador.";
    } else {
        // Simple heuristic: search for the query in the document
        // This splits the document into sentences/paragraphs and looks for matches.
        const sections = docText.split(/[.\n]/);
        const matches = sections.filter(s => s.includes(query) && s.trim().length > 10);

        if (matches.length > 0) {
            response = "He encontrado esta información para ayudarte: \n\n" + matches.slice(0, 2).join('.\n') + ".";
        } else {
            response = "No estoy seguro de cómo ayudarte con eso basado en el documento actual. ¿Podrías intentar con otras palabras o contactar a soporte técnico directamente?";
        }
    }

    res.json({ reply: response });
});

module.exports = router;
