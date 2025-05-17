import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Container, Row, Col, Button, Form, Alert } from 'react-bootstrap';
import UserPanelLeft from './components/UserPanelLeft';
import WeaponGrid from './components/WeaponGrid';
import Login from './components/Login';
import WeaponSelectionPanel from './components/WeaponSelectionPanel';
import Pusher from 'pusher-js';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/session';
const PUSHER_KEY = import.meta.env.VITE_PUSHER_KEY || '<your-pusher-key>';
const PUSHER_CLUSTER = import.meta.env.VITE_PUSHER_CLUSTER || '<your-pusher-cluster>';

const pusher = new Pusher(PUSHER_KEY, {
  cluster: PUSHER_CLUSTER,
  forceTLS: true,
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
  const [actionIndex, setActionIndex] = useState(0);
  const [showCoinFlip, setShowCoinFlip] = useState(false);
  const [coinFace, setCoinFace] = useState('heads');
  const [error, setError] = useState('');
  const [selectedWeapons, setSelectedWeapons] = useState([]);
  const [timer, setTimer] = useState(null);

  const fetchSessionData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const response = await axios.get(API_URL, { headers: { Authorization: `Bearer ${token}` } });
      const newData = response.data;
      setSessionData(prev => JSON.stringify(prev) !== JSON.stringify(newData) ? newData : prev);
      setCurrentAction(newData.actionType);
      setFlipResult(newData.firstTurn === 'team1' ? 'Player 1' : newData.firstTurn === 'team2' ? 'Player 2' : null);
      setStarted(!!newData.firstTurn && !newData.isCompleted);
      setLocked(newData.banCount > 0 && newData.pickCount > 0);
      if (!isInputSet && !locked) {
        setBanCount(newData.banCount || '');
        setPickCount(newData.pickCount || '');
      }
    } catch (error) {
      console.error('Error fetching session data:', error.response?.data || error.message);
      if (error.response?.status === 404) {
        setSessionData(null); setLocked(false); setStarted(false); setFlipResult(null); setCurrentAction(null); setError('Không có phiên hoạt động');
      } else if (error.response?.status === 403) {
        localStorage.removeItem('token'); setUser(null); setError('Phiên không hợp lệ');
      } else setError('Lỗi khi tải dữ liệu');
    }
  }, [isInputSet, locked]);

  useEffect(() => {
    if (user) {
      fetchSessionData();
      const interval = setInterval(fetchSessionData, 2000);
      return () => clearInterval(interval);
    }
  }, [user, fetchSessionData]);

  useEffect(() => {
    const channel = pusher.subscribe('banpick-channel');
    channel.bind('coinFlip', ({ firstTurn, coinFace }) => {
      console.log('coinFlip:', { firstTurn, coinFace });
      setShowCoinFlip(true);
      setTimeout(() => {
        setCoinFace(coinFace);
        setTimeout(() => {
          setFlipResult(firstTurn === 'team1' ? 'Player 1' : 'Player 2');
          setStarted(true); setCurrentAction('ban'); setShowCoinFlip(false);
        }, 500);
      }, 2000);
    });
    channel.bind('timerUpdate', ({ timeLeft, action, team }) => {
      console.log('timerUpdate:', { timeLeft, action, team });
      setTimer(timeLeft === null ? null : timeLeft);
    });
    channel.bind('autoSelect', ({ weaponId, action, team, session }) => {
      console.log('autoSelect:', { weaponId, action, team });
      setSessionData(session); setCurrentAction(session.actionType); setStarted(!session.isCompleted);
      setFlipResult(session.firstTurn === 'team1' ? 'Player 1' : session.firstTurn === 'team2' ? 'Player 2' : null);
      setError(`Hệ thống tự động ${action} ${weaponId} cho ${team === 'team1' ? 'Player 1' : 'Player 2'}`);
      setTimer(null);
    });
    channel.bind('sessionUpdate', (session) => {
      console.log('sessionUpdate:', session);
      setSessionData(session); setCurrentAction(session.actionType); setStarted(!session.isCompleted);
      setFlipResult(session.firstTurn === 'team1' ? 'Player 1' : session.firstTurn === 'team2' ? 'Player 2' : null);
      setLocked(session.banCount > 0 && session.pickCount > 0);
      if (!session.currentTurn) setTimer(null);
    });

    return () => channel.unbind_all();
  }, []);

  const handleLock = async () => {
    if (banCount > 0 && pickCount > 0) {
      setIsInputSet(true); setLocked(true);
      try {
        const token = localStorage.getItem('token');
        await axios.post(`${API_URL}/update`, { banCount, pickCount }, { headers: { Authorization: `Bearer ${token}` } });
        fetchSessionData();
      } catch (error) {
        console.error('Error updating session:', error.response?.data || error.message);
        setError(error.response?.data?.message || 'Lỗi khi lưu'); setLocked(false); setIsInputSet(false);
      }
    } else setError('Vui lòng nhập số lượt hợp lệ');
  };

  const handleUnlock = () => {
    setLocked(false); setIsInputSet(false); setBanCount(''); setPickCount(''); setError('');
  };

  const handlePrepare = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/ready`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setError('');
    } catch (error) {
      console.error('Error setting ready:', error.response?.data || error.message);
      setError(error.response?.data?.message || 'Lỗi khi chuẩn bị');
    }
  };

  const handleReady = async () => {
    if (user !== 'player1') return;
    const requiredWeapons = (parseInt(sessionData?.banCount) || 0) * 2 + (parseInt(sessionData?.pickCount) || 0) * 2;
    if (sessionData?.selectedWeapons?.length < requiredWeapons) {
      setError(`Chọn ít nhất ${requiredWeapons} súng`);
      return;
    }
    setError('');
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/coinflip`, { selectedWeapons: sessionData?.selectedWeapons }, { headers: { Authorization: `Bearer ${token}` } });
    } catch (error) {
      console.error('Error flipping coin:', error.response?.data || error.message);
      setError(error.response?.data?.message || 'Lỗi tung xu'); setShowCoinFlip(false);
    }
  };

  const handleReset = async () => {
    if (user === 'player1') {
      try {
        const token = localStorage.getItem('token');
        await axios.post(`${API_URL}/reset`, {}, { headers: { Authorization: `Bearer ${token}` } });
        setStarted(false); setFlipResult(null); setCurrentAction(null); setActionIndex(0); setShowCoinFlip(false);
        setLocked(false); setIsInputSet(false); setBanCount(''); setPickCount(''); setError(''); setSelectedWeapons([]);
        setTimer(null); fetchSessionData();
      } catch (error) {
        console.error('Error resetting:', error.response?.data || error.message);
        setError(error.response?.data?.message || 'Lỗi reset');
      }
    }
  };

  const handleUpdate = () => {
    fetchSessionData();
    const totalBans = parseInt(banCount) * 2;
    const totalPicks = parseInt(pickCount) * 2;
    const newActionIndex = actionIndex + 1;

    if (newActionIndex < totalBans) setCurrentAction('ban');
    else if (newActionIndex < totalBans + totalPicks) {
      setCurrentAction('pick');
      if (newActionIndex === totalBans) setSessionData(prev => ({ ...prev, currentTurn: prev.firstTurn }));
    } else setCurrentAction(null);
    setActionIndex(newActionIndex);
  };

  const handleWeaponSelect = async (weaponId) => {
    if (sessionData?.selectedWeapons?.includes(weaponId)) {
      setError('Súng đã chọn'); return;
    }
    const newSelectedWeapons = [...(sessionData?.selectedWeapons || []), weaponId];
    setSelectedWeapons(newSelectedWeapons);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/select`, { weaponId }, { headers: { Authorization: `Bearer ${token}` } });
      setError(''); fetchSessionData();
    } catch (error) {
      console.error('Error selecting:', error.response?.data || error.message);
      setError(error.response?.data?.message || 'Lỗi chọn súng'); setSelectedWeapons(sessionData?.selectedWeapons || []);
    }
  };

  const handleBanPick = async (weaponId, action) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/lockin`, { weaponId, action }, { headers: { Authorization: `Bearer ${token}` } });
      setError(''); fetchSessionData();
    } catch (error) {
      console.error(`Error ${action}:`, error.response?.data || error.message);
      setError(error.response?.data?.message || `Lỗi ${action}`);
    }
  };

  const handleLogin = (role) => { setUser(role); setError(''); };
  const handleLogout = () => {
    localStorage.removeItem('token');
    axios.post(`${API_URL}/logout`).catch(err => console.error('Logout error:', err));
    setUser(null); setBanCount(''); setPickCount(''); setLocked(false); setIsInputSet(false); setFlipResult(null);
    setStarted(false); setSessionData(null); setCurrentAction(null); setActionIndex(0); setShowCoinFlip(false);
    setError(''); setSelectedWeapons([]); setTimer(null);
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.get(`${API_URL}/verify`, { headers: { Authorization: `Bearer ${token}` } })
        .then(response => { setUser(response.data.role); fetchSessionData(); })
        .catch(error => { localStorage.removeItem('token'); setUser(null); setError('Phiên không hợp lệ'); });
    }
  }, [fetchSessionData]);

  const currentTurn = sessionData?.currentTurn === 'team1' ? 'team1' : sessionData?.currentTurn === 'team2' ? 'team2' : null;
  const isControlDisabled = started && !sessionData?.isCompleted;
  const requiredWeapons = (parseInt(sessionData?.banCount) || 0) * 2 + (parseInt(sessionData?.pickCount) || 0) * 2;
  const isWeaponsSelected = sessionData?.selectedWeapons?.length >= requiredWeapons && requiredWeapons > 0;
  const isReadyDisabled = user !== 'player1' || !isWeaponsSelected || isControlDisabled || !sessionData?.readyStatus?.player1Ready || !sessionData?.readyStatus?.player2Ready;

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <>
      <div className="header">
        <h2 className="ms-3">CS2 Weapon Ban/Pick Tool</h2>
        <div className="d-flex justify-content-between align-items-center px-3">
          <p>Đăng nhập với vai trò: {user === 'player1' ? 'Player 1 (Admin)' : 'Player 2'}</p>
          <Button variant="link" onClick={handleLogout} className="text-light">Đăng xuất</Button>
        </div>
      </div>
      <Container fluid className="p-0 main-content">
        {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}
        {user === 'player1' && (
          <Row className="align-items-center justify-content-center">
            <Col xs={12} className="p-3 text-center">
              <div className="control-panel">
                <div className="d-flex justify-content-center align-items-center flex-wrap gap-2">
                  <div className="me-2"><Form.Label>Số lượt ban</Form.Label><Form.Control type="number" value={banCount} onChange={e => { setBanCount(e.target.value); setIsInputSet(true); }} disabled={isControlDisabled} size="sm" /></div>
                  <div className="me-2"><Form.Label>Số lượt pick</Form.Label><Form.Control type="number" value={pickCount} onChange={e => { setPickCount(e.target.value); setIsInputSet(true); }} disabled={isControlDisabled} size="sm" /></div>
                  <Button onClick={handleLock} className="me-2 btn-sm btn-orange" disabled={isControlDisabled}>Khóa</Button>
                  <Button onClick={handleUnlock} className="btn-sm btn-orange" disabled={!locked || isControlDisabled}>Bỏ khóa</Button>
                </div>
              </div>
            </Col>
          </Row>
        )}

        <Row className="main-content">
          <Col xs={12} md={3} className="p-3">
            <div className="d-flex flex-column align-items-center">
              <UserPanelLeft label="Player 1" bans={sessionData?.banCount || banCount} picks={sessionData?.pickCount || pickCount} bannedWeapons={sessionData?.bans?.filter(b => b.team === 'team1') || []} pickedWeapons={sessionData?.picks?.filter(p => p.team === 'team1') || []} isCurrentTurn={currentTurn === 'team1'} />
              <div className="separator"></div>
              <UserPanelLeft label="Player 2" bans={sessionData?.banCount || banCount} picks={sessionData?.pickCount || pickCount} bannedWeapons={sessionData?.bans?.filter(b => b.team === 'team2') || []} pickedWeapons={sessionData?.picks?.filter(p => p.team === 'team2') || []} isCurrentTurn={currentTurn === 'team2'} />
            </div>
          </Col>
          <Col xs={12} md={6} className="p-3 weapon-grid">
            <div className="timer-display">{timer !== null && currentTurn && <h3>Thời gian còn lại: {timer}s ({currentTurn === 'team1' ? 'Player 1' : 'Player 2'} - {currentAction})</h3>}</div>
            <WeaponGrid currentTurn={currentTurn} onUpdate={handleUpdate} turnAction={currentAction} user={user} availableWeapons={sessionData?.selectedWeapons || selectedWeapons} onBanPick={handleBanPick} bans={sessionData?.bans || []} picks={sessionData?.picks || []} />
          </Col>
          <Col xs={12} md={3} className="p-3 d-flex flex-column align-items-center">
            <h5>Người chơi bắt đầu trước: {flipResult || 'Chưa xác định'}</h5>
            <h5>Lượt hiện tại: {currentTurn === 'team1' ? 'Player 1' : currentTurn === 'team2' ? 'Player 2' : 'Chưa bắt đầu'}</h5>
            <h5>Hành động: {currentAction || 'Chưa xác định'}</h5>
            {locked && isWeaponsSelected && (
              <div className="mt-3 ready-status">
                <h5>Trạng thái chuẩn bị:</h5>
                <p className={sessionData?.readyStatus?.player1Ready ? 'ready' : 'not-ready'}>Player 1: {sessionData?.readyStatus?.player1Ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</p>
                <p className={sessionData?.readyStatus?.player2Ready ? 'ready' : 'not-ready'}>Player 2: {sessionData?.readyStatus?.player2Ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</p>
                <Button onClick={handlePrepare} className="button-prepare btn-orange mb-2" disabled={isControlDisabled || (user === 'player1' && sessionData?.readyStatus?.player1Ready) || (user === 'player2' && sessionData?.readyStatus?.player2Ready)}>Chuẩn bị</Button>
              </div>
            )}
            {user === 'player1' && (
              <div className="mt-3">
                <Button onClick={handleReady} className="button-ready me-2 btn-orange" disabled={isReadyDisabled}>Ready</Button>
                <Button onClick={handleReset} className="button-reset btn-orange">Reset</Button>
              </div>
            )}
            {locked && isWeaponsSelected && sessionData?.readyStatus?.player1Ready && sessionData?.readyStatus?.player2Ready && (
              <Alert variant="success" className="mt-2">Cả hai đã sẵn sàng! Player 1 nhấn Ready.</Alert>
            )}
          </Col>
        </Row>

        {user === 'player1' && (
          <Row className="mt-3">
            <Col xs={12} className="p-3">
              <WeaponSelectionPanel onSelectWeapon={handleWeaponSelect} disabled={started && !sessionData?.isCompleted} />
            </Col>
          </Row>
        )}

        {showCoinFlip && (
          <div className="coin-flip-modal">
            <div className="coin-flip-content">
              <div className="coin" id="coin">
                <div className="coin-inner">
                  <img src="https://media.geeksforgeeks.org/wp-content/uploads/20231016151817/heads.png" alt="heads" className={`coin-face ${coinFace === 'heads' ? 'heads' : ''}`} />
                  <img src="https://media.geeksforgeeks.org/wp-content/uploads/20231016151806/tails.png" alt="tails" className={`coin-face ${coinFace === 'tails' ? 'tails' : ''}`} />
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