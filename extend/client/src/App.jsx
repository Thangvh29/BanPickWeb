import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Container, Row, Col, Button, Form, Alert, ListGroup } from 'react-bootstrap';
import UserPanelLeft from './components/UserPanelLeft';
import WeaponGrid from './components/WeaponGrid';
import Login from './components/Login';
import Register from './components/Register';
import RoomSelection from './components/RoomSelection';
import WeaponSelectionPanel from './components/WeaponSelectionPanel';
import './index.css';

const API_URL = 'http://localhost:5000/api/rooms';

function App() {
  const [user, setUser] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [role, setRole] = useState(null);
  const [banCount, setBanCount] = useState('');
  const [pickCount, setPickCount] = useState('');
  const [isInputSet, setIsInputSet] = useState(false);
  const [locked, setLocked] = useState(false);
  const [flipResult, setFlipResult] = useState(null);
  const [started, setStarted] = useState(false);
  const [roomData, setRoomData] = useState(null);
  const [currentAction, setCurrentAction] = useState(null);
  const [actionIndex, setActionIndex] = useState(0);
  const [showCoinFlip, setShowCoinFlip] = useState(false);
  const [coinFace, setCoinFace] = useState('heads');
  const [error, setError] = useState('');
  const [selectedWeapons, setSelectedWeapons] = useState([]);
  const [showRegister, setShowRegister] = useState(false);

  const fetchRoomData = useCallback(async () => {
    if (roomCode) {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/${roomCode}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const newData = response.data;
        setRoomData(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(newData)) {
            return newData;
          }
          return prev;
        });
        setCurrentAction(newData.actionType);
        setFlipResult(newData.firstTurn === 'team1' ? 'Player 1' : newData.firstTurn === 'team2' ? 'Player 2' : null);
        setStarted(!!newData.firstTurn && !newData.isCompleted);
        if (!isInputSet && !locked) {
          setBanCount(newData.banCount || '');
          setPickCount(newData.pickCount || '');
        }
      } catch (error) {
        console.error('Error fetching room data:', error.response?.data || error.message);
        if (error.response?.status === 403) {
          localStorage.removeItem('token');
          setUser(null);
          setRoomCode(null);
          setRole(null);
        }
      }
    }
  }, [roomCode, isInputSet, locked]);

  useEffect(() => {
    if (roomCode) {
      fetchRoomData();
      const interval = setInterval(fetchRoomData, 2000);
      return () => clearInterval(interval);
    }
  }, [roomCode, fetchRoomData]);

  const handleLock = async () => {
    if (banCount > 0 && pickCount > 0) {
      setIsInputSet(true);
      setLocked(true);
      try {
        const token = localStorage.getItem('token');
        await axios.post(
          `${API_URL}/update`,
          { code: roomCode, banCount: parseInt(banCount), pickCount: parseInt(pickCount) },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (error) {
        setError(error.response?.data?.message || 'Lỗi khi lưu số lượt ban/pick');
        setLocked(false);
        setIsInputSet(false);
      }
    } else {
      setError('Vui lòng nhập số lượt ban và pick hợp lệ');
    }
  };

  const handleUnlock = () => {
    setLocked(false);
    setIsInputSet(false);
  };

  const handleReady = async () => {
    if (role !== 'player1') return;
    const requiredWeapons = (parseInt(banCount) || 0) * 2 + (parseInt(pickCount) || 0) * 2;
    if (selectedWeapons.length < requiredWeapons) {
      setError(`Vui lòng chọn ít nhất ${requiredWeapons} súng để bắt đầu`);
      return;
    }
    setError('');
    setShowCoinFlip(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/coinflip`,
        { code: roomCode, selectedWeapons },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const result = response.data.firstTurn === 'team1' ? 'Player 1' : 'Player 2';
      const face = response.data.firstTurn === 'team1' ? 'heads' : 'tails';
      setTimeout(() => {
        setCoinFace(face);
        setTimeout(() => {
          setFlipResult(result);
          setStarted(true);
          setCurrentAction('ban');
          setShowCoinFlip(false);
        }, 500);
      }, 1000);
    } catch (error) {
      setError(error.response?.data?.message || 'Lỗi khi tung đồng xu');
      setShowCoinFlip(false);
    }
  };

  const handleReset = async () => {
    if (role === 'player1') {
      try {
        const token = localStorage.getItem('token');
        await axios.post(
          `${API_URL}/reset`,
          { code: roomCode },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setStarted(false);
        setFlipResult(null);
        setCurrentAction(null);
        setActionIndex(0);
        setShowCoinFlip(false);
        setLocked(false);
        setIsInputSet(false);
        setBanCount('');
        setPickCount('');
        setError('');
        setSelectedWeapons([]);
        await fetchRoomData();
      } catch (error) {
        setError(error.response?.data?.message || 'Lỗi khi reset phòng');
      }
    }
  };

  const handleWeaponSelect = async (weaponId) => {
    if (selectedWeapons.includes(weaponId)) {
      setError('Súng này đã được chọn');
      return;
    }
    const newSelectedWeapons = [...selectedWeapons, weaponId];
    setSelectedWeapons(newSelectedWeapons);
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/select`,
        { code: roomCode, weaponId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setError('');
      await fetchRoomData();
    } catch (error) {
      setError(error.response?.data?.message || 'Lỗi khi chọn súng');
      setSelectedWeapons(selectedWeapons);
    }
  };

  const handleBanPick = async (weaponId, action) => {
    try {
      const token = localStorage.getItem('token');
      const endpoint = action === 'ban' ? 'ban' : 'pick';
      await axios.post(
        `${API_URL}/${endpoint}`,
        { code: roomCode, weaponId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setError('');
      await fetchRoomData();
    } catch (error) {
      setError(error.response?.data?.message || `Lỗi khi thực hiện ${action}`);
    }
  };

  const handleApprovePlayer = async (userId, approve) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/approve`,
        { code: roomCode, userId, approve },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setError('');
      await fetchRoomData();
    } catch (error) {
      setError(error.response?.data?.message || 'Lỗi khi duyệt người chơi');
    }
  };

  const handleLeaveRoom = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/leave`,
        { code: roomCode },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRoomCode(null);
      setRole(null);
      setRoomData(null);
      setBanCount('');
      setPickCount('');
      setLocked(false);
      setFlipResult(null);
      setStarted(false);
      setCurrentAction(null);
      setActionIndex(0);
      setShowCoinFlip(false);
      setError('');
      setSelectedWeapons([]);
    } catch (error) {
      setError(error.response?.data?.message || 'Lỗi khi rời phòng');
    }
  };

  const handleLogin = (username) => {
    setUser(username);
  };

  const handleRegister = (username) => {
    setUser(username);
    setShowRegister(false);
  };

  const handleJoinRoom = (code, assignedRole) => {
    setRoomCode(code);
    setRole(assignedRole);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    axios.post(`${API_URL}/leave`, { code: roomCode }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .catch(err => console.error('Leave room error:', err));
    setUser(null);
    setRoomCode(null);
    setRole(null);
    setRoomData(null);
    setBanCount('');
    setPickCount('');
    setLocked(false);
    setIsInputSet(false);
    setFlipResult(null);
    setStarted(false);
    setCurrentAction(null);
    setActionIndex(0);
    setShowCoinFlip(false);
    setError('');
    setSelectedWeapons([]);
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios
        .get(`${API_URL}/verify`, { headers: { Authorization: `Bearer ${token}` } })
        .then((response) => {
          setUser(response.data.username);
        })
        .catch((error) => {
          console.error('Token verification failed:', error.response?.data || error.message);
          localStorage.removeItem('token');
        });
    }
  }, []);

  const currentTurn = roomData?.currentTurn === 'team1' ? 'team1' : roomData?.currentTurn === 'team2' ? 'team2' : null;
  const isControlDisabled = started && !roomData?.isCompleted || locked;
  const requiredWeapons = (parseInt(banCount) || 0) * 2 + (parseInt(pickCount) || 0) * 2;
  const isReadyDisabled =
    !selectedWeapons.length ||
    (started && !roomData?.isCompleted) ||
    selectedWeapons.length < requiredWeapons ||
    isNaN(requiredWeapons) ||
    requiredWeapons <= 0 ||
    roomData?.players?.length < 2 ||
    !roomData?.players?.every(p => p.status === 'approved');

  if (!user) {
    return showRegister ? (
      <Register onRegister={handleRegister} onSwitchToLogin={() => setShowRegister(false)} />
    ) : (
      <Login onLogin={handleLogin} onSwitchToRegister={() => setShowRegister(true)} />
    );
  }

  if (!roomCode) {
    return <RoomSelection onJoinRoom={handleJoinRoom} username={user} />;
  }

  if (role === 'player2' && roomData?.players?.find(p => p.userId === user._id)?.status === 'pending') {
    return (
      <Container className="mt-5 text-center">
        <h2>Đang chờ duyệt</h2>
        <p>Vui lòng chờ player1 chấp nhận bạn vào phòng {roomCode}.</p>
        <Button variant="danger" onClick={handleLeaveRoom}>
          Rời phòng
        </Button>
      </Container>
    );
  }

  return (
    <>
      <div className="header">
        <h2 className="ms-3">CS2 Weapon Ban/Pick Tool - Phòng {roomCode}</h2>
        <div className="d-flex justify-content-between align-items-center px-3">
          <p>Đăng nhập với: {user} ({role === 'player1' ? 'Player 1 (Admin)' : 'Player 2'})</p>
          <div>
            <Button variant="link" onClick={handleLeaveRoom} className="text-light me-2">
              Rời phòng
            </Button>
            <Button variant="link" onClick={handleLogout} className="text-light">
              Đăng xuất
            </Button>
          </div>
        </div>
      </div>
      <Container fluid className="p-0 main-content">
        {error && (
          <Alert variant="danger" onClose={() => setError('')} dismissible>
            {error}
          </Alert>
        )}
        {role === 'player1' && roomData?.players?.some(p => p.status === 'pending') && (
          <Row className="justify-content-center">
            <Col xs={12} md={6} className="p-3">
              <h4>Yêu cầu tham gia</h4>
              <ListGroup>
                {roomData.players
                  .filter(p => p.status === 'pending')
                  .map(p => (
                    <ListGroup.Item key={p.userId} className="d-flex justify-content-between align-items-center">
                      <span>Người chơi: {p.userId}</span>
                      <div>
                        <Button
                          variant="success"
                          size="sm"
                          className="me-2"
                          onClick={() => handleApprovePlayer(p.userId, true)}
                        >
                          Chấp nhận
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleApprovePlayer(p.userId, false)}
                        >
                          Từ chối
                        </Button>
                      </div>
                    </ListGroup.Item>
                  ))}
              </ListGroup>
            </Col>
          </Row>
        )}
        {role === 'player1' && (
          <Row className="align-items-center justify-content-center">
            <Col xs={12} className="p-3 text-center">
              <div className="control-panel">
                <div className="d-flex justify-content-center align-items-center flex-wrap gap-2">
                  <div className="me-2">
                    <Form.Label>Số lượt ban</Form.Label>
                    <Form.Control
                      type="number"
                      value={banCount}
                      onChange={(e) => {
                        setBanCount(e.target.value);
                        setIsInputSet(true);
                      }}
                      disabled={isControlDisabled}
                      size="sm"
                    />
                  </div>
                  <div className="me-2">
                    <Form.Label>Số lượt pick</Form.Label>
                    <Form.Control
                      type="number"
                      value={pickCount}
                      onChange={(e) => {
                        setPickCount(e.target.value);
                        setIsInputSet(true);
                      }}
                      disabled={isControlDisabled}
                      size="sm"
                    />
                  </div>
                  <Button
                    onClick={handleLock}
                    className="me-2 btn-sm btn-orange"
                    disabled={locked || isControlDisabled}
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
                bans={roomData?.banCount || banCount}
                picks={roomData?.pickCount || pickCount}
                bannedWeapons={roomData?.bans?.filter(ban => ban.team === 'team1') || []}
                pickedWeapons={roomData?.picks?.filter(pick => pick.team === 'team1') || []}
                isCurrentTurn={currentTurn === 'team1'}
              />
              <div className="separator"></div>
              <UserPanelLeft
                label="Player 2"
                bans={roomData?.banCount || banCount}
                picks={roomData?.pickCount || pickCount}
                bannedWeapons={roomData?.bans?.filter(ban => ban.team === 'team2') || []}
                pickedWeapons={roomData?.picks?.filter(pick => pick.team === 'team2') || []}
                isCurrentTurn={currentTurn === 'team2'}
              />
            </div>
          </Col>
          <Col xs={12} md={6} className="p-3 weapon-grid">
            <WeaponGrid
              currentTurn={currentTurn}
              onUpdate={() => fetchRoomData()}
              turnAction={currentAction}
              user={role}
              availableWeapons={roomData?.selectedWeapons || selectedWeapons}
              onBanPick={handleBanPick}
              bans={roomData?.bans || []}
              picks={roomData?.picks || []}
            />
          </Col>
          <Col xs={12} md={3} className="p-3 d-flex flex-column align-items-center">
            <h5>Người chơi bắt đầu trước: {flipResult || 'Chưa xác định'}</h5>
            <h5>Lượt hiện tại: {currentTurn === 'team1' ? 'Player 1' : currentTurn === 'team2' ? 'Player 2' : 'Chưa bắt đầu'}</h5>
            <h5>Hành động: {currentAction || 'Chưa xác định'}</h5>
            <div className="mt-3">
              {role === 'player1' && (
                <>
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
                </>
              )}
            </div>
          </Col>
        </Row>

        {role === 'player1' && (
          <Row className="mt-3">
            <Col xs={12} className="p-3">
              <WeaponSelectionPanel
                onSelectWeapon={handleWeaponSelect}
                disabled={started && !roomData?.isCompleted}
              />
            </Col>
          </Row>
        )}

        {showCoinFlip && (
          <div className="coin-flip-modal">
            <div className="coin-flip-content">
              <div className="coin" id="coin">
                <img
                  src={
                    coinFace === 'heads'
                      ? 'https://media.geeksforgeeks.org/wp-content/uploads/20231016151817/heads.png'
                      : 'https://media.geeksforgeeks.org/wp-content/uploads/20231016151806/tails.png'
                  }
                  alt={coinFace}
                />
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