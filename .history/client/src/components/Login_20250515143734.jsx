import React, { useState } from 'react';
import { Container, Form, Button, Alert } from 'react-bootstrap';
import axios from 'axios';

const API_URL = 'http://localhost:5000/api/session';

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      console.log('Attempting login with username:', username);
      const response = await axios.post(`${API_URL}/login`, { username, password }); // Dòng 14
      const { token, role } = response.data;
      localStorage.setItem('token', token);
      setError('');
      console.log('Login successful, role:', role);
      onLogin(role);
    } catch (error) {
      console.error('Login error:', error.response?.data, 'Status:', error.response?.status); // Dòng 23
      if (error.response?.status === 401) {
        setError('Tên người dùng hoặc mật khẩu không đúng');
      } else {
        setError(error.response?.data?.message || 'Lỗi khi đăng nhập');
      }
    }
  };

  return (
    <Container className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
      <Form onSubmit={handleLogin} style={{ width: '300px' }}>
        <h3 className="text-center mb-4">Đăng nhập</h3>
        {error && (
          <Alert variant="danger" onClose={() => setError('')} dismissible>
            {error}
          </Alert>
        )}
        <Form.Group className="mb-3" controlId="username">
          <Form.Label>Tên người dùng</Form.Label>
          <Form.Control
            type="text"
            placeholder="Nhập tên người dùng"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </Form.Group>
        <Form.Group className="mb-3" controlId="password">
          <Form.Label>Mật khẩu</Form.Label>
          <Form.Control
            type="password"
            placeholder="Nhập mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Form.Group>
        <Button variant="primary" type="submit" className="w-100">
          Đăng nhập
        </Button>
      </Form>
    </Container>
  );
}

export default Login;