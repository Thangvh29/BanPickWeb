const Room = require('../models/Room');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'a-very-secure-secret-key-123456';

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
};

exports.register = async (req, res) => {
  const { username, password, email } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: 'Tên người dùng đã tồn tại' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword, email });
    await user.save();

    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ token, username: user.username });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi đăng ký', error });
  }
};

exports.login = async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(400).json({ message: 'Tên người dùng không tồn tại' });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ message: 'Mật khẩu không đúng' });

  const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, username: user.username });
};

exports.verifyToken = (req, res) => {
  res.json({ username: req.user.username });
};

exports.joinRoom = async (req, res) => {
  const { code } = req.body;
  try {
    const room = await Room.findOne({ code });
    if (!room) return res.status(404).json({ message: 'Phòng không tồn tại' });

    if (room.players.length >= 2 && !room.players.some(p => p.userId.toString() === req.user.id)) {
      return res.status(400).json({ message: 'Phòng đã đủ 2 người chơi' });
    }

    if (room.players.length === 0) {
      room.players.push({ userId: req.user.id, role: 'player1', status: 'approved' });
      await room.save();
      return res.json({ message: 'Joined as player1', room, role: 'player1' });
    }

    if (room.players.length === 1 && !room.players.some(p => p.userId.toString() === req.user.id)) {
      room.players.push({ userId: req.user.id, role: 'player2', status: 'pending' });
      await room.save();
      return res.json({ message: 'Requested to join as player2, waiting for approval', room, role: 'player2' });
    }

    res.json({ message: 'Already in room', room, role: room.players.find(p => p.userId.toString() === req.user.id).role });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi tham gia phòng', error });
  }
};

exports.approvePlayer = async (req, res) => {
  const { code, userId, approve } = req.body;
  try {
    const room = await Room.findOne({ code });
    if (!room) return res.status(404).json({ message: 'Phòng không tồn tại' });
    if (!room.players.some(p => p.userId.toString() === req.user.id && p.role === 'player1')) {
      return res.status(403).json({ message: 'Chỉ player1 có thể duyệt' });
    }

    const player2 = room.players.find(p => p.userId.toString() === userId && p.role === 'player2');
    if (!player2) return res.status(404).json({ message: 'Người chơi không tồn tại' });

    if (approve) {
      player2.status = 'approved';
    } else {
      room.players = room.players.filter(p => p.userId.toString() !== userId);
    }
    await room.save();
    res.json({ message: approve ? 'Người chơi được chấp nhận' : 'Người chơi bị từ chối', room });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi duyệt người chơi', error });
  }
};

exports.leaveRoom = async (req, res) => {
  const { code } = req.body;
  try {
    const room = await Room.findOne({ code });
    if (!room) return res.status(404).json({ message: 'Phòng không tồn tại' });

    room.players = room.players.filter(p => p.userId.toString() !== req.user.id);
    if (room.players.length === 0) {
      await Room.deleteOne({ code }); // Xóa phòng nếu không còn ai
    } else {
      await room.save();
    }
    res.json({ message: 'Rời phòng thành công' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi rời phòng', error });
  }
};

exports.getRooms = async (req, res) => {
  try {
    const rooms = await Room.find({}, 'code players').lean();
    res.json(rooms.map(room => ({
      code: room.code,
      playerCount: room.players.length,
      isFull: room.players.length >= 2,
    })));
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách phòng', error });
  }
};

exports.getRoom = async (req, res) => {
  const { code } = req.params;
  try {
    const room = await Room.findOne({ code });
    if (!room) return res.status(404).json({ message: 'Phòng không tồn tại' });
    if (!room.players.some(p => p.userId.toString() === req.user.id)) {
      return res.status(403).json({ message: 'Bạn không ở trong phòng này' });
    }
    res.json(room);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy thông tin phòng', error });
  }
};

exports.selectWeapon = async (req, res) => {
  const { code, weaponId } = req.body;
  try {
    const room = await Room.findOne({ code });
    if (!room) return res.status(404).json({ message: 'Phòng không tồn tại' });
    if (!room.players.some(p => p.userId.toString() === req.user.id && p.role === 'player1')) {
      return res.status(403).json({ message: 'Chỉ player1 có thể chọn súng' });
    }
    if (room.selectedWeapons.includes(weaponId)) return res.status(400).json({ message: 'Súng đã được chọn' });
    room.selectedWeapons.push(weaponId);
    await room.save();
    res.json({ message: 'Súng được chọn', selectedWeapons: room.selectedWeapons });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi chọn súng', error });
  }
};

exports.update = async (req, res) => {
  const { code, banCount, pickCount } = req.body;
  try {
    const room = await Room.findOne({ code });
    if (!room) return res.status(404).json({ message: 'Phòng không tồn tại' });
    if (!room.players.some(p => p.userId.toString() === req.user.id && p.role === 'player1')) {
      return res.status(403).json({ message: 'Chỉ player1 có thể cập nhật' });
    }
    room.banCount = parseInt(banCount) || 0;
    room.pickCount = parseInt(pickCount) || 0;
    await room.save();
    res.json({ message: 'Phòng được cập nhật', room });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi cập nhật phòng', error });
  }
};

exports.banWeapon = async (req, res) => {
  const { code, weaponId } = req.body;
  try {
    const room = await Room.findOne({ code });
    if (!room) return res.status(404).json({ message: 'Phòng không tồn tại' });
    if (room.isCompleted) return res.status(400).json({ message: 'Phòng đã hoàn thành' });
    if (room.actionType !== 'ban') return res.status(400).json({ message: 'Không phải lượt ban' });
    const player = room.players.find(p => p.userId.toString() === req.user.id);
    if (!player || (player.role === 'player1' && room.currentTurn !== 'team1') || (player.role === 'player2' && room.currentTurn !== 'team2')) {
      return res.status(403).json({ message: 'Không phải lượt của bạn' });
    }

    room.bans.push({ weaponId, team: room.currentTurn });
    if (room.bans.length >= room.banCount * 2) {
      room.actionType = 'pick';
    } else {
      room.currentTurn = room.currentTurn === 'team1' ? 'team2' : 'team1';
    }
    await room.save();
    res.json({ message: 'Súng bị cấm', room });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi cấm súng', error });
  }
};

exports.pickWeapon = async (req, res) => {
  const { code, weaponId } = req.body;
  try {
    const room = await Room.findOne({ code });
    if (!room) return res.status(404).json({ message: 'Phòng không tồn tại' });
    if (room.isCompleted) return res.status(400).json({ message: 'Phòng đã hoàn thành' });
    if (room.actionType !== 'pick') return res.status(400).json({ message: 'Không phải lượt pick' });
    const player = room.players.find(p => p.userId.toString() === req.user.id);
    if (!player || (player.role === 'player1' && room.currentTurn !== 'team1') || (player.role === 'player2' && room.currentTurn !== 'team2')) {
      return res.status(403).json({ message: 'Không phải lượt của bạn' });
    }

    room.picks.push({ weaponId, team: room.currentTurn });
    if (room.picks.length >= room.pickCount * 2) {
      room.isCompleted = true;
    } else {
      room.currentTurn = room.currentTurn === 'team1' ? 'team2' : 'team1';
    }
    await room.save();
    res.json({ message: 'Súng được chọn', room });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi chọn súng', error });
  }
};

exports.coinFlip = async (req, res) => {
  const { code, selectedWeapons } = req.body;
  try {
    const room = await Room.findOne({ code });
    if (!room) return res.status(404).json({ message: 'Phòng không tồn tại' });
    if (!room.players.some(p => p.userId.toString() === req.user.id && p.role === 'player1')) {
      return res.status(403).json({ message: 'Chỉ player1 có thể tung đồng xu' });
    }
    if (room.firstTurn) return res.status(400).json({ message: 'Đồng xu đã được tung' });
    if (room.players.length < 2 || !room.players.every(p => p.status === 'approved')) {
      return res.status(400).json({ message: 'Cần 2 người chơi được duyệt' });
    }

    room.firstTurn = Math.random() > 0.5 ? 'team1' : 'team2';
    room.currentTurn = room.firstTurn;
    room.actionType = 'ban';
    room.selectedWeapons = selectedWeapons || [];
    await room.save();
    res.json({ message: 'Đồng xu được tung', firstTurn: room.firstTurn });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi tung đồng xu', error });
  }
};

exports.resetRoom = async (req, res) => {
  const { code } = req.body;
  try {
    const room = await Room.findOne({ code });
    if (!room) return res.status(404).json({ message: 'Phòng không tồn tại' });
    if (!room.players.some(p => p.userId.toString() === req.user.id && p.role === 'player1')) {
      return res.status(403).json({ message: 'Chỉ player1 có thể reset' });
    }

    room.bans = [];
    room.picks = [];
    room.selectedWeapons = [];
    room.banCount = 0;
    room.pickCount = 0;
    room.firstTurn = null;
    room.currentTurn = null;
    room.actionType = null;
    room.isCompleted = false;
    await room.save();
    res.json({ message: 'Phòng được reset', room });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi reset phòng', error });
  }
};

module.exports = { authenticateToken, ...exports };