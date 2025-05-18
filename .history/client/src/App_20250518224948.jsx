
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Container, Row, Col, Button, Form, Alert } from 'react-bootstrap';
import UserPanelLeft from './components/UserPanelLeft';
import WeaponGrid from './components/WeaponGrid';
import CoinFlipPanel from './components/CoinFlipPanel';
import Login from './components/Login';
import WeaponSelectionPanel from './components/WeaponSelectionPanel';
import io from 'socket.io-client';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/session';
const socket = io(API_URL.replace('/api/session', ''), {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
});

function App() {
  const [user, setUser] = useState(null);
  const [banCount, setBanCount] = useState('');
  const [pickCount, setPickCount] = useState('');
  const [isInputSet, setIsInputSet] = useState(false);
  const [locked, setLocked] = useState(false);
  const [flipResult, setFlipResult] = useState(null);
  const [started, setStarted] = useState(false);
  const [sessionData, setSessionData] = useState(null);
  const [currentAction, setCurrentAction] = useState(null);
  const [showCoinFlip, setShowCoinFlip] = useState(false);
  const [coinFace, setCoinFace] = useState('heads');
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSessionData = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Vui lòng đăng nhập');
        return;
      }
      const response = await axios.get(API_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const newData = response.data;
      if (!newData.banCount || !newData.pickCount) {
        setError('Dữ liệu phiên không hợp lệ');
        return;
      }
      setSessionData(newData);
      setCurrentAction(newData.actionType || null);
      setFlipResult(newData.firstTurn === 'team1' ? 'Player 1' : newData.firstTurn === 'team2' ? 'Player 2' : null);
      setStarted(!!newData.firstTurn && !newData.isCompleted);
      setLocked(newData.banCount > 0 || newData.pickCount > 0);
      if (!isInputSet && !locked) {
        setBanCount(newData.banCount || '');
        setPickCount(newData.pickCount || '');
      }
    } catch (error) {
      console.error('Error fetching session:', error);
      setError(error.response?.data?.message || 'Lỗi khi tải dữ liệu phiên');
      if (error.response?.status === 403) {
        localStorage.removeItem('token');
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isInputSet, locked]);

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      socket.emit('joinSession', 'activeSession');
    });
    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setError('Không thể kết nối server');
    });
    socket.on('coinFlip', ({ firstTurn, coinFace }) => {
      console.log('CoinFlip event:', { firstTurn, coinFace });
      setShowCoinFlip(true);
      setTimeout(() => {
        setCoinFace(coinFace);
        setTimeout(() => {
          setFlipResult(firstTurn === 'team1' ? 'Player 1' : 'Player 2');
          setStarted(true);
          setCurrentAction('ban');
          setShowCoinFlip(false);
          setTimer(30); // Initialize timer
          fetchSessionData();
        }, 500);
      }, 2000);
    });
    socket.on('timerUpdate', ({ timeLeft, action, team }) => {
      console.log('TimerUpdate:', { timeLeft, action, team });
      setTimer(timeLeft !== null ? timeLeft : null);
      setCurrentAction(action || null);
      setSessionData((prev) => ({
        ...prev,
        currentTurn: team || null,
        actionType: action || null,
      }));
    });
    socket.on('sessionUpdate', (session) => {
      console.log('SessionUpdate:', session);
      if (!session || !session.banCount || !session.pickCount) {
        setError('Dữ liệu phiên không hợp lệ');
        return;
      }
      setSessionData(session);
      setCurrentAction(session.actionType || null);
      setFlipResult(session.firstTurn === 'team1' ? 'Player 1' : session.firstTurn === 'team2' ? 'Player 2' : null);
      setStarted(!!session.firstTurn && !session.isCompleted);
      setLocked(session.banCount > 0 || session.pickCount > 0);
    });
    socket.on('autoSelect', ({ weaponId, action, team, session }) => {
      console.log('AutoSelect:', { weaponId, action, team });
      setSessionData(session);
      setCurrentAction(session.actionType || null);
      setStarted(!session.isCompleted);
      setFlipResult(session.firstTurn === 'team1' ? 'Player 1' : session.firstTurn === 'team2' ? 'Player 2' : null);
      setError(`Hệ thống tự động ${action} ${weaponId} cho ${team === 'team1' ? 'Player 1' : 'Player 2'}`);
      setTimer(null);
    });

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('coinFlip');
      socket.off('timerUpdate');
      socket.off('sessionUpdate');
      socket.off('autoSelect');
    };
  }, [fetchSessionData]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios
        .get(`${API_URL}/verify`, { headers: { Authorization: `Bearer ${token}` } })
        .then((response) => {
          setUser(response.data.role);
          fetchSessionData();
        })
        .catch(() => {
          localStorage.removeItem('token');
          setUser(null);
          setError('Phiên đăng nhập không hợp lệ');
        });
    }
  }, [fetchSessionData]);

  const handleLock = useCallback(
    async (e) => {
      e.preventDefault(); // Prevent page refresh
      if (parseInt(banCount) >= 0 && parseInt(pickCount) >= 0 && (parseInt(banCount) > 0 || parseInt(pickCount) > 0)) {
        setIsInputSet(true);
        setLocked(true);
        try {
          const token = localStorage.getItem('token');
          await axios.post(
            `${API_URL}/update`,
            { banCount: parseInt(banCount) || 0, pickCount: parseInt(pickCount) || 0 },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          await fetchSessionData();
        } catch (error) {
          setError(error.response?.data?.message || 'Lỗi khi lưu số lượt');
          setLocked(false);
          setIsInputSet(false);
        }
      } else {
        setError('Nhập ít nhất một số lượt ban hoặc pick hợp lệ');
      }
    },
    [banCount, pickCount, fetchSessionData]
  );

  const handleUnlock = useCallback(() => {
    setLocked(false);
    setIsInputSet(false);
    setBanCount('');
    setPickCount('');
    setError('');
  }, []);

  const handlePrepare = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/ready`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setError('');
    } catch (error) {
      setError(error.response?.data?.message || 'Lỗi khi xác nhận chuẩn bị');
    }
  }, []);

  const handleReady = useCallback(async () => {
    if (user !== 'player1') return;
    const requiredWeapons = (parseInt(sessionData?.banCount || banCount) || 0) * 2 + (parseInt(sessionData?.pickCount || pickCount) || 0) * 2;
    if (requiredWeapons > 0 && sessionData?.selectedWeapons?.length < requiredWeapons) {
      setError(`Chọn ít nhất ${requiredWeapons} súng`);
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/coinflip`,
        { selectedWeapons: sessionData?.selectedWeapons },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setError('');
    } catch (error) {
      setError(error.response?.data?.message || 'Lỗi khi tung đồng xu');
    }
  }, [user, sessionData, banCount, pickCount]);

  const handleReset = useCallback(async () => {
    if (user !== 'player1') return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/reset`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setStarted(false);
      setFlipResult(null);
      setCurrentAction(null);
      setShowCoinFlip(false);
      setLocked(false);
      setIsInputSet(false);
      setBanCount('');
      setPickCount('');
      setError('');
      setTimer(null);
      await fetchSessionData();
    } catch (error) {
      setError(error.response?.data?.message || 'Lỗi khi reset phiên');
    }
  }, [user, fetchSessionData]);

  const handleWeaponSelect = useCallback(async (weaponId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/select`,
        { weaponId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setError('');
    } catch (error) {
      setError(error.response?.data?.message || 'Lỗi khi chọn súng');
    }
  }, []);

  const handleBanPick = useCallback(async (weaponId, action) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/lockin`,
        { weaponId, action },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setError('');
    } catch (error) {
      setError(error.response?.data?.message || `Lỗi khi thực hiện ${action}`);
    }
  }, []);

  const handleLogin = useCallback((role) => {
    setUser(role);
    setError('');
  }, []);

  const handleLogout = useCallback(() => {
    const token = localStorage.getItem('token');
    axios
      .post(`${API_URL}/logout`, {}, { headers: { Authorization: `Bearer ${token}` } })
      .catch((err) => console.error('Logout error:', err));
    localStorage.removeItem('token');
    setUser(null);
    setBanCount('');
    setPickCount('');
    setLocked(false);
    setIsInputSet(false);
    setFlipResult(null);
    setStarted(false);
    setSessionData(null);
    setCurrentAction(null);
    setShowCoinFlip(false);
    setError('');
    setTimer(null);
  }, []);

  const currentTurn = sessionData?.currentTurn || null;
  const isControlDisabled = started && !sessionData?.isCompleted;
  const requiredWeapons = (parseInt(sessionData?.banCount || banCount) || 0) * 2 + (parseInt(sessionData?.pickCount || pickCount) || 0) * 2;
  const isWeaponsSelected = sessionData?.selectedWeapons?.length >= requiredWeapons && requiredWeapons > 0;
  const isReadyDisabled =
    user !== 'player1' ||
    (requiredWeapons > 0 && !isWeaponsSelected) ||
    isControlDisabled ||
    !sessionData?.readyStatus?.player1Ready ||
    !sessionData?.readyStatus?.player2Ready;

  if (isLoading) return <div>Đang tải...</div>;
  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <>
      <div className="header">
        <h2 className="ms-3">CS2 Weapon Ban/Pick Tool</h2>
        <div className="d-flex justify-content-between align-items-center px-3">
          <p>Đăng nhập với vai trò: {user === 'player1' ? 'Player 1 (Admin)' : 'Player 2'}</p>
          <Button variant="link" onClick={handleLogout} className="text-light">
            Đăng xuất
          </Button>
        </div>
      </div>
      <Container fluid className="p-0 main-content">
        {error && (
          <Alert variant="danger" onClose={() => setError('')} dismissible>
            {error}
          </Alert>
        )}
        {user === 'player1' && (
          <Row className="align-items-center justify-content-center">
            <Col xs={12} className="p-3 text-center">
              <div className="control-panel">
                <div className="d-flex justify-content-center align-items-center flex-wrap gap-2">
                  <div className="me-2">
                    <Form.Label>Số lượt ban</Form.Label>
                    <Form.Control
                      type="number"
                      value={banCount}
                      onChange={(e) => setBanCount(e.target.value)}
                      disabled={locked || isControlDisabled}
                      size="sm"
                    />
                  </div>
                  <div className="me-2">
                    <Form.Label>Số lượt pick</Form.Label>
                    <Form.Control
                      type="number"
                      value={pickCount}
                      onChange={(e) => setPickCount(e.target.value)}
                      disabled={locked || isControlDisabled}
                      size="sm"
                    />
                  </div>
                  <Button
                    onClick={handleLock}
                    className="me-2 btn-sm btn-orange"
                    disabled={isControlDisabled || locked || (!banCount && !pickCount)}
                  >
                    Khóa
                  </Button>
                  <Button
                    onClick={handleUnlock}
                    className="btn-sm btn-orange"
                    disabled={!locked || isControlDisabled}
                  >
                    Bỏ khóa
                  </Button>
                </div>
                </div>
              </Col>
            </Row>
          )}
          <Row className="main-content">
            <Col xs={12} md={3} className="p-3">
              <div className="d-flex flex-column align-items-center">
                <UserPanelLeft
                  label="Player 1"
                  bans={sessionData?.banCount || banCount}
                  picks={sessionData?.pickCount || pickCount}
                  bannedWeapons={sessionData?.bans?.filter(ban => ban.team === 'team1') || []}
                  pickedWeapons={sessionData?.picks?.filter(pick => pick.team === 'team1') || []}
                  isCurrentTurn={currentTurn === 'team1'}
                />
                <div className="separator"></div>
                <UserPanelLeft
                  label="Player 2"
                  bans={sessionData?.banCount || banCount}
                  picks={sessionData?.pickCount || pickCount}
                  bannedWeapons={sessionData?.bans?.filter(ban => ban.team === 'team2') || []}
                  pickedWeapons={sessionData?.picks?.filter(pick => pick.team === 'team2') || []}
                  isCurrentTurn={currentTurn === 'team2'}
                />
              </div>
            </Col>
            <Col xs={12} md={6} className="p-3 weapon-grid">
              <div className="timer-display">
                {timer !== null && currentTurn && (
                  <h3>
                    Thời gian còn lại: {timer}s ({currentTurn === 'team1' ? 'Player 1' : 'Player 2'} - {currentAction})
                  </h3>
                )}
              </div>
              <WeaponGrid
                currentTurn={currentTurn}
                turnAction={currentAction}
                user={user}
                availableWeapons={sessionData?.selectedWeapons || []}
                onBanPick={handleBanPick}
                bans={sessionData?.bans || []}
                picks={sessionData?.picks || []}
                timer={timer}
                onUpdate={fetchSessionData}
              />
            </Col>
            <Col xs={12} md={3} className="p-3 d-flex flex-column align-items-center">
              <h5>Người chơi bắt đầu: {flipResult || 'Chưa xác định'}</h5>
              <h5>Lượt hiện tại: {currentTurn === 'team1' ? 'Player 1' : currentTurn === 'team2' ? 'Player 2' : 'Chưa bắt đầu'}</h5>
              <h5>Hành động: {currentAction || 'Chưa xác định'}</h5>
              {locked && (
                <div className="mt-3 ready-status">
                  <h5>Trạng thái chuẩn bị:</h5>
                  <p className={sessionData?.readyStatus?.player1Ready ? 'ready' : 'not-ready'}>
                    Player 1: {sessionData?.readyStatus?.player1Ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}
                  </p>
                  <p className={sessionData?.readyStatus?.player2Ready ? 'ready' : 'not-ready'}>
                    Player 2: {sessionData?.readyStatus?.player2Ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}
                  </p>
                  <Button
                    onClick={handlePrepare}
                    className="button-prepare btn-orange mb-2"
                    disabled={isControlDisabled || (user === 'player1' && sessionData?.readyStatus?.player1Ready) || (user === 'player2' && sessionData?.readyStatus?.player2Ready)}
                  >
                    Chuẩn bị
                  </Button>
                </div>
              )}
              {user === 'player1' && (
                <div className="mt-3">
                  <Button
                    onClick={handleReady}
                    className="button-ready me-2 btn-orange"
                    disabled={isReadyDisabled}
                  >
                    Ready
                  </Button>
                  <Button onClick={handleReset} className="button-reset btn-orange">
                    Reset
                  </Button>
                </div>
              )}
              {locked && sessionData?.readyStatus?.player1Ready && sessionData?.readyStatus?.player2Ready && (
                <Alert variant="success" className="mt-2">
                  Cả hai người chơi đã sẵn sàng!
                </Alert>
              )}
            </Col>
          </Row>
          {user === 'player1' && (
            <Row className="mt-3">
              <Col xs={12} className="p-3">
                <WeaponSelectionPanel
                  onSelectWeapon={handleWeaponSelect}
                  disabled={started && !sessionData?.isCompleted}
                />
              </Col>
            </Row>
          )}
          {showCoinFlip && (
            <div className="coin-flip-modal">
              <div className="coin-flip-content">
                <div className="coin" id="coin">
                  <div className="coin-inner">
                    <img
                      src="https://media.geeksforgeeks.org/wp-content/uploads/20231016151817/heads.png"
                      alt="heads"
                      className={`coin-face ${coinFace === 'heads' ? 'heads' : ''}`}
                    />
                    <img
                      src="https://media.geeksforgeeks.org/wp-content/uploads/20231016151806/tails.png"
                      alt="tails"
                      className={`coin-face ${coinFace === 'tails' ? 'tails' : ''}`}
                    />
                  </div>
                </div>
                <p>Đang tung đồng xu...</p>
              </div>
            </div>
          )}
        </Container>
      </>
    );
  }

  export default App;
```