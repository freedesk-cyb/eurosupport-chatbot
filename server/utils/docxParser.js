const mammoth = require('mammoth');

async function parseDocument(filePath) {
    try {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value || "";
    } catch (err) {
        console.error("Error parsing document with mammoth:", err);
        throw err;
    }
}

module.exports = { parseDocument };
