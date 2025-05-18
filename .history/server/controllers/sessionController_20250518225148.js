
const Session = require('../models/');
const User = require('../models/User');
const bcrypt = require(' bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET not defined');
  process.exit(1);
}

const sessionCache = new Map();
let currentTimer = null;

const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token required' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
};

const verifyToken = (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token required' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    res.json({ role: user.role });
  });
};

const login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: 'Tên người dùng không tồn tại' });
    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: 'Mật khẩu không đúng' });
    }
    let session = await Session.findOne({});
    let sessionChanged = false;
    if (!session) {
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
        readyStatus: { player1Ready: false, player2Ready: false },
        phase: 0,
        actionsCompleted: 0,
      });
      sessionChanged = true;
    } else if (
      session.players.length < 2 &&
      !session.players.some((p) => p.userId.toString() === user._id.toString())
    ) {
      session.players.push({ userId: user._id, role: user.role });
      sessionChanged = true;
    } else if (session.players.length >= 2) {
      return res.status(400).json({ message: 'Hệ thống đã đủ 2 người chơi' });
    }
    if (sessionChanged) {
      await session.save();
      sessionCache.set('activeSession', session);
      req.app.get('io').emit('sessionUpdate', session);
    }
    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, role: user.role });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Lỗi khi đăng nhập' });
  }
};

const logout = async (req, res) => {
  try {
    let session = await Session.findOne({});
    if (session) {
      session.players = session.players.filter((p) => p.userId.toString() !== req.user.id);
      if (session.players.length === 0) {
        session = new Session({
          players: [],
          selectedWeapons: [],
          bans: [],
          picks: [],
          banCount: 0,
          pickCount: 0,
          firstTurn: null,
          currentTurn: null,
          actionType: null,
          isCompleted: false,
          readyStatus: { player1Ready: false, player2Ready: false },
          phase: 0,
          actionsCompleted: 0,
        });
      }
      await session.save();
      sessionCache.set('activeSession', session);
      req.app.get('io').emit('sessionUpdate', session);
    }
    res.json({ message: 'Logged out' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Lỗi khi đăng xuất' });
  }
};

const getSession = async (req, res) => {
  try {
    if (sessionCache.has('activeSession')) {
      return res.json(sessionCache.get('activeSession'));
    }
    let session = await Session.findOne({});
    if (!session) {
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
        readyStatus: { player1Ready: false, player2Ready: false },
        phase: 0,
        actionsCompleted: 0,
      });
    } else if (!session.players.some((p) => p.userId.toString() === req.user.id)) {
      session.players.push({ userId: req.user.id, role: req.user.role });
    }
    await session.save();
    sessionCache.set('activeSession', session);
    req.app.get('io').emit('sessionUpdate', session);
    res.json(session);
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu phiên' });
  }
};

const update = async (req, res) => {
  if (req.user.role !== 'player1') return res.status(403).json({ message: 'Chỉ Player 1 có thể cập nhật' });
  const { banCount, pickCount } = req.body;
  try {
    const session = await Session.findOneAndUpdate(
      {},
      {
        banCount: parseInt(banCount) || 0,
        pickCount: parseInt(pickCount) || 0,
        phase: 0,
        actionsCompleted: 0,
      },
      { new: true }
    );
    if (!session) return res.status(404).json({ message: 'Không có phiên hoạt động' });
    sessionCache.set('activeSession', session);
    req.app.get('io').emit('sessionUpdate', session);
    res.json({ message: 'Phiên đã cập nhật', session });
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật phiên' });
  }
};

const selectWeapon = async (req, res) => {
  if (req.user.role !== 'player1') return res.status(403).json({ message: 'Chỉ Player 1 có thể chọn súng' });
  const { weaponId } = req.body;
  try {
    const session = await Session.findOne({});
    if (!session) return res.status(404).json({ message: 'Không có phiên hoạt động' });
    if (session.selectedWeapons.includes(weaponId)) {
      return res.status(400).json({ message: 'Súng đã được chọn' });
    }
    session.selectedWeapons.push(weaponId);
    await session.save();
    sessionCache.set('activeSession', session);
    req.app.get('io').emit('sessionUpdate', session);
    res.json({ message: 'Súng đã chọn', selectedWeapons: session.selectedWeapons });
  } catch (error) {
    console.error('Select weapon error:', error);
    res.status(500).json({ message: 'Lỗi khi chọn súng' });
  }
};

const setReady = async (req, res) => {
  try {
    const session = await Session.findOne({});
    if (!session) return res.status(404).json({ message: 'Không có phiên hoạt động' });
    if (!session.players.some((p) => p.userId.toString() === req.user.id)) {
      return res.status(403).json({ message: 'Bạn không tham gia phiên này' });
    }
    let updated = false;
    if (req.user.role === 'player1' && !session.readyStatus.player1Ready) {
      session.readyStatus.player1Ready = true;
      updated = true;
    } else if (req.user.role === 'player2' && !session.readyStatus.player2Ready) {
      session.readyStatus.player2Ready = true;
      updated = true;
    } else {
      return res.status(400).json({ message: 'Bạn đã xác nhận sẵn sàng' });
    }
    if (updated) {
      await session.save();
      sessionCache.set('activeSession', session);
      req.app.get('io').emit('sessionUpdate', session);
      res.json({ message: 'Trạng thái sẵn sàng cập nhật', readyStatus: session.readyStatus });
    }
  } catch (error) {
    console.error('Set ready error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật trạng thái sẵn sàng' });
  }
};

const startTimer = async (session, io, action, team) => {
  if (!session || session.isCompleted || !session.currentTurn || !action) {
    console.log('Timer not started: invalid state');
    if (currentTimer) {
      clearInterval(currentTimer);
      currentTimer = null;
      io.to('activeSession').emit('timerUpdate', { timeLeft: null, action: null, team: null });
    }
    return;
  }
  if (!session.players.some((p) => p.role === (team === 'team1' ? 'player1' : 'player2'))) {
    console.log('No player for team, stopping timer');
    if (currentTimer) {
      clearInterval(currentTimer);
      currentTimer = null;
      io.to('activeSession').emit('timerUpdate', { timeLeft: null, action: null, team: null });
    }
    return;
  }
  if (currentTimer) {
    clearInterval(currentTimer);
    currentTimer = null;
  }
  const duration = 30;
  session.startTime = new Date();
  session.duration = duration;
  try {
    await session.save();
  } catch (error) {
    console.error('Error saving session in startTimer:', error);
    return;
  }
  sessionCache.set('activeSession', session);
  const startTimestamp = session.startTime.getTime();
  io.to('activeSession').emit('timerUpdate', { timeLeft: duration, action, team });
  currentTimer = setInterval(async () => {
    const elapsed = Math.floor((new Date().getTime() - startTimestamp) / 1000);
    const timeLeft = duration - elapsed;
    if (timeLeft <= 0) {
      clearInterval(currentTimer);
      currentTimer = null;
      const availableWeapons = session.selectedWeapons.filter(
        (weaponId) =>
          !session.bans.some((b) => b.weaponId === weaponId) &&
          !session.picks.some((p) => p.weaponId === weaponId)
      );
      if (availableWeapons.length > 0) {
        const randomWeapon = availableWeapons[Math.floor(Math.random() * availableWeapons.length)];
        if (action === 'ban') {
          session.bans.push({ weaponId: randomWeapon, team });
        } else if (action === 'pick') {
          session.picks.push({ weaponId: randomWeapon, team });
        }
        session.actionsCompleted += 1;
        const totalActions = (session.banCount * 2) + (session.pickCount * 2);
        if (session.actionsCompleted >= totalActions) {
          session.isCompleted = true;
          session.currentTurn = null;
          session.actionType = null;
          session.phase = 0;
          session.actionsCompleted = 0;
        } else {
          session.currentTurn = session.currentTurn === 'team1' ? 'team2' : 'team1';
          session.actionType = session.bans.length < session.banCount * 2 ? 'ban' : session.picks.length < session.pickCount * 2 ? 'pick' : null;
          if (!session.actionType) session.isCompleted = true;
        }
        try {
          await session.save();
        } catch (error) {
          console.error('Error saving session after auto-select:', error);
          return;
        }
        sessionCache.set('activeSession', session);
        io.to('activeSession').emit('autoSelect', { weaponId: randomWeapon, action, team, session });
        io.to('activeSession').emit('sessionUpdate', session);
        if (!session.isCompleted && session.currentTurn && session.actionType) {
          startTimer(session, io, session.actionType, session.currentTurn);
        } else {
          io.to('activeSession').emit('timerUpdate', { timeLeft: null, action: null, team: null });
        }
      } else {
        session.isCompleted = true;
        session.currentTurn = null;
        session.actionType = null;
        session.phase = 0;
        session.actionsCompleted = 0;
        try {
          await session.save();
        } catch (error) {
          console.error('Error saving session:', error);
          return;
        }
        sessionCache.set('activeSession', session);
        io.to('activeSession').emit('sessionUpdate', session);
        io.to('activeSession').emit('timerUpdate', { timeLeft: null, action: null, team: null });
      }
    } else {
      io.to('activeSession').emit('timerUpdate', { timeLeft, action, team });
    }
  }, 1000);
};

const resetSession = async (req, res) => {
  if (req.user.role !== 'player1') return res.status(403).json({ message: 'Chỉ Player 1 có thể reset' });
  try {
    if (currentTimer) {
      clearInterval(currentTimer);
      currentTimer = null;
    }
    let session = await Session.findOne({});
    if (!session) {
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
        readyStatus: { player1Ready: false, player2Ready: false },
        phase: 0,
        actionsCompleted: 0,
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
      session.readyStatus = { player1Ready: false, player2Ready: false };
      session.phase = 0;
      session.actionsCompleted = 0;
    }
    await session.save();
    sessionCache.set('activeSession', session);
    const io = req.app.get('io');
    io.emit('sessionUpdate', session);
    io.emit('timerUpdate', { timeLeft: null, action: null, team: null });
    res.json({ message: 'Phiên đã reset', session });
  } catch (error) {
    console.error('Reset session error:', error);
    res.status(500).json({ message: 'Lỗi khi reset phiên' });
  }
};

const lockIn = async (req, res) => {
  const { weaponId, action } = req.body;
  try {
    const session = await Session.findOne({});
    if (!session) return res.status(404).json({ message: 'Không có phiên hoạt động' });
    if (session.isCompleted) return res.status(400).json({ message: 'Phiên đã hoàn tất' });
    if (session.actionType !== action) return res.status(400).json({ message: `Không phải lượt ${action}` });
    if (req.user.role === 'player1' && session.currentTurn !== 'team1') {
      return res.status(403).json({ message: 'Không phải lượt của bạn' });
    }
    if (req.user.role === 'player2' && session.currentTurn !== 'team2') {
      return res.status(403).json({ message: 'Không phải lượt của bạn' });
    }
    if (session.bans.some((ban) => ban.weaponId === weaponId) || session.picks.some((pick) => pick.weaponId === weaponId)) {
      return res.status(400).json({ message: 'Súng đã được ban hoặc pick' });
    }
    const io = req.app.get('io');
    if (currentTimer) {
      clearInterval(currentTimer);
      currentTimer = null;
      io.emit('timerUpdate', { timeLeft: null, action: null, team: null });
    }
    if (action === 'ban') {
      session.bans.push({ weaponId, team: session.currentTurn });
    } else if (action === 'pick') {
      session.picks.push({ weaponId, team: session.currentTurn });
    }
    session.actionsCompleted += 1;
    const totalActions = (session.banCount * 2) + (session.pickCount * 2);
    if (session.actionsCompleted >= totalActions) {
      session.isCompleted = true;
      session.currentTurn = null;
      session.actionType = null;
      session.phase = 0;
      session.actionsCompleted = 0;
    } else {
      session.currentTurn = session.currentTurn === 'team1' ? 'team2' : 'team1';
      session.actionType = session.bans.length < session.banCount * 2 ? 'ban' : session.picks.length < session.pickCount * 2 ? 'pick' : null;
      if (!session.actionType) session.isCompleted = true;
    }
    await session.save();
    sessionCache.set('activeSession', session);
    io.emit('sessionUpdate', session);
    if (!session.isCompleted && session.currentTurn && session.actionType) {
      startTimer(session, io, session.actionType, session.currentTurn);
    } else {
      io.emit('timerUpdate', { timeLeft: null, action: null, team: null });
    }
    res.json({ message: `${action} locked`, session });
  } catch (error) {
    console.error(`Lock in ${action} error:`, error);
    res.status(500).json({ message: 'Lỗi khi khóa lựa chọn' });
  }
};

const banWeapon = async (req, res) => {
  const { weaponId } = req.body;
  try {
    const session = await Session.findOne({});
    if (!session) return res.status(404).json({ message: 'Không có phiên hoạt động' });
    if (session.isCompleted) return res.status(400).json({ message: 'Phiên đã hoàn tất' });
    if (session.actionType !== 'ban') return res.status(400).json({ message: 'Không phải lượt ban' });
    if (req.user.role === 'player1' && session.currentTurn !== 'team1') {
      return res.status(403).json({ message: 'Không phải lượt của bạn' });
    }
    if (req.user.role === 'player2' && session.currentTurn !== 'team2') {
      return res.status(403).json({ message: 'Không phải lượt của bạn' });
    }
    if (session.bans.some((b) => b.weaponId === weaponId) || session.picks.some((p) => p.weaponId === weaponId)) {
      return res.status(400).json({ message: 'Súng đã được ban hoặc pick' });
    }
    const io = req.app.get('io');
    if (currentTimer) {
      clearInterval(currentTimer);
      currentTimer = null;
      io.emit('timerUpdate', { timeLeft: null, action: null, team: null });
    }
    session.bans.push({ weaponId, team: session.currentTurn });
    session.actionsCompleted += 1;
    const totalActions = (session.banCount * 2) + (session.pickCount * 2);
    if (session.actionsCompleted >= totalActions) {
      session.isCompleted = true;
      session.currentTurn = null;
      session.actionType = null;
      session.phase = 0;
      session.actionsCompleted = 0;
    } else {
      session.currentTurn = session.currentTurn === 'team1' ? 'team2' : 'team1';
      session.actionType = session.bans.length < session.banCount * 2 ? 'ban' : session.picks.length < session.pickCount * 2 ? 'pick' : null;
      if (!session.actionType) session.isCompleted = true;
    }
    await session.save();
    sessionCache.set('activeSession', session);
    io.emit('sessionUpdate', session);
    if (!session.isCompleted && session.currentTurn && session.actionType) {
      startTimer(session, io, session.actionType, session.currentTurn);
    } else {
      io.emit('timerUpdate', { timeLeft: null, action: null, team: null });
    }
    res.json({ message: 'Súng đã bị ban', session });
  } catch (error) {
    console.error('Ban weapon error:', error);
    res.status(500).json({ message: 'Lỗi khi ban súng' });
  }
};

const pickWeapon = async (req, res) => {
  const { weaponId } = req.body;
  try {
    const session = await Session.findOne({});
    if (!session) return res.status(404).json({ message: 'Không có phiên hoạt động' });
    if (session.isCompleted) return res.status(400).json({ message: 'Phiên đã hoàn tất' });
    if (session.actionType !== 'pick') return res.status(400).json({ message: 'Không phải lượt pick' });
    if (req.user.role === 'player1' && session.currentTurn !== 'team1') {
      return res.status(403).json({ message: 'Không phải lượt của bạn' });
    }
    if (req.user.role === 'player2' && session.currentTurn !== 'team2') {
      return res.status(403).json({ message: 'Không phải lượt của bạn' });
    }
    if (session.bans.some((b) => b.weaponId === weaponId) || session.picks.some((p) => p.weaponId === weaponId)) {
      return res.status(400).json({ message: 'Súng đã được ban hoặc pick' });
    }
    const io = req.app.get('io');
    if (currentTimer) {
      clearInterval(currentTimer);
      currentTimer = null;
      io.emit('timerUpdate', { timeLeft: null, action: null, team: null });
    }
    session.picks.push({ weaponId, team: session.currentTurn });
    session.actionsCompleted += 1;
    const totalActions = (session.banCount * 2) + (session.pickCount * 2);
    if (session.actionsCompleted >= totalActions) {
      session.isCompleted = true;
      session.currentTurn = null;
      session.actionType = null;
      session.phase = 0;
      session.actionsCompleted = 0;
    } else {
      session.currentTurn = session.currentTurn === 'team1' ? 'team2' : 'team1';
      session.actionType = session.bans.length < session.banCount * 2 ? 'ban' : session.picks.length < session.pickCount * 2 ? 'pick' : null;
      if (!session.actionType) session.isCompleted = true;
    }
    await session.save();
    sessionCache.set('activeSession', session);
    io.emit('sessionUpdate', session);
    if (!session.isCompleted && session.currentTurn && session.actionType) {
      startTimer(session, io, session.actionType, session.currentTurn);
    } else {
      io.emit('timerUpdate', { timeLeft: null, action: null, team: null });
    }
    res.json({ message: 'Súng đã được pick', session });
  } catch (error) {
    console.error('Pick weapon error:', error);
    res.status(500).json({ message: 'Lỗi khi pick súng' });
  }
};

const coinFlip = async (req, res) => {
  if (req.user.role !== 'player1') return res.status(403).json({ message: 'Chỉ Player 1 có thể tung đồng xu' });
  const { selectedWeapons } = req.body;
  try {
    const session = await Session.findOne({});
    if (!session) return res.status(404).json({ message: 'Không có phiên hoạt động' });
    if (session.firstTurn) return res.status(400).json({ message: 'Đồng xu đã được tung' });
    if (!session.readyStatus.player1Ready || !session.readyStatus.player2Ready) {
      return res.status(400).json({ message: 'Cả hai người chơi phải sẵn sàng' });
    }
    const requiredWeapons = (session.banCount * 2) + (session.pickCount * 2);
    if (selectedWeapons.length < requiredWeapons) {
      return res.status(400).json({ message: `Cần ít nhất ${requiredWeapons} súng` });
    }
    session.firstTurn = Math.random() > 0.5 ? 'team1' : 'team2';
    session.currentTurn = session.firstTurn;
    session.actionType = session.banCount > 0 ? 'ban' : session.pickCount > 0 ? 'pick' : null;
    session.selectedWeapons = selectedWeapons;
    session.readyStatus.player1Ready = false;
    session.readyStatus.player2Ready = false;
    session.phase = 1;
    session.actionsCompleted = 0;
    if (!session.actionType) session.isCompleted = true;
    await session.save();
    sessionCache.set('activeSession', session);
    const io = req.app.get('io');
    io.to('activeSession').emit('sessionUpdate', session);
    io.to('activeSession').emit('coinFlip', {
      firstTurn: session.firstTurn,
      coinFace: session.firstTurn === 'team1' ? 'heads' : 'tails',
    });
    if (!session.isCompleted && session.currentTurn && session.actionType) {
      startTimer(session, io, session.actionType, session.currentTurn);
    } else {
      io.to('activeSession').emit('timerUpdate', { timeLeft: null, action: null, team: null });
    }
    res.json({ message: 'Đồng xu đã tung', firstTurn: session.firstTurn });
  } catch (error) {
    console.error('Coin flip error:', error);
    res.status(500).json({ message: 'Lỗi khi tung đồng xu' });
  }
};

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
