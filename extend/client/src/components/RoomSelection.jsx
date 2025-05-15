import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Button, ListGroup, Alert } from 'react-bootstrap';
import axios from 'axios';
import '../index.css';

const RoomSelection = ({ onJoinRoom, username }) => {
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState('');

  const fetchRooms = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/rooms/rooms', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setRooms(response.data);
    } catch (error) {
      setError(error.response?.data?.message || 'Lỗi khi lấy danh sách phòng');
    }
  };

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 5000); // Cập nhật mỗi 5s
    return () => clearInterval(interval);
  }, []);

  const handleJoin = async (code) => {
    try {
      const response = await axios.post(
        'http://localhost:5000/api/rooms/join',
        { code },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      onJoinRoom(code, response.data.role);
    } catch (error) {
      setError(error.response?.data?.message || 'Lỗi khi tham gia phòng');
    }
  };

  return (
    <Container className="mt-5">
      <Row className="justify-content-md-center">
        <Col xs={12} md={8}>
          <h2 className="text-center mb-4">Chọn phòng</h2>
          <p className="text-center">Đăng nhập với: {username}</p>
          {error && (
            <Alert variant="danger" onClose={() => setError('')} dismissible>
              {error}
            </Alert>
          )}
          <ListGroup>
            {rooms.map(room => (
              <ListGroup.Item key={room.code} className="d-flex justify-content-between align-items-center">
                <span>
                  Phòng {room.code} ({room.playerCount}/2 người)
                  {room.isFull && ' - Đầy'}
                </span>
                <Button
                  variant="orange"
                  onClick={() => handleJoin(room.code)}
                  disabled={room.isFull}
                >
                  Tham gia
                </Button>
              </ListGroup.Item>
            ))}
          </ListGroup>
        </Col>
      </Row>
    </Container>
  );
};

export default RoomSelection;