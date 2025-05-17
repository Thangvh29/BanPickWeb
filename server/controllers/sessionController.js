const Session = require("../models/Session");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("JWT_SECRET is not defined");
  process.exit(1);
}

// Cache for sessions
const sessionCache = new Map();

// Middleware to authenticate token
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

// Verify token
const verifyToken = (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Token required" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    res.json({ role: user.role });
  });
};

// Login
const login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user)
      return res.status(400).json({ message: "Tên người dùng không tồn tại" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Mật khẩu không đúng" });

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
        phase: 0, // Thêm phase để theo dõi giai đoạn ban/pick
        actionsCompleted: 0, // Đếm số hành động đã hoàn thành trong phase
      });
      sessionChanged = true;
    } else {
      if (
        session.players.length >= 2 &&
        !session.players.some(
          (p) => p.userId.toString() === user._id.toString()
        )
      ) {
        return res.status(400).json({ message: "Hệ thống đã đủ 2 người chơi" });
      }
      if (
        !session.players.some(
          (p) => p.userId.toString() === user._id.toString()
        )
      ) {
        console.log(`Adding user ${username} to existing session`);
        session.players.push({ userId: user._id, role: user.role });
        sessionChanged = true;
      }
    }

    if (sessionChanged) {
      await session.save();
      sessionCache.set("activeSession", session);
      const io = req.app.get("io");
      io.emit("sessionUpdate", session);
      console.log(`User ${username} logged in, session updated:`, session);
    }

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );
    res.json({ token, role: user.role });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ message: "Lỗi khi đăng nhập", error });
  }
};

// Logout
const logout = async (req, res) => {
  try {
    let session = await Session.findOne({});
    if (session) {
      session.players = session.players.filter(
        (p) => p.userId.toString() !== req.user.id
      );
      if (session.players.length === 0) {
        console.log("No players left, resetting session instead of deleting");
        session.bans = [];
        session.picks = [];
        session.selectedWeapons = [];
        session.banCount = 0;
        session.pickCount = 0;
        session.firstTurn = null;
        session.currentTurn = null;
        session.actionType = null;
        session.isCompleted = false;
        session.timerId = null;
        session.readyStatus = { player1Ready: false, player2Ready: false };
        session.phase = 0;
        session.actionsCompleted = 0;
      }
      await session.save();
      sessionCache.set("activeSession", session);
      const io = req.app.get("io");
      io.emit("sessionUpdate", session);
      console.log(
        `User ${req.user.username} logged out, session updated:`,
        session
      );
    }
    res.json({ message: "Logged out" });
  } catch (error) {
    console.error("Error logging out:", error);
    res.status(500).json({ message: "Error logging out", error });
  }
};

// Get session
const getSession = async (req, res) => {
  try {
    if (sessionCache.has("activeSession")) {
      console.log("Cache hit for activeSession");
      return res.json(sessionCache.get("activeSession"));
    }

    const start = Date.now();
    let session = await Session.findOne({});
    if (!session) {
      console.log("No active session, creating new one");
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
        timerId: null,
        readyStatus: { player1Ready: false, player2Ready: false },
        phase: 0,
        actionsCompleted: 0,
      });
      await session.save();
      sessionCache.set("activeSession", session);
      const io = req.app.get("io");
      io.emit("sessionUpdate", session);
    } else if (!session.players.some((p) => p.userId.toString() === req.user.id)) {
      console.log(`Adding user ${req.user.username} to session`);
      session.players.push({ userId: req.user.id, role: req.user.role });
      await session.save();
      sessionCache.set("activeSession", session);
      const io = req.app.get("io");
      io.emit("sessionUpdate", session);
    }
    console.log(`Session fetched for user ${req.user.username} in ${Date.now() - start}ms`);
    res.json(session);
  } catch (error) {
    console.error("Error fetching session:", error);
    res.status(500).json({ message: "Error fetching session", error });
  }
};

// Update session
const update = async (req, res) => {
  if (req.user.role !== "player1")
    return res.status(403).json({ message: "Only Player 1 can update session" });
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
    if (!session) return res.status(404).json({ message: "No active session" });
    sessionCache.set("activeSession", session);
    const io = req.app.get("io");
    io.emit("sessionUpdate", session);
    console.log("Session updated:", session);
    res.json({ message: "Session updated", session });
  } catch (error) {
    console.error("Error updating session:", error);
    res.status(500).json({ message: "Error updating session", error });
  }
};

// Select weapon
const selectWeapon = async (req, res) => {
  if (req.user.role !== "player1")
    return res.status(403).json({ message: "Only Player 1 can select weapons" });
  const { weaponId } = req.body;
  try {
    const session = await Session.findOne({});
    if (!session) return res.status(404).json({ message: "No active session" });
    if (session.selectedWeapons.includes(weaponId))
      return res.status(400).json({ message: "Weapon already selected" });
    session.selectedWeapons.push(weaponId);
    await session.save();
    sessionCache.set("activeSession", session);
    const io = req.app.get("io");
    io.emit("sessionUpdate", session);
    console.log("Weapon selected:", session.selectedWeapons);
    res.json({ message: "Weapon selected", selectedWeapons: session.selectedWeapons });
  } catch (error) {
    console.error("Error selecting weapon:", error);
    res.status(500).json({ message: "Error selecting weapon", error });
  }
};

// Set ready status
const setReady = async (req, res) => {
  try {
    const session = await Session.findOne({});
    if (!session) return res.status(404).json({ message: "No active session" });
    if (!session.players.some((p) => p.userId.toString() === req.user.id)) {
      return res.status(403).json({ message: "You are not in this session" });
    }

    let updated = false;
    if (req.user.role === "player1") {
      if (session.readyStatus.player1Ready) {
        return res.status(400).json({ message: "Bạn đã xác nhận chuẩn bị" });
      }
      session.readyStatus.player1Ready = true;
      updated = true;
    } else if (req.user.role === "player2") {
      if (session.readyStatus.player2Ready) {
        return res.status(400).json({ message: "Bạn đã xác nhận chuẩn bị" });
      }
      session.readyStatus.player2Ready = true;
      updated = true;
    } else {
      return res.status(403).json({ message: "Invalid role" });
    }

    if (updated) {
      await session.save();
      sessionCache.set("activeSession", session);
      const io = req.app.get("io");
      io.emit("sessionUpdate", session);
      console.log(`Player ${req.user.role} set ready status:`, session.readyStatus);
      res.json({ message: "Ready status updated", readyStatus: session.readyStatus });
    }
  } catch (error) {
    console.error("Error setting ready status:", error);
    res.status(500).json({ message: "Error setting ready status", error });
  }
};

// Start timer for a turn
let currentTimer = null;

const startTimer = async (session, io, action, team) => {
  if (!session || session.isCompleted || !session.currentTurn || !action) {
    console.log("Timer not started: session completed, no current turn, or no action");
    if (currentTimer) {
      clearInterval(currentTimer);
      currentTimer = null;
      io.emit("timerUpdate", { timeLeft: null, action: null, team: null });
    }
    return;
  }

  console.log(`Starting timer for ${action} turn of ${team}`);

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
  currentTimer = setInterval(async () => {
    const elapsed = Math.floor((new Date().getTime() - startTimestamp) / 1000);
    const timeLeft = duration - elapsed;
    console.log(`Timer update: ${timeLeft}s for ${action} by ${team}`);
    io.emit("timerUpdate", { timeLeft, action, team, startTimestamp, duration });

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

        // Tính tổng số phase dựa trên banCount và pickCount
        const totalPhases = session.banCount + session.pickCount; // Mỗi phase là 2 lượt ban hoặc 2 lượt pick
        const totalActions = totalPhases * 2; // Tổng số hành động (2 ban hoặc 2 pick mỗi phase)

        if (session.actionsCompleted >= totalActions) {
          session.isCompleted = true;
          session.currentTurn = null;
          session.actionType = null;
          session.phase = 0;
          session.actionsCompleted = 0;
        } else {
          // Chuyển lượt trong cùng phase
          session.currentTurn = session.currentTurn === "team1" ? "team2" : "team1";
          // Kiểm tra nếu phase hiện tại hoàn thành (2 hành động)
          if (session.actionsCompleted % 2 === 0) {
            session.phase += 1;
            session.currentTurn = session.firstTurn; // Reset về người đi đầu trong phase mới
          }
          // Xác định actionType dựa trên phase
          const currentPhase = session.phase;
          if (currentPhase < session.banCount) {
            session.actionType = "ban";
          } else if (currentPhase < session.banCount + session.pickCount) {
            session.actionType = "pick";
          } else {
            session.actionType = null;
            session.isCompleted = true;
          }
        }

        console.log(`Auto-selected ${action} for ${team}: ${randomWeapon}`);
        io.emit("autoSelect", { weaponId: randomWeapon, action, team, session });

        await session.save();
        sessionCache.set("activeSession", session);
        io.emit("sessionUpdate", session);

        if (!session.isCompleted && session.currentTurn && session.actionType) {
          console.log(`Starting next timer for ${session.actionType} by ${session.currentTurn}`);
          startTimer(session, io, session.actionType, session.currentTurn);
        } else {
          console.log("Session completed or no next turn");
          io.emit("timerUpdate", { timeLeft: null, action: null, team: null });
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
        io.emit("sessionUpdate", session);
        io.emit("timerUpdate", { timeLeft: null, action: null, team: null });
      }
    }
  }, 2000); // Gửi mỗi 2 giây
};

// Reset session
const resetSession = async (req, res) => {
  if (req.user.role !== "player1") {
    return res.status(403).json({ message: "Only Player 1 can reset" });
  }

  try {
    if (currentTimer) {
      clearInterval(currentTimer);
      currentTimer = null;
      console.log("Cleared timer");
    }

    let session = await Session.findOne({});
    if (!session) {
      console.log("No active session, creating new one for reset");
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
      session.startTime = null;
      session.duration = null;
      session.readyStatus = { player1Ready: false, player2Ready: false };
      session.phase = 0;
      session.actionsCompleted = 0;
    }

    await session.save();
    sessionCache.set("activeSession", session);
    const io = req.app.get("io");
    io.emit("sessionUpdate", session);
    io.emit("timerUpdate", { timeLeft: null, action: null, team: null });
    console.log("Session reset, timer stopped");
    res.json({ message: "Session reset", session });
  } catch (error) {
    console.error("Error resetting session:", error);
    res.status(500).json({ message: "Error resetting session", error });
  }
};

// Lock in (ban or pick)
const lockIn = async (req, res) => {
  const { weaponId, action } = req.body;
  try {
    const session = await Session.findOne({});
    if (!session) return res.status(404).json({ message: "No active session" });
    if (session.isCompleted)
      return res.status(400).json({ message: "Session is completed" });
    if (session.actionType !== action)
      return res.status(400).json({ message: `Not ${action} turn` });
    if (req.user.role === "player1" && session.currentTurn !== "team1") {
      return res.status(403).json({ message: "Không phải lượt của bạn" });
    }
    if (req.user.role === "player2" && session.currentTurn !== "team2") {
      return res.status(403).json({ message: "Không phải lượt của bạn" });
    }
    if (
      session.bans.some((ban) => ban.weaponId === weaponId) ||
      session.picks.some((pick) => pick.weaponId === weaponId)
    ) {
      return res.status(400).json({ message: "Weapon already banned or picked" });
    }

    const io = req.app.get("io");

    if (currentTimer) {
      clearInterval(currentTimer);
      currentTimer = null;
      io.emit("timerUpdate", { timeLeft: null, action: null, team: null });
    }

    if (action === "ban") {
      session.bans.push({ weaponId, team: session.currentTurn });
    } else if (action === "pick") {
      session.picks.push({ weaponId, team: session.currentTurn });
    }

    session.actionsCompleted += 1;

    // Tính tổng số phase dựa trên banCount và pickCount
    const totalPhases = session.banCount + session.pickCount; // Mỗi phase là 2 lượt ban hoặc 2 lượt pick
    const totalActions = totalPhases * 2; // Tổng số hành động (2 ban hoặc 2 pick mỗi phase)

    if (session.actionsCompleted >= totalActions) {
      session.isCompleted = true;
      session.currentTurn = null;
      session.actionType = null;
      session.phase = 0;
      session.actionsCompleted = 0;
    } else {
      // Chuyển lượt trong cùng phase
      session.currentTurn = session.currentTurn === "team1" ? "team2" : "team1";
      // Kiểm tra nếu phase hiện tại hoàn thành (2 hành động)
      if (session.actionsCompleted % 2 === 0) {
        session.phase += 1;
        session.currentTurn = session.firstTurn; // Reset về người đi đầu trong phase mới
      }
      // Xác định actionType dựa trên phase
      const currentPhase = session.phase;
      if (currentPhase < session.banCount) {
        session.actionType = "ban";
      } else if (currentPhase < session.banCount + session.pickCount) {
        session.actionType = "pick";
      } else {
        session.actionType = null;
        session.isCompleted = true;
      }
    }

    await session.save();
    sessionCache.set("activeSession", session);
    io.emit("sessionUpdate", session);

    if (!session.isCompleted && session.currentTurn && session.actionType) {
      console.log(`Starting timer after lockIn for ${session.actionType} by ${session.currentTurn}`);
      startTimer(session, io, session.actionType, session.currentTurn);
    } else {
      console.log("Session completed or no next turn after lockIn");
      io.emit("timerUpdate", { timeLeft: null, action: null, team: null });
    }

    res.json({ message: `${action} locked`, session });
  } catch (error) {
    console.error(`Error locking in ${action}:`, error);
    res.status(500).json({ message: "Error locking in", error });
  }
};

// Ban weapon
const banWeapon = async (req, res) => {
  const { weaponId } = req.body;
  try {
    const session = await Session.findOne({});
    if (!session) return res.status(404).json({ message: "No active session" });
    if (session.isCompleted)
      return res.status(400).json({ message: "Session is completed" });
    if (session.actionType !== "ban")
      return res.status(400).json({ message: "Not ban turn" });
    if (req.user.role === "player1" && session.currentTurn !== "team1") {
      return res.status(403).json({ message: "Không phải lượt của bạn" });
    }
    if (req.user.role === "player2" && session.currentTurn !== "team2") {
      return res.status(403).json({ message: "Không phải lượt của bạn" });
    }
    if (
      session.bans.some((b) => b.weaponId === weaponId) ||
      session.picks.some((p) => p.weaponId === weaponId)
    ) {
      return res.status(400).json({ message: "Weapon already banned or picked" });
    }

    const io = req.app.get("io");

    if (currentTimer) {
      clearInterval(currentTimer);
      currentTimer = null;
      io.emit("timerUpdate", { timeLeft: null, action: null, team: null });
    }

    session.bans.push({ weaponId, team: session.currentTurn });
    session.actionsCompleted += 1;

    // Tính tổng số phase dựa trên banCount và pickCount
    const totalPhases = session.banCount + session.pickCount;
    const totalActions = totalPhases * 2;

    if (session.actionsCompleted >= totalActions) {
      session.isCompleted = true;
      session.currentTurn = null;
      session.actionType = null;
      session.phase = 0;
      session.actionsCompleted = 0;
    } else {
      session.currentTurn = session.currentTurn === "team1" ? "team2" : "team1";
      if (session.actionsCompleted % 2 === 0) {
        session.phase += 1;
        session.currentTurn = session.firstTurn;
      }
      const currentPhase = session.phase;
      if (currentPhase < session.banCount) {
        session.actionType = "ban";
      } else if (currentPhase < session.banCount + session.pickCount) {
        session.actionType = "pick";
      } else {
        session.actionType = null;
        session.isCompleted = true;
      }
    }

    await session.save();
    sessionCache.set("activeSession", session);
    io.emit("sessionUpdate", session);

    if (!session.isCompleted && session.currentTurn && session.actionType) {
      console.log(`Starting timer after banWeapon for ${session.actionType} by ${session.currentTurn}`);
      startTimer(session, io, session.actionType, session.currentTurn);
    } else {
      console.log("Session completed or no next turn after banWeapon");
      io.emit("timerUpdate", { timeLeft: null, action: null, team: null });
    }

    res.json({ message: "Weapon banned", session });
  } catch (error) {
    console.error("Error banning weapon:", error);
    res.status(500).json({ message: "Error banning weapon", error });
  }
};

// Pick weapon
const pickWeapon = async (req, res) => {
  const { weaponId } = req.body;
  try {
    const session = await Session.findOne({});
    if (!session) return res.status(404).json({ message: "No active session" });
    if (session.isCompleted)
      return res.status(400).json({ message: "Session is completed" });
    if (session.actionType !== "pick")
      return res.status(400).json({ message: "Not pick turn" });
    if (req.user.role === "player1" && session.currentTurn !== "team1") {
      return res.status(403).json({ message: "Không phải lượt của bạn" });
    }
    if (req.user.role === "player2" && session.currentTurn !== "team2") {
      return res.status(403).json({ message: "Không phải lượt của bạn" });
    }
    if (
      session.bans.some((b) => b.weaponId === weaponId) ||
      session.picks.some((p) => p.weaponId === weaponId)
    ) {
      return res.status(400).json({ message: "Weapon already banned or picked" });
    }

    const io = req.app.get("io");

    if (currentTimer) {
      clearInterval(currentTimer);
      currentTimer = null;
      io.emit("timerUpdate", { timeLeft: null, action: null, team: null });
    }

    session.picks.push({ weaponId, team: session.currentTurn });
    session.actionsCompleted += 1;

    const totalPhases = session.banCount + session.pickCount;
    const totalActions = totalPhases * 2;

    if (session.actionsCompleted >= totalActions) {
      session.isCompleted = true;
      session.currentTurn = null;
      session.actionType = null;
      session.phase = 0;
      session.actionsCompleted = 0;
    } else {
      session.currentTurn = session.currentTurn === "team1" ? "team2" : "team1";
      if (session.actionsCompleted % 2 === 0) {
        session.phase += 1;
        session.currentTurn = session.firstTurn;
      }
      const currentPhase = session.phase;
      if (currentPhase < session.banCount) {
        session.actionType = "ban";
      } else if (currentPhase < session.banCount + session.pickCount) {
        session.actionType = "pick";
      } else {
        session.actionType = null;
        session.isCompleted = true;
      }
    }

    await session.save();
    sessionCache.set("activeSession", session);
    io.emit("sessionUpdate", session);

    if (!session.isCompleted && session.currentTurn && session.actionType) {
      console.log(`Starting timer after pickWeapon for ${session.actionType} by ${session.currentTurn}`);
      startTimer(session, io, session.actionType, session.currentTurn);
    } else {
      console.log("Session completed or no next turn after pickWeapon");
      io.emit("timerUpdate", { timeLeft: null, action: null, team: null });
    }

    res.json({ message: "Weapon picked", session });
  } catch (error) {
    console.error("Error picking weapon:", error);
    res.status(500).json({ message: "Error picking weapon", error });
  }
};

// Coin flip
const coinFlip = async (req, res) => {
  if (req.user.role !== "player1")
    return res.status(403).json({ message: "Only Player 1 can flip coin" });
  const { selectedWeapons } = req.body;
  try {
    const session = await Session.findOne({});
    if (!session) return res.status(404).json({ message: "No active session" });
    if (session.firstTurn)
      return res.status(400).json({ message: "Coin already flipped" });
    if (
      !session.readyStatus.player1Ready ||
      !session.readyStatus.player2Ready
    ) {
      return res.status(400).json({ message: "Both players must be ready" });
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
    console.log("Emitting coinFlip event:", {
      firstTurn: session.firstTurn,
      coinFace: session.firstTurn === "team1" ? "heads" : "tails",
    });
    io.emit("coinFlip", {
      firstTurn: session.firstTurn,
      coinFace: session.firstTurn === "team1" ? "heads" : "tails",
    });

    if (!session.isCompleted && session.currentTurn && session.actionType) {
      console.log(`Starting timer for first ${session.actionType} by ${session.currentTurn}`);
      startTimer(session, io, session.actionType, session.currentTurn);
    } else {
      console.log("Session completed or no action after coinFlip");
      io.emit("timerUpdate", { timeLeft: null, action: null, team: null });
    }

    res.json({ message: "Coin flipped", firstTurn: session.firstTurn });
  } catch (error) {
    console.error("Error in coinFlip:", error);
    res.status(500).json({ message: "Error flipping coin", error });
  }
};

// Export all functions
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