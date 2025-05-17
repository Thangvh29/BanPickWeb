const Session = require("../models/Session");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("JWT_SECRET is not defined");
  process.exit(1);
}

const sessionCache = new Map();

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Token required" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
};

const verifyToken = (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Token required" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    res.json({ role: user.role });
  });
};

const login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: "Tên người dùng không tồn tại" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Mật khẩu không đúng" });

    let session = await Session.findOne({});
    let sessionChanged = false;
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
        timerId: null,
        readyStatus: { player1Ready: false, player2Ready: false },
        phase: 0,
        actionsCompleted: 0,
      });
      sessionChanged = true;
    } else {
      if (session.players.length >= 2 && !session.players.some(p => p.userId.toString() === user._id.toString())) {
        return res.status(400).json({ message: "Hệ thống đã đủ 2 người chơi" });
      }
      if (!session.players.some(p => p.userId.toString() === user._id.toString())) {
        console.log(`Adding user ${username} to existing session`);
        session.players.push({ userId: user._id, role: user.role });
        sessionChanged = true;
      }
    }

    if (sessionChanged) {
      await session.save();
      sessionCache.set("activeSession", session);
      const io = req.app.get("io");
      io.to('activeSession').emit("sessionUpdate", session);
      console.log(`User ${username} logged in, session updated:`, session);
    }

    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "24h" });
    res.json({ token, role: user.role });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ message: "Lỗi khi đăng nhập", error });
  }
};

let currentTimer = null;

const startTimer = async (session, io, action, team) => {
  if (!session || session.isCompleted || !session.currentTurn || !action) {
    console.log("Timer not started: invalid state");
    if (currentTimer) {
      clearInterval(currentTimer);
      currentTimer = null;
      io.to('activeSession').emit("timerUpdate", { timeLeft: null, action: null, team: null });
    }
    return;
  }

  if (!session.players.some(p => p.role === (team === 'team1' ? 'player1' : 'player2'))) {
    console.log('No player for this team, stopping timer');
    if (currentTimer) {
      clearInterval(currentTimer);
      currentTimer = null;
      io.to('activeSession').emit('timerUpdate', { timeLeft: null, action: null, team: null });
    }
    return;
  }

  console.log(`Starting timer for ${action} turn of ${team} at ${new Date().toISOString()}`);

  if (currentTimer) {
    clearInterval(currentTimer);
    currentTimer = null;
  }

  const duration = 30;
  session.startTime = new Date();
  session.duration = duration;
  await session.save();
  sessionCache.set("activeSession", session);

  const startTimestamp = session.startTime.getTime();
  let lastTimeLeft = duration;

  io.to('activeSession').emit("timerUpdate", { timeLeft: duration, action, team });

  currentTimer = setInterval(async () => {
    const elapsed = Math.floor((new Date().getTime() - startTimestamp) / 1000);
    const timeLeft = duration - elapsed;

    if (timeLeft !== lastTimeLeft) {
      console.log(`Timer update: ${timeLeft}s for ${action} by ${team} at ${new Date().toISOString()}`);
      io.to('activeSession').emit("timerUpdate", { timeLeft, action, team });
      lastTimeLeft = timeLeft;
    }

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

        if (action === "ban") {
          session.bans.push({ weaponId: randomWeapon, team });
        } else if (action === "pick") {
          session.picks.push({ weaponId: randomWeapon, team });
        }

        session.actionsCompleted += 1;

        const totalBansPerPhase = session.banCount * 2;
        const totalPicksPerPhase = session.pickCount * 2;
        const totalActionsPerPhase = totalBansPerPhase + totalPicksPerPhase;
        const actionsInPhase = session.actionsCompleted % totalActionsPerPhase;

        const totalActions = totalActionsPerPhase * 2;

        if (session.actionsCompleted >= totalActions) {
          session.isCompleted = true;
          session.currentTurn = null;
          session.actionType = null;
          session.phase = 0;
          session.actionsCompleted = 0;
        } else {
          const inBanPhase = actionsInPhase < totalBansPerPhase;
          const inPickPhase = actionsInPhase >= totalBansPerPhase && actionsInPhase < totalActionsPerPhase;

          session.currentTurn = session.currentTurn === "team1" ? "team2" : "team1";

          if (actionsInPhase === 0) {
            session.currentTurn = session.firstTurn;
          } else if (actionsInPhase === totalBansPerPhase) {
            session.currentTurn = session.firstTurn;
          }

          if (inBanPhase) {
            session.actionType = "ban";
          } else if (inPickPhase) {
            session.actionType = "pick";
          } else {
            session.actionType = null;
            session.isCompleted = true;
          }
        }

        console.log(`Auto-selected ${action} for ${team}: ${randomWeapon}`);
        io.to('activeSession').emit("autoSelect", { weaponId: randomWeapon, action, team, session });

        await session.save();
        sessionCache.set("activeSession", session);
        io.to('activeSession').emit("sessionUpdate", session);

        if (!session.isCompleted && session.currentTurn && session.actionType) {
          console.log(`Starting next timer for ${session.actionType} by ${session.currentTurn}`);
          startTimer(session, io, session.actionType, session.currentTurn);
        } else {
          console.log("Session completed or no next turn");
          io.to('activeSession').emit("timerUpdate", { timeLeft: null, action: null, team: null });
        }
      } else {
        console.log("No available weapons for auto-select");
        session.isCompleted = true;
        session.currentTurn = null;
        session.actionType = null;
        session.phase = 0;
        session.actionsCompleted = 0;
        await session.save();
        sessionCache.set("activeSession", session);
        io.to('activeSession').emit("sessionUpdate", session);
        io.to('activeSession').emit("timerUpdate", { timeLeft: null, action: null, team: null });
      }
    }
  }, 1000);
};

const coinFlip = async (req, res) => {
  if (req.user.role !== "player1") return res.status(403).json({ message: "Only Player 1 can flip coin" });
  const { selectedWeapons } = req.body;
  try {
    const session = await Session.findOne({});
    if (!session) return res.status(404).json({ message: "No active session" });
    if (session.firstTurn) return res.status(400).json({ message: "Coin already flipped" });
    if (!session.readyStatus.player1Ready || !session.readyStatus.player2Ready) {
      return res.status(400).json({ message: "Both players must be ready" });
    }

    const requiredWeapons = (session.banCount * 2) + (session.pickCount * 2);
    if (selectedWeapons.length < requiredWeapons) {
      return res.status(400).json({ message: `Cần ít nhất ${requiredWeapons} vũ khí` });
    }

    session.firstTurn = Math.random() > 0.5 ? "team1" : "team2";
    session.currentTurn = session.firstTurn;
    session.actionType = session.banCount > 0 ? "ban" : session.pickCount > 0 ? "pick" : null;
    session.selectedWeapons = selectedWeapons || [];
    session.readyStatus.player1Ready = false;
    session.readyStatus.player2Ready = false;
    session.phase = 0;
    session.actionsCompleted = 0;
    if (!session.actionType) {
      session.isCompleted = true;
    }
    await session.save();
    sessionCache.set("activeSession", session);

    const io = req.app.get("io");
    io.to('activeSession').emit("sessionUpdate", session);
    console.log("Emitting coinFlip event:", { firstTurn: session.firstTurn, coinFace: session.firstTurn === "team1" ? "heads" : "tails" });
    io.to('activeSession').emit("coinFlip", { firstTurn: session.firstTurn, coinFace: session.firstTurn === "team1" ? "heads" : "tails" });

    if (!session.isCompleted && session.currentTurn && session.actionType) {
      console.log(`Starting timer for first ${session.actionType} by ${session.currentTurn}`);
      startTimer(session, io, session.actionType, session.currentTurn);
    } else {
      console.log("Session completed or no action after coinFlip");
      io.to('activeSession').emit("timerUpdate", { timeLeft: null, action: null, team: null });
    }

    res.json({ message: "Coin flipped", firstTurn: session.firstTurn });
  } catch (error) {
    console.error("Error in coinFlip:", error);
    res.status(500).json({ message: "Error flipping coin", error });
  }
};

// Các hàm khác như lockIn, getSession, v.v. giữ nguyên hoặc thêm nếu cần
module.exports = {
  authenticateToken,
  verifyToken,
  login,
  startTimer,
  coinFlip,
};