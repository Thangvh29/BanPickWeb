require('dotenv').config();
const express = require('express');
const sessionRoutes = require('./routes/sessionRoutes');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

app.use('/api/session', sessionRoutes);

module.exports = app;
