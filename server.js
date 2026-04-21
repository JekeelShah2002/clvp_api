const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// Routes
const uploadRoutes = require('./routes/upload');
const apiRoutes = require('./routes/api');
const authMiddleware = require('./middleware/auth');

// Secure all endpoints under /api
app.use('/api', authMiddleware);

app.use('/api/upload', uploadRoutes);
app.use('/api', apiRoutes);

// Base route so visitors don't see 404 when testing the root URL
app.get('/', (req, res) => {
    res.json({ message: 'CLV API is up and running!' });
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

module.exports = app;
