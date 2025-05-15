const express = require('express');
const Pusher = require('pusher');
require('dotenv').config();

const app = express();
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true
});

app.use(express.json());

app.post('/', async (req, res) => {
  const { channel, event, data } = req.body;
  try {
    await pusher.trigger(channel, event, data);
    res.status(200).json({ message: 'Event triggered' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to trigger event' });
  }
});

module.exports = { app, pusher }; // Export cả app và pusher để tái sử dụng