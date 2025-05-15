const app = require('./app');
const connectDB = require('./config/db');
require('dotenv').config();

// Kết nối MongoDB
const startServer = async () => {
  try {
    await connectDB();
    console.log('MongoDB connected');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;