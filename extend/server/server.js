const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const initRooms = require('./initRooms');
require('dotenv').config();

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const startServer = async () => {
  await connectDB();
  await initRooms();
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();