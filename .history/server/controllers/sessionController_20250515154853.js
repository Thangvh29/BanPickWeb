const Session = require('../models/Session');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Đảm bảo JWT_SECRET được đặt trong biến môi trường
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in environment variables');
}

// Biến cục bộ để quản lý timer
let currentTimer = null;

// Middleware để xác thực token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Yêu cầu token xác thực' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
    }
    req.user = user;
    next();
  });
};

// Xác minh token
const verifyToken = (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Yêu cầu token xác thực' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Token không hợp lệ' });
    }
    res.json({ role: user.role });
  });
};

// Đăng nhập
const login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'Tên người dùng không tồn tại' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Mật khẩu không đúng' });
    }

    let session = await Session.findOne({ isCompleted: false });
    if (!session) {
      console.log(`Creating new session for user: ${username}`);
      session = new Session({
        players: [{ userId: user._id, role: user.role }],
        selectedWeapons: [],
        bans: [],
        picks: [],
        banCount: 0,
        pickCount: 0,
        firstTurn: null,
        currentTurn: null,
        actionType: null,
        isCompleted: false,
        startTime: null,
        duration: null,
        readyStatus: { player1Ready: false, player2Ready: false },
      });
      await session.save();
    } else {
      if (session.players.length >= 2 && !session.players.some(p => p.userId.toString() === user._id.toString())) {
        return res.status(400).json({ message: 'Hệ thống đã đủ 2 người chơi' });
      }
      if (!session.players.some(p => p.userId.toString() === user._id.toString())) {
        console.log(`Adding user ${username} to existing session`);
        session.players.push({ userId: user._id, role: user.role });
        await session.save();
      }
    }

    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, {
      expiresIn: '24h',
    });
    const io = req.app.get('io');
    io.emit('sessionUpdate', session);
    console.log(`User ${username} logged in, session updated:`, session);
    res.json({ token, role: user.role });
  } catch (error) {
    console.error('Error during login:', error.stack);
    res.status(500).json({ message: 'Lỗi khi đăng nhập', error: error.message });
  }
};

// Đăng xuất
const logout = async (req, res) => {
  try {
    const session = await Session.findOne({});
    if (session) {
      session.players = session.players.filter(p => p.userId.toString() !== req.user.id);
      if (session.players.length === 0) {
        console.log('No players left, resetting session instead of deleting');
        session.bans = [];
        session.picks = [];
        session.selectedWeapons = [];
        session.banCount = 0;
        session.pickCount = 0;
        session.firstTurn = null;
        session.currentTurn = null;
        session.actionType = null;
        session.isCompleted = false;
        session.startTime = null;
        session.duration = null;
        session.readyStatus = { player1Ready: false, player2Ready: false };
        await session.save();
      } else {
        await session.save();
      }
      const io = req.app.get('io');
      io.emit('sessionUpdate', session);
      console.log(`User ${req.user.username} logged out, session updated:`, session);
    }
    res.json({ message: 'Logged out' });
  } catch (error) {
    console.error('Error logging out:', error.stack);
    res.status(500).json({ message: 'Lỗi khi đăng xuất', error: error.message });
  }
};

// Lấy thông tin phiên
const getSession = async (req, res) => {
  try {
    let session = await Session.findOne({});
    if (!session) {
      console.log('No active session, creating new one');
      session = new Session({
        players: [{ userId: req.user.id, role: req.user.role }],
        selectedWeapons: [],
        bans: [],
        picks: [],
        banCount: 0,
        pickCount: 0,
        firstTurn: null,
        currentTurn: null,
        actionType: null,
        isCompleted: false,
        startTime: null,
        duration: null,
        readyStatus: { player1Ready: false, player2Ready: false },
      });
      await session.save();
      const io = req.app.get('io');
      io.emit('sessionUpdate', session);
    }
    if (!session.players.some(p => p.userId.toString() === req.user.id)) {
      console.log(`Adding user ${req.user.username} to session`);
      session.players.push({ userId: req.user.id, role: req.user.role });
      await session.save();
      const io = req.app.get('io');
      io.emit('sessionUpdate', session);
    }
    console.log(`Session fetched for user ${req.user.username}:`, session);
    res.json(session);
  } catch (error) {
    console.error('Error fetching session:', error.stack);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin phiên', error: error.message });
  }
};

// Cập nhật phiên
const update = async (req, res) => {
  if (req.user.role !== 'player1') {
    return res.status(403).json({ message: 'Chỉ Player 1 được cập nhật phiên' });
  }
  const { banCount, pickCount } = req.body;
  try {
    const session = await Session.findOneAndUpdate(
      {},
      { banCount: parseInt(banCount) || 0, pickCount: parseInt(pickCount) || 0 },
      { new: true }
    );
    if (!session) {
      return res.status(404).json({ message: 'Không tìm thấy phiên hoạt động' });
    }
    const io = req.app.get('io');
    io.emit('sessionUpdate', session);
    console.log('Session updated:', session);
    res.json({ message: 'Cập nhật phiên thành công', session });
  } catch (error) {
    console.error('Error updating session:', error.stack);
    res.status(500).json({ message: 'Lỗi khi cập nhật phiên', error: error.message });
  }
};

// Chọn vũ khí
const selectWeapon = async (req, res) => {
  if (req.user.role !== 'player1') {
    return res.status(403).json({ message: 'Chỉ Player 1 được chọn vũ khí' });
  }
  const { weaponId } = req.body;
  try {
    const session = await Session.findOne({});
    if (!session) {
      return res.status(404).json({ message: 'Không tìm thấy phiên hoạt động' });
    }
    if (session.selectedWeapons.includes(weaponId)) {
      return res.status(400).json({ message: 'Vũ khí đã được chọn' });
    }
    session.selectedWeapons.push(weaponId);
    await session.save();
    const io = req.app.get('io');
    io.emit('sessionUpdate', session);
    console.log('Weapon selected:', session.selectedWeapons);
    res.json({ message: 'Chọn vũ khí thành công', selectedWeapons: session.selectedWeapons });
  } catch (error) {
    console.error('Error selecting weapon:', error.stack);
    res.status(500).json({ message: 'Lỗi khi chọn vũ khí', error: error.message });
  }
};

// Đặt trạng thái sẵn sàng
const setReady = async (req, res) => {
  try {
    const session = await Session.findOne({});
    if (!session) {
      return res.status(404).json({ message: 'Không tìm thấy phiên hoạt động' });
    }
    if (!session.players.some(p => p.userId.toString() === req.user.id)) {
      return res.status(403).json({ message: 'Bạn không có trong phiên này' });
    }

    let updated = false;
    if (req.user.role === 'player1') {
      if (session.readyStatus.player1Ready) {
        return res.status(400).json({ message: 'Bạn đã xác nhận sẵn sàng' });
      }
      session.readyStatus.player1Ready = true;
      updated = true;
    } else if (req.user.role === 'player2') {
      if (session.readyStatus.player2Ready) {
        return res.status(400).json({ message: 'Bạn đã xác nhận sẵn sàng' });
      }
      session.readyStatus.player2Ready = true;
      updated = true;
    } else {
      return res.status(403).json({ message: 'Vai trò không hợp lệ' });
    }

    if (updated) {
      await session.save();
      const io = req.app.get('io');
      io.emit('sessionUpdate', session);
      console.log(`Player ${req.user.role} set ready status:`, session.readyStatus);
      res.json({ message: 'Cập nhật trạng thái sẵn sàng', readyStatus: session.readyStatus });
    }
  } catch (error) {
    console.error('Error setting ready status:', error.stack);
    res.status(500).json({ message: 'Lỗi khi đặt trạng thái sẵn sàng', error: error.message });
  }
};

// Khởi động bộ đếm thời gian
const startTimer = async (session, io, action, team) => {
  if (!session || session.isCompleted || !session.currentTurn) {
    console.log('Timer not started: session completed or no current turn');
    return;
  }

  console.log(`Starting timer for ${action} turn of ${team}`);

  // Dừng bộ đếm thời gian cũ nếu có
  if (currentTimer) {
    clearInterval(currentTimer);
    currentTimer = null;
  }

  // Lưu thời gian bắt đầu và thời lượng
  const duration = 30;
  session.startTime = new Date();
  session.duration = duration;
  await session.save();

  currentTimer = setInterval(async () => {
    const elapsed = Math.floor((new Date() - new Date(session.startTime)) / 1000);
    const timeLeft = duration - elapsed;
    console.log(`Timer update: ${timeLeft}s for ${action} by ${team}`);
    io.emit('timerUpdate', { timeLeft, action, team });

    if (timeLeft <= 0) {
      clearInterval(currentTimer);
      currentTimer = null;

      const availableWeapons = session.selectedWeapons.filter(
        weaponId => !session.bans.some(b => b.weaponId === weaponId) && !session.picks.some(p => p.weaponId === weaponId)
      );

      if (availableWeapons.length > 0) {
        const randomWeapon = availableWeapons[Math.floor(Math.random() * availableWeapons.length)];
        
        if (action === 'ban') {
          session.bans.push({ weaponId: randomWeapon, team });
          if (session.bans.length < session.banCount * 2) {
            session.currentTurn = team === 'team1' ? 'team2' : 'team1';
            session.actionType = 'ban';
          } else {
            session.actionType = 'pick';
            session.currentTurn = session.firstTurn;
          }
        } else if (action === 'pick') {
          session.picks.push({ weaponId: randomWeapon, team });
          if (session.picks.length >= session.pickCount * 2) {
            session.isCompleted = true;
            session.currentTurn = null;
          } else {
            session.currentTurn = team === 'team1' ? 'team2' : 'team1';
          }
        }

        console.log(`Auto-selected ${action} for ${team}: ${randomWeapon}`);
        io.emit('autoSelect', {
          weaponId: randomWeapon,
          action,
          team,
          session,
        });

        await session.save();
        io.emit('sessionUpdate', session);

        if (!session.isCompleted && session.currentTurn) {
          console.log(`Starting next timer for ${session.actionType} by ${session.currentTurn}`);
          startTimer(session, io, session.actionType, session.currentTurn);
        } else {
          console.log('Session completed or no next turn');
        }
      } else {
        console.log('No available weapons for auto-select');
      }
    }
  }, 1000);
};

// Khóa hành động (ban hoặc pick)
const lockIn = async (req, res) => {
  const { weaponId, action } = req.body;
  try {
    const session = await Session.findOne({});
    if (!session) {
      return res.status(404).json({ message: 'Không tìm thấy phiên hoạt động' });
    }
    if (session.isCompleted) {
      return res.status(400).json({ message: 'Phiên đã hoàn thành' });
    }
    if (session.actionType !== action) {
      return res.status(400).json({ message: `Không phải lượt ${action}` });
    }
    if (req.user.role === 'player1' && session.currentTurn !== 'team1') {
      return res.status(403).json({ message: 'Không phải lượt của bạn' });
    }
    if (req.user.role === 'player2' && session.currentTurn !== 'team2') {
      return res.status(403).json({ message: 'Không phải lượt của bạn' });
    }
    if (session.bans.some(ban => ban.weaponId === weaponId) || session.picks.some(pick => pick.weaponId === weaponId)) {
      return res.status(400).json({ message: 'Vũ khí đã được cấm hoặc chọn' });
    }

    const io = req.app.get('io');

    if (currentTimer) {
      clearInterval(currentTimer);
      currentTimer = null;
    }

    if (action === 'ban') {
      session.bans.push({ weaponId, team: session.currentTurn });
      if (session.bans.length < session.banCount * 2) {
        session.currentTurn = session.currentTurn === 'team1' ? 'team2' : 'team1';
        session.actionType = 'ban';
      } else {
        session.actionType = 'pick';
        session.currentTurn = session.firstTurn;
      }
    } else if (action === 'pick') {
      session.picks.push({ weaponId, team: session.currentTurn });
      if (session.picks.length >= session.pickCount * 2) {
        session.isCompleted = true;
        session.currentTurn = null;
      } else {
        session.currentTurn = session.currentTurn === 'team1' ? 'team2' : 'team1';
      }
    }

    await session.save();
    io.emit('sessionUpdate', session);

    if (!session.isCompleted && session.currentTurn) {
      console.log(`Starting timer after lockIn for ${session.actionType} by ${session.currentTurn}`);
      startTimer(session, io, session.actionType, session.currentTurn);
    } else {
      console.log('Session completed or no next turn after lockIn');
    }

    res.json({ message: `${action} đã khóa`, session });
  } catch (error) {
    console.error(`Error locking in ${action}:`, error.stack);
    res.status(500).json({ message: 'Lỗi khi khóa hành động', error: error.message });
  }
};

// Cấm vũ khí
const banWeapon = async (req, res) => {
  const { weaponId } = req.body;
  try {
    const session = await Session.findOne({});
    if (!session) {
      return res.status(404).json({ message: 'Không tìm thấy phiên hoạt động' });
    }
    if (session.isCompleted) {
      return res.status(400).json({ message: 'Phiên đã hoàn thành' });
    }
    if (session.actionType !== 'ban') {
      return res.status(400).json({ message: 'Không phải lượt cấm' });
    }
    if (req.user.role === 'player1' && session.currentTurn !== 'team1') {
      return res.status(403).json({ message: 'Không phải lượt của bạn' });
    }
    if (req.user.role === 'player2' && session.currentTurn !== 'team2') {
      return res.status(403).json({ message: 'Không phải lượt của bạn' });
    }
    if (session.bans.some(b => b.weaponId === weaponId) || session.picks.some(p => p.weaponId === weaponId)) {
      return res.status(400).json({ message: 'Vũ khí đã được cấm hoặc chọn' });
    }

    const io = req.app.get('io');

    if (currentTimer) {
      clearInterval(currentTimer);
      currentTimer = null;
    }

    session.bans.push({ weaponId, team: session.currentTurn });
    if (session.bans.length < session.banCount * 2) {
      session.currentTurn = session.currentTurn === 'team1' ? 'team2' : 'team1';
      session.actionType = 'ban';
    } else {
      session.actionType = 'pick';
      session.currentTurn = session.firstTurn;
    }

    await session.save();
    io.emit('sessionUpdate', session);

    if (!session.isCompleted && session.currentTurn) {
      console.log(`Starting timer after banWeapon for ${session.actionType} by ${session.currentTurn}`);
      startTimer(session, io, session.actionType, session.currentTurn);
    } else {
      console.log('Session completed or no next turn after banWeapon');
    }

    res.json({ message: 'Cấm vũ khí thành công', session });
  } catch (error) {
    console.error('Error banning weapon:', error.stack);
    res.status(500).json({ message: 'Lỗi khi cấm vũ khí', error: error.message });
  }
};

// Chọn vũ khí
const pickWeapon = async (req, res) => {
  const { weaponId } = req.body;
  try {
    const session = await Session.findOne({});
    if (!session) {
      return res.status(404).json({ message: 'Không tìm thấy phiên hoạt động' });
    }
    if (session.isCompleted) {
      return res.status(400).json({ message: 'Phiên đã hoàn thành' });
    }
    if (session.actionType !== 'pick') {
      return res.status(400).json({ message: 'Không phải lượt chọn' });
    }
    if (req.user.role === 'player1' && session.currentTurn !== 'team1') {
      return res.status(403).json({ message: 'Không phải lượt của bạn' });
    }
    if (req.user.role === 'player2' && session.currentTurn !== 'team2') {
      return res.status(403).json({ message: 'Không phải lượt của bạn' });
    }
    if (session.bans.some(b => b.weaponId === weaponId) || session.picks.some(p => p.weaponId === weaponId)) {
      return res.status(400).json({ message: 'Vũ khí đã được cấm hoặc chọn' });
    }

    const io = req.app.get('io');

    if (currentTimer) {
      clearInterval(currentTimer);
      currentTimer = null;
    }

    session.picks.push({ weaponId, team: session.currentTurn });
    if (session.picks.length >= session.pickCount * 2) {
      session.isCompleted = true;
      session.currentTurn = null;
    } else {
      session.currentTurn = session.currentTurn === 'team1' ? 'team2' : 'team1';
    }

    await session.save();
    io.emit('sessionUpdate', session);

    if (!session.isCompleted && session.currentTurn) {
      console.log(`Starting timer after pickWeapon for ${session.actionType} by ${session.currentTurn}`);
      startTimer(session, io, session.actionType, session.currentTurn);
    } else {
      console.log('Session completed or no next turn after pickWeapon');
    }

    res.json({ message: 'Chọn vũ khí thành công', session });
  } catch (error) {
    console.error('Error picking weapon:', error.stack);
    res.status(500).json({ message: 'Lỗi khi chọn vũ khí', error: error.message });
  }
};

// Tung đồng xu
const coinFlip = async (req, res) => {
  if (req.user.role !== 'player1') {
    return res.status(403).json({ message: 'Chỉ Player 1 được tung đồng xu' });
  }
  const { selectedWeapons } = req.body;
  try {
    const session = await Session.findOne({});
    if (!session) {
      return res.status(404).json({ message: 'Không tìm thấy phiên hoạt động' });
    }
    if (session.firstTurn) {
      return res.status(400).json({ message: 'Đồng xu đã được tung' });
    }
    if (!session.readyStatus.player1Ready || !session.readyStatus.player2Ready) {
      return res.status(400).json({ message: 'Cả hai người chơi phải sẵn sàng' });
    }

    const requiredWeapons = session.banCount * 2 + session.pickCount * 2;
    if (!selectedWeapons || selectedWeapons.length < requiredWeapons) {
      return res.status(400).json({ message: `Yêu cầu chọn ít nhất ${requiredWeapons} vũ khí` });
    }

    session.firstTurn = Math.random() > 0.5 ? 'team1' : 'team2';
    session.currentTurn = session.firstTurn;
    session.actionType = 'ban';
    session.selectedWeapons = selectedWeapons;
    session.readyStatus.player1Ready = false;
    session.readyStatus.player2Ready = false;
    await session.save();

    const io = req.app.get('io');
    console.log('Emitting coinFlip event:', { firstTurn: session.firstTurn, coinFace: session.firstTurn === 'team1' ? 'heads' : 'tails' });
    io.emit('coinFlip', {
      firstTurn: session.firstTurn,
      coinFace: session.firstTurn === 'team1' ? 'heads' : 'tails',
    });

    if (!session.isCompleted && session.currentTurn) {
      console.log(`Starting timer for first ban by ${session.currentTurn}`);
      startTimer(session, io, 'ban', session.currentTurn);
    }

    res.json({ message: 'Tung đồng xu thành công', firstTurn: session.firstTurn });
  } catch (error) {
    console.error('Error in coinFlip:', error.stack);
    res.status(500).json({ message: 'Lỗi khi tung đồng xu', error: error.message });
  }
};

// Đặt lại phiên
const resetSession = async (req, res) => {
  if (req.user.role !== 'player1') {
    return res.status(403).json({ message: 'Chỉ Player 1 được đặt lại phiên' });
  }

  try {
    // Dừng bộ đếm thời gian nếu đang chạy
    if (currentTimer) {
      clearInterval(currentTimer);
      currentTimer = null;
      console.log('Cleared timer');
    }

    let session = await Session.findOne({});
    if (!session) {
      console.log('No active session, creating new one for reset');
      session = new Session({
        players: [{ userId: req.user.id, role: req.user.role }],
        selectedWeapons: [],
        bans: [],
        picks: [],
        banCount: 0,
        pickCount: 0,
        firstTurn: null,
        currentTurn: null,
        actionType: null,
        isCompleted: false,
        startTime: null,
        duration: null,
        readyStatus: { player1Ready: false, player2Ready: false },
      });
    } else {
      session.bans = [];
      session.picks = [];
      session.selectedWeapons = [];
      session.banCount = 0;
      session.pickCount = 0;
      session.firstTurn = null;
      session.currentTurn = null;
      session.actionType = null;
      session.isCompleted = false;
      session.startTime = null;
      session.duration = null;
      session.readyStatus = { player1Ready: false, player2Ready: false };
    }

    await session.save();
    const io = req.app.get('io');
    io.emit('sessionUpdate', session);
    io.emit('timerUpdate', { timeLeft: null, action: null, team: null });
    console.log('Session reset, timer stopped');
    res.json({ message: 'Đặt lại phiên thành công', session });
  } catch (error) {
    console.error('Error resetting session:', error.stack);
    res.status(500).json({ message: 'Lỗi khi đặt lại phiên', error: error.message });
  }
};

// Xuất các hàm
module.exports = {
  authenticateToken,
  verifyToken,
  login,
  logout,
  getSession,
  update,
  selectWeapon,
  setReady,
  lockIn,
  banWeapon,
  pickWeapon,
  coinFlip,
  resetSession,
};