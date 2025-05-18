import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Container, Row, Col, Button, Form, Alert, Spinner } from 'react-bootstrap';
import UserPanelLeft from './components/UserPanelLeft';
import WeaponGrid from './components/WeaponGrid';
import CoinFlipPanel from './components/CoinFlipPanel';
import Login from './components/Login';
import WeaponSelectionPanel from './components/WeaponSelectionPanel';
import CoinFlip from './components/CoinFlip';
import io from 'socket.io-client';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/session';
const socket = io((import.meta.env.VITE_API_URL || 'http://localhost:5000').replace('/api/session', ''), {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
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
  const [selectedWeapons, setSelectedWeapons] = useState([]);
  const [timer, setTimer] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSessionData = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('[App] No token found, user must login');
        setError('Vui lòng đăng nhập');
        setUser(null);
        return;
      }
      console.log('[App] Fetching session data with token:', token.slice(0, 10) + '...');
      const response = await axios.get(`${API_URL}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 7000,
      });
      const newData = response.data;
      if (!newData.banCount || !newData.pickCount) {
        console.error('[App] Invalid session data:', newData);
        setError('Dữ liệu phiên không hợp lệ');
        return;
      }
      setSessionData(prev => {
        if (JSON.stringify(prev) !== JSON.stringify(newData)) {
          console.log('[App] Session data updated:', newData);
          return newData;
        }
        return prev;
      });
      setCurrentAction(newData.actionType);
      setFlipResult(newData.firstTurn === 'team1' ? 'Player 1' : newData.firstTurn === 'team2' ? 'Player 2' : null);
      setStarted(!!newData.firstTurn && !newData.isCompleted);
      setLocked(newData.banCount > 0 || newData.pickCount > 0);
      if (!isInputSet && !locked) {
        setBanCount(newData.banCount || '');
        setPickCount(newData.pickCount || '');
      }
    } catch (error) {
      console.error('[App] Fetch session error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
        setError('Yêu cầu hết thời gian, kiểm tra kết nối mạng');
      } else if (!error.response) {
        setError('Không kết nối được server, thử lại sau');
      } else if (error.response.status === 404) {
        setSessionData(null);
        setLocked(false);
        setStarted(false);
        setFlipResult(null);
        setCurrentAction(null);
        setError('Không có phiên hoạt động');
      } else if (error.response.status === 403 || error.response.status === 401) {
        localStorage.removeItem('token');
        setUser(null);
        setError('Phiên đăng nhập không hợp lệ, đăng nhập lại');
      } else {
        setError('Lỗi tải dữ liệu phiên, thử lại');
      }
    } finally {
      setIsLoading(false);
    }
  }, [isInputSet, locked]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      console.log('[App] Verifying token on mount');
      axios
        .get(`${API_URL}/verify`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 7000,
        })
        .then((response) => {
          console.log('[App] Token verified, role:', response.data.role);
          setUser(response.data.role);
          fetchSessionData();
        })
        .catch((error) => {
          console.error('[App] Token verification failed:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
          });
          localStorage.removeItem('token');
          setUser(null);
          setError('Phiên đăng nhập không hợp lệ, đăng nhập lại');
        });
    }
  }, [fetchSessionData]);

  useEffect(() => {
    socket.on('connect', () => {
      console.log('[App] Socket.IO connected, ID:', socket.id);
      socket.emit('joinSession', 'activeSession');
    });
    socket.on('sessionJoined', ({ sessionId }) => {
      console.log('[App] Joined session:', sessionId);
    });
    socket.on('connect_error', (error) => {
      console.error('[App] Socket.IO connection error:', error.message);
      setError('Lỗi kết nối server, thử lại');
    });
    socket.on('sessionUpdate', (session) => {
      console.log('[App] Received sessionUpdate:', session);
      if (!session || !session.banCount || !session.pickCount) {
        console.error('[App] Invalid session data:', session);
        setError('Dữ liệu phiên không hợp lệ');
        return;
      }
      setSessionData(prev => {
        if (JSON.stringify(prev) !== JSON.stringify(session)) {
          console.log('[App] Session data updated via socket:', session);
          return session;
        }
        return prev;
      });
      setCurrentAction(session.actionType);
      setFlipResult(session.firstTurn === 'team1' ? 'Player 1' : session.firstTurn === 'team2' ? 'Player 2' : null);
      setStarted(!!session.firstTurn && !session.isCompleted);
      setLocked(session.banCount > 0 || session.pickCount > 0);
    });
    socket.on('coinFlip', ({ firstTurn, coinFace }) => {
      console.log('[App] Received coinFlip:', { firstTurn, coinFace });
      setShowCoinFlip(true);
      setTimeout(() => {
        setCoinFace(coinFace);
        setTimeout(() => {
          setFlipResult(firstTurn === 'team1' ? 'Player 1' : 'Player 2');
          setStarted(true);
          setCurrentAction('ban');
          setShowCoinFlip(false);
        }, 500);
      }, 2000);
    });
    socket.on('timerUpdate', ({ timeLeft, action, team }) => {
      console.log('[App] Received timerUpdate:', { timeLeft, action, team });
      setTimer(timeLeft);
      setCurrentAction(action);
    });
    socket.on('autoSelect', ({ weaponId, action, team, session }) => {
      console.log('[App] Received autoSelect:', { weaponId, action, team });
      setSessionData(session);
      setCurrentAction(session.actionType);
      setStarted(!session.isCompleted);
      setFlipResult(session.firstTurn === 'team1' ? 'Player 1' : session.firstTurn === 'team2' ? 'Player 2' : null);
      setError(`Hệ thống tự động ${action} ${weaponId} cho ${team === 'team1' ? 'Player 1' : 'Player 2'}`);
    });

    return () => {
      socket.off('connect');
      socket.off('sessionJoined');
      socket.off('connect_error');
      socket.off('sessionUpdate');
      socket.off('coinFlip');
      socket.off('timerUpdate');
      socket.off('autoSelect');
    };
  }, []);

  const handleLock = async () => {
    if (user !== 'player1') {
      setError('Chỉ Player 1 có thể khóa số lượng ban/pick');
      return;
    }
    if (!banCount || !pickCount || banCount < 0 || pickCount < 0) {
      setError('Số lượng ban/pick không hợp lệ');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      console.log('[App] Locking ban/pick counts:', { banCount, pickCount });
      await axios.post(
        `${API_URL}/update`,
        { banCount: parseInt(banCount), pickCount: parseInt(pickCount) },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 7000 }
      );
      setIsInputSet(true);
      setLocked(true);
      setError('');
      fetchSessionData();
    } catch (error) {
      console.error('[App] Lock error:', error);
      setError(error.response?.data?.message || 'Lỗi khi cập nhật số lượng ban/pick');
    }
  };

  const handleUnlock = async () => {
    if (user !== 'player1') {
      setError('Chỉ Player 1 có thể mở khóa');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      console.log('[App] Unlocking session');
      await axios.post(`${API_URL}/reset`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 7000 });
      setIsInputSet(false);
      setLocked(false);
      setBanCount('');
      setPickCount('');
      setStarted(false);
      setFlipResult(null);
      setCurrentAction(null);
      setError('');
      fetchSessionData();
    } catch (error) {
      console.error('[App] Unlock error:', error);
      setError(error.response?.data?.message || 'Lỗi khi reset phiên');
    }
  };

  const handleWeaponSelect = async (weaponId) => {
    if (user !== 'player1') {
      setError('Chỉ Player 1 có thể chọn súng');
      return;
    }
    if (selectedWeapons.includes(weaponId)) {
      setError('Súng đã được chọn');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      console.log('[App] Selecting weapon:', weaponId);
      await axios.post(
        `${API_URL}/select`,
        { weaponId },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 7000 }
      );
      setSelectedWeapons([...selectedWeapons, weaponId]);
      setError('');
      fetchSessionData();
    } catch (error) {
      console.error('[App] Weapon select error:', error);
      setError(error.response?.data?.message || 'Lỗi khi chọn súng');
    }
  };

  const handlePrepare = async () => {
    try {
      const token = localStorage.getItem('token');
      console.log('[App] Setting ready status');
      await axios.post(`${API_URL}/ready`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 7000 });
      setError('');
      fetchSessionData();
    } catch (error) {
      console.error('[App] Prepare error:', error);
      setError(error.response?.data?.message || 'Lỗi khi xác nhận chuẩn bị');
    }
  };

  const handleReady = async () => {
    if (user !== 'player1') {
      setError('Chỉ Player 1 có thể tung đồng xu');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      console.log('[App] Initiating coin flip');
      await axios.post(
        `${API_URL}/coinflip`,
        { selectedWeapons },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 7000 }
      );
      setError('');
    } catch (error) {
      console.error('[App] Coin flip error:', error);
      setError(error.response?.data?.message || 'Lỗi khi tung đồng xu');
    }
  };

  const handleBanPick = async (weaponId, action) => {
    try {
      const token = localStorage.getItem('token');
      console.log('[App] Ban/pick:', { weaponId, action });
      await axios.post(
        `${API_URL}/lockin`,
        { weaponId, action },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 7000 }
      );
      setError('');
      fetchSessionData();
    } catch (error) {
      console.error('[App] Ban/pick error:', error);
      setError(error.response?.data?.message || 'Lỗi khi ban/pick');
    }
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('token');
      console.log('[App] Logging out');
      await axios.post(`${API_URL}/logout`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 7000 });
      localStorage.removeItem('token');
      setUser(null);
      setSessionData(null);
      setError('');
      setLocked(false);
      setStarted(false);
      setFlipResult(null);
      setCurrentAction(null);
      setBanCount('');
      setPickCount('');
      setIsInputSet(false);
    } catch (error) {
      console.error('[App] Logout error:', error);
      setError(error.response?.data?.message || 'Lỗi khi đăng xuất');
    }
  };

  const weaponGridProps = useMemo(() => ({
    currentTurn: sessionData?.currentTurn,
    turnAction: currentAction,
    user,
    availableWeapons: sessionData?.selectedWeapons || [],
    onBanPick: handleBanPick,
    onUpdate: fetchSessionData,
    bans: sessionData?.bans,
    picks: sessionData?.picks,
  }), [sessionData, currentAction, user, handleBanPick, fetchSessionData]);

  return (
    <Container fluid>
      {error && (
        <Alert variant="danger" onClose={() => setError('')} dismissible>
          {error}
        </Alert>
      )}
      {isLoading && <Spinner animation="border" variant="primary" />}
      {!user ? (
        <Login setUser={setUser} setError={setError} fetchSessionData={fetchSessionData} />
      ) : (
        <>
          <Row className="mb-3">
            <Col>
              <h2>CS2 Weapon Ban/Pick Tool</h2>
            </Col>
            <Col xs="auto">
              <Button variant="danger" onClick={handleLogout}>
                Đăng xuất
              </Button>
            </Col>
          </Row>
          <Row>
            <Col md={3}>
              <UserPanelLeft
                label="Player 1"
                bans={sessionData?.bans?.filter((b) => b.team === 'team1')}
                picks={sessionData?.picks?.filter((p) => p.team === 'team1')}
                bannedWeapons={sessionData?.bans?.filter((b) => b.team === 'team1') || []}
                pickedWeapons={sessionData?.picks?.filter((p) => p.team === 'team1') || []}
                isCurrentTurn={sessionData?.currentTurn === 'team1'}
              />
            </Col>
            <Col md={6}>
              <CoinFlipPanel started={started} flipResult={flipResult} />
              {user === 'player1' && !locked && (
                <Form className="mb-3">
                  <Row>
                    <Col>
                      <Form.Group controlId="banCount">
                        <Form.Label>Số lượng Ban</Form.Label>
                        <Form.Control
                          type="number"
                          value={banCount}
                          onChange={(e) => setBanCount(e.target.value)}
                          min="0"
                          disabled={isLoading}
                        />
                      </Form.Group>
                    </Col>
                    <Col>
                      <Form.Group controlId="pickCount">
                        <Form.Label>Số lượng Pick</Form.Label>
                        <Form.Control
                          type="number"
                          value={pickCount}
                          onChange={(e) => setPickCount(e.target.value)}
                          min="0"
                          disabled={isLoading}
                        />
                      </Form.Group>
                    </Col>
                    <Col xs="auto" className="align-self-end">
                      <Button variant="primary" onClick={handleLock} disabled={isLoading}>
                        Khóa
                      </Button>
                    </Col>
                  </Row>
                </Form>
              )}
              {locked && user === 'player1' && !started && (
                <Row className="mb-3">
                  <Col>
                    <WeaponSelectionPanel
                      onSelect={handleWeaponSelect}
                      disabled={sessionData?.readyStatus?.player1Ready || isLoading}
                    />
                  </Col>
                  <Col xs="auto" className="align-self-end">
                    <Button
                      variant="success"
                      onClick={handlePrepare}
                      disabled={sessionData?.readyStatus?.player1Ready || isLoading}
                    >
                      Chuẩn bị
                    </Button>
                  </Col>
                  <Col xs="auto" className="align-self-end">
                    <Button variant="warning" onClick={handleUnlock} disabled={isLoading}>
                      Mở khóa
                    </Button>
                  </Col>
                </Row>
              )}
              {locked && user === 'player2' && !started && (
                <Row className="mb-3">
                  <Col xs="auto">
                    <Button
                      variant="success"
                      onClick={handlePrepare}
                      disabled={sessionData?.readyStatus?.player2Ready || isLoading}
                    >
                      Chuẩn bị
                    </Button>
                  </Col>
                </Row>
              )}
              {user === 'player1' && sessionData?.readyStatus?.player1Ready && sessionData?.readyStatus?.player2Ready && (
                <Row className="mb-3">
                  <Col xs="auto">
                    <Button variant="primary" onClick={handleReady} disabled={isLoading}>
                      Tung đồng xu
                    </Button>
                  </Col>
                </Row>
              )}
              {started && (
                <>
                  <h4>Thời gian còn lại: {timer !== null ? `${timer}s` : 'Hết thời gian'}</h4>
                  <WeaponGrid {...weaponGridProps} />
                </>
              )}
            </Col>
            <Col md={3}>
              <UserPanelLeft
                label="Player 2"
                bans={sessionData?.bans?.filter((b) => b.team === 'team2')}
                picks={sessionData?.picks?.filter((p) => p.team === 'team2')}
                bannedWeapons={sessionData?.bans?.filter((b) => b.team === 'team2') || []}
                pickedWeapons={sessionData?.picks?.filter((p) => p.team === 'team2') || []}
                isCurrentTurn={sessionData?.currentTurn === 'team2'}
              />
            </Col>
          </Row>
          {showCoinFlip && <CoinFlip isVisible={showCoinFlip} result={coinFace} />}
        </>
      )}
    </Container>
  );
}

export default App;