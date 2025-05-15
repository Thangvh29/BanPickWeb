const Room = require('../models/Room');
const bcrypt = require('bcryptjs');

const authRoom = async (req, res, next) => {
  const code = req.params.code; // Lấy code từ URL params
  const { password } = req.body;
  const room = await Room.findOne({ code });
  if (!room) return res.status(404).json({ message: 'Room not found' });

  const isMatch = await bcrypt.compare(password, room.password);
  if (!isMatch) return res.status(401).json({ message: 'Invalid password' });

  req.room = room;
  next();
};

module.exports = authRoom;