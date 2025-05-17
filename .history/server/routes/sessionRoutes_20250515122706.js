const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pusher } = require('../api/pusher'); // Tái sử dụng pusher
require('dotenv').config();

// Middleware kiểm tra token
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = decoded;
    next();
  });
};

// Mock User model (thay bằng Mongoose schema thực tế)
const User = {
  findOne: async (query) => {
    const users = {
      player1: { username: 'player1', password: await bcrypt.hash('password1', 10), role: 'player1' },
      player2: { username: 'player2', password: await bcrypt.hash('password2', 10), role: 'player2' }
    };
    return users[query.username] || null;
  }
};

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const token = jwt.sign({ role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, role: user.role });
});

router.get('/verify', authenticateToken, (req, res) => {
  res.json({ role: req.user.role });
});

router.post('/logout', authenticateToken, (req, res) => {
  res.json({ message: 'Logged out' });
});

router.post('/update', authenticateToken, async (req, res) => {
  const { banCount, pickCount } = req.body;
  // Logic update session
  pusher.trigger('banpick-channel', 'sessionUpdate', { banCount, pickCount });
  res.json({ message: 'Session updated' });
});

router.post('/ready', authenticateToken, async (req, res) => {
  const { role } = req.user;
  // Logic ready
  pusher.trigger('banpick-channel', 'sessionUpdate', { readyStatus: { [role === 'player1' ? 'player1Ready' : 'player2Ready']: true } });
  res.json({ message: 'Ready status updated' });
});

router.post('/coinflip', authenticateToken, async (req, res) => {
  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  const firstTurn = Math.random() < 0.5 ? 'team1' : 'team2';
  pusher.trigger('banpick-channel', 'coinFlip', { firstTurn, coinFace: result });
  res.json({ message: 'Coin flipped' });
});

router.post('/select', authenticateToken, async (req, res) => {
  const { weaponId } = req.body;
  // Logic select weapon
  pusher.trigger('banpick-channel', 'sessionUpdate', { selectedWeapons: [weaponId] });
  res.json({ message: 'Weapon selected' });
});

router.post('/lockin', authenticateToken, async (req, res) => {
  const { weaponId, action } = req.body;
  // Logic lockin
  pusher.trigger('banpick-channel', 'sessionUpdate', { [action]: [{ weaponId, team: req.user.role === 'player1' ? 'team1' : 'team2' }] });
  res.json({ message: 'Action locked' });
});

router.post('/reset', authenticateToken, async (req, res) => {
  // Logic reset
  pusher.trigger('banpick-channel', 'sessionUpdate', { reset: true });
  res.json({ message: 'Session reset' });
});

module.exports = router;