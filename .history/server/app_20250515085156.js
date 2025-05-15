require('dotenv').config();
const express = require('express');
const sessionRoutes = require('./routes/sessionRoutes');
const cors = require('cors');

const app = express();

app.use(express.json());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? 'https://<frontend-name>.onrender.com' 
    : 'http://localhost:5173',
  credentials: true
}));

app.use('/api/session', sessionRoutes);

module.exports = app;