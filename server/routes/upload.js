const express = require('express');
const multer = require('multer');
const path = require('path');
const { parseDocument } = require('../utils/docxParser');

const router = express.Router();

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../uploads/'))
    },
    filename: function (req, file, cb) {
        cb(null, 'knowledge_base.docx') // Overwrite the same file to keep it simple
    }
});

const upload = multer({ storage: storage });

router.post('/', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }
        
        // Parse the newly uploaded document
        const filePath = path.join(__dirname, '../uploads/knowledge_base.docx');
        const text = await parseDocument(filePath);
        
        // Store in global memory for the chatbot to use
        global.parsedDocumentText = text.toLowerCase();
        
        res.json({ message: 'File uploaded and parsed successfully!', size: text.length });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ error: 'Failed to process document.' });
    }
});

module.exports = router;
