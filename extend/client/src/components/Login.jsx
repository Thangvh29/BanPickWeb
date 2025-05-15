import React, { useState } from 'react';
import { Form, Button, Container, Row, Col, Alert } from 'react-bootstrap';
import axios from 'axios';
import '../index.css';

const Login = ({ onLogin, onSwitchToRegister }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://localhost:5000/api/rooms/login', {
        username,
        password,
      });
      localStorage.setItem('token', response.data.token);
      onLogin(response.data.username);
    } catch (error) {
      setError(error.response?.data?.message || 'Đăng nhập thất bại!');
    }
  };

  return (
    <Container className="mt-5">
      <Row className="justify-content-md-center">
        <Col xs={12} md={6}>
          <h2 className="text-center mb-4">Đăng nhập</h2>
          {error && (
            <Alert variant="danger" onClose={() => setError('')} dismissible>
              {error}
            </Alert>
          )}
          <Form onSubmit={handleLogin}>
            <Form.Group className="mb-3">
              <Form.Label>Tên người dùng</Form.Label>
              <Form.Control
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nhập tên người dùng"
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Mật khẩu</Form.Label>
              <Form.Control
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                required
              />
            </Form.Group>
            <Button type="submit" className="btn-orange w-100">
              Đăng nhập
            </Button>
          </Form>
          <p className="text-center mt-3">
            Chưa có tài khoản?{' '}
            <Button variant="link" onClick={onSwitchToRegister}>
              Đăng ký
            </Button>
          </p>
        </Col>
      </Row>
    </Container>
  );
};

export default Login;