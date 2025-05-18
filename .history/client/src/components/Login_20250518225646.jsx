import React, { useState } from 'react';
import { Form, Button, Alert, Container, Row, Col } from 'react-bootstrap';
import axios from 'axios';
import '../index.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/session';

const Login = ({ setUser, setError, fetchSessionData }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    setIsLoading(true);

    if (!username.trim() || !password) {
      setLocalError('Vui lòng nhập tên người dùng và mật khẩu');
      setIsLoading(false);
      return;
    }

    try {
      console.log(`[Login] Sending POST to ${API_URL}/login with username: ${username}`);
      const response = await axios.post(
        `${API_URL}/login`,
        { username, password },
        { timeout: 7000 } // Tăng timeout lên 7s cho Render
      );
      const { token, role } = response.data;

      if (!token || !role) {
        console.error('[Login] Invalid response:', response.data);
        setLocalError('Đăng nhập thất bại: Phản hồi server không hợp lệ');
        setIsLoading(false);
        return;
      }

      localStorage.setItem('token', token);
      console.log(`[Login] Token saved: ${token}, role: ${role}`);
      setUser(role);
      setError('');
      await fetchSessionData();
      console.log(`[Login] fetchSessionData called for ${username}`);
    } catch (error) {
      console.error('[Login] Error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
        setLocalError('Yêu cầu hết thời gian, kiểm tra kết nối mạng');
      } else if (!error.response) {
        setLocalError('Không kết nối được server, thử lại sau');
      } else if (error.response.status === 400) {
        setLocalError(error.response.data.message || 'Sai tên người dùng hoặc mật khẩu');
      } else if (error.response.status === 500) {
        setLocalError('Lỗi server, liên hệ quản trị viên');
      } else {
        setLocalError('Lỗi đăng nhập không xác định, thử lại');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container>
      <Row className="justify-content-md-center">
        <Col md={6}>
          <h2 className="text-center mb-4">Đăng nhập</h2>
          {localError && (
            <Alert variant="danger" onClose={() => setLocalError('')} dismissible>
              {localError}
            </Alert>
          )}
          <Form onSubmit={handleSubmit}>
            <Form.Group controlId="username" className="mb-3">
              <Form.Label>Tên người dùng</Form.Label>
              <Form.Control
                type="text"
                placeholder="Nhập tên người dùng"
                value={username}
                onChange={(e) => setUsername(e.target.value.trim())}
                disabled={isLoading}
                required
              />
            </Form.Group>
            <Form.Group controlId="password" className="mb-3">
              <Form.Label>Mật khẩu</Form.Label>
              <Form.Control
                type="password"
                placeholder="Nhập mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
              />
            </Form.Group>
            <Button variant="primary" type="submit" className="w-100" disabled={isLoading}>
              {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Button>
          </Form>
        </Col>
      </Row>
    </Container>
  );
};

export default Login;