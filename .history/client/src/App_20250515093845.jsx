import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Container, Row, Col, Button, Form, Alert } from 'react-bootstrap';
import UserPanelLeft from './components/UserPanelLeft';
import WeaponGrid from './components/WeaponGrid';
import CoinFlipPanel from './components/CoinFlipPanel';
import Login from './components/Login';
import WeaponSelectionPanel from './components/WeaponSelectionPanel';
import Pusher from 'pusher-js';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/session';
const PUSHER_KEY = import.meta.env.VITE_PUSHER_KEY;
const PUSHER_CLUSTER = import.meta.env.VITE_PUSHER_CLUSTER;

const pusher = new Pusher(PUSHER_KEY, {
  cluster: PUSHER_CLUSTER
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
      const response = await axios.get(`${API_URL}/verify`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSessionData(response.data);
      setCurrentAction(response.data.actionType);
      setFlipResult(response.data.firstTurn === 'team1' ? 'Player 1' : response.data.firstTurn === 'team2' ? 'Player 2' : null);
      setStarted(!!response.data.firstTurn && !response.data.isCompleted);
      setLocked(response.data.banCount > 0 && response.data.pickCount > 0);
      if (!isInputSet && !locked) {
        setBanCount(response.data.banCount || '');
        setPickCount(response.data.pickCount || '');
      }
    } catch (error) {
      console.error('Error fetching session:', error);
      setError('Lỗi tải dữ liệu phiên');
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
    const channel = pusher.subscribe('ban-pick-channel');
    channel.bind('coinFlip', ({ firstTurn, coinFace }) => {
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
    channel.bind('timerUpdate', ({ timeLeft, action, team }) => {
      setTimer(timeLeft === null ? null : timeLeft);
    });
    channel.bind('sessionUpdate', (session) => {
      setSessionData(session);
      setCurrentAction(session.actionType);
      setStarted(!session.isCompleted);
      setFlipResult(session.firstTurn === 'team1' ? 'Player 1' : session.firstTurn === 'team2' ? 'Player 2' : null);
      setLocked(session.banCount > 0 && session.pickCount > 0);
    });
    return () => {
      channel.unbind_all();
      channel.unsubscribe();
    };
  }, []);

  const handleLock = async () => {
    if (banCount > 0 && pickCount > 0) {
      setIsInputSet(true);
      setLocked(true);
      try {
        const token = localStorage.getItem('token');
        await axios.post(
          `${API_URL}/update`,
          { banCount: parseInt(banCount), pickCount: parseInt(pickCount) },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        await fetchSessionData();
      } catch (error) {
        setError('Lỗi lưu số lượt ban/pick');
        setLocked(false);
        setIsInputSet(false);
      }
    } else {
      setError('Nhập số lượt ban và pick hợp lệ');
    }
  };

  const handlePrepare = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/ready`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetch(`${API_URL}/pusher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'ban-pick-channel',
          event: 'sessionUpdate',
          data: { readyStatus: true }
        })
      });
      setError('');
    } catch (error) {
      setError('Lỗi xác nhận chuẩn bị');
    }
  };

  const handleReady = async () => {
    if (user !== 'player1') return;
    const requiredWeapons = (parseInt(sessionData?.banCount) || 0) * 2 + (parseInt(sessionData?.pickCount) || 0) * 2;
    if (sessionData?.selectedWeapons?.length < requiredWeapons) {
      setError(`Chọn ít nhất ${requiredWeapons} súng`);
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/coinflip`,
        { selectedWeapons: sessionData?.selectedWeapons },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetch(`${API_URL}/pusher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'ban-pick-channel',
          event: 'coinFlip',
          data: response.data
        })
      });
      setError('');
    } catch (error) {
      setError('Lỗi tung đồng xu');
    }
  };

  const handleLogin = (role) => {
    setUser(role);
    setError('');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setError('');
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.get(`${API_URL}/verify`, { headers: { Authorization: `Bearer ${token}` } })
        .then(response => {
          setUser(response.data.role);
          fetchSessionData();
        })
        .catch(() => {
          localStorage.removeItem('token');
          setUser(null);
          setError('Phiên không hợp lệ, đăng nhập lại');
        });
    }
  }, [fetchSessionData]);

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <Container fluid>
      <h2>CS2 Weapon Ban/Pick Tool</h2>
      <div>
        <p>Đăng nhập với vai trò: {user === 'player1' ? 'Player 1 (Admin)' : 'Player 2'}</p>
        <Button onClick={handleLogout}>Đăng xuất</Button>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      <Row>
        <Col xs={12} md={3}>
          <UserPanelLeft label="Player 1" />
          <UserPanelLeft label="Player 2" />
        </Col>
        <Col xs={12} md={6}>
          <WeaponGrid selectedWeapons={selectedWeapons} setSelectedWeapons={setSelectedWeapons} />
        </Col>
        <Col xs={12} md={3}>
          {!locked && (
            <Form>
              <Form.Group>
                <Form.Label>Số lượt ban</Form.Label>
                <Form.Control type="number" value={banCount} onChange={(e) => setBanCount(e.target.value)} />
              </Form.Group>
              <Form.Group>
                <Form.Label>Số lượt pick</Form.Label>
                <Form.Control type="number" value={pickCount} onChange={(e) => setPickCount(e.target.value)} />
              </Form.Group>
              <Button onClick={handleLock}>Khóa</Button>
            </Form>
          )}
          <Button onClick={handlePrepare}>Chuẩn bị</Button>
          {user === 'player1' && <Button onClick={handleReady}>Ready</Button>}
          {showCoinFlip && <CoinFlipPanel coinFace={coinFace} />}
          {flipResult && <p>Kết quả tung đồng xu: {flipResult}</p>}
          {timer !== null && <p>Thời gian còn lại: {timer} giây</p>}
        </Col>
      </Row>
    </Container>
  );
}

export default App;