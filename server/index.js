const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Set up globals
global.parsedDocumentText = "";

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Routes
const uploadRoute = require('./routes/upload');
const chatRoute = require('./routes/chat');

app.use('/api/upload', uploadRoute);
app.use('/api/chat', chatRoute);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
