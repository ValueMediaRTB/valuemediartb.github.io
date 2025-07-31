import React, { useState } from 'react';
import { Form, Button, Card, Alert, Container, Row, Col, Nav } from 'react-bootstrap';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      /*if (mode === 'register') {
        // Validate registration
        if (formData.password !== formData.confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }

        if (formData.password.length < 6) {
          setError('Password must be at least 6 characters long');
          setLoading(false);
          return;
        }

        const result = await register(formData.username, formData.email, formData.password);
        if (!result.success) {
          setError(result.error);
        }
      } else {*/
        // Login
        const result = await login(formData.username, formData.password);
        if (!result.success) {
          setError(result.error);
        }
      //}
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setFormData({
      username: '',
      email: '',
      password: '',
      confirmPassword: ''
    });
  };

  return (
    <Container className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
      <Row className="w-100">
        <Col md={6} lg={5} xl={4} className="mx-auto">
          <div className="text-center mb-4">
            <div className="d-flex align-items-center justify-content-center mb-3">
              <div style={{
                width: '48px',
                height: '48px',
                marginRight: '12px',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '10px',
                boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
              }}>{/* Small indicator dot */}
              <div style={{
                position: 'absolute',
                top: '9px',
                right: '7px',
                width: '5px',
                height: '5px',
                background: '#26de81',
                borderRadius: '50%',
                boxShadow: '0 0 4px rgba(38, 222, 129, 0.6)'
              }}></div>
                <div style={{
                  display: 'flex',
                  alignItems: 'end',
                  gap: '3px',
                  height: '24px'
                }}>
                  <div style={{ width: '4px', height: '10px', background: 'rgba(255, 255, 255, 0.9)', borderRadius: '2px' }}></div>
                  <div style={{ width: '4px', height: '16px', background: 'rgba(255, 255, 255, 0.9)', borderRadius: '2px' }}></div>
                  <div style={{ width: '4px', height: '20px', background: 'rgba(255, 255, 255, 0.9)', borderRadius: '2px' }}></div>
                  <div style={{ width: '4px', height: '14px', background: 'rgba(255, 255, 255, 0.9)', borderRadius: '2px' }}></div>
                  <div style={{ width: '4px', height: '18px', background: 'rgba(255, 255, 255, 0.9)', borderRadius: '2px' }}></div>
                </div>
              </div>
              <h2 className="mb-0" style={{ fontWeight: '600', color: '#333' }}>
                Traffic<span style={{ color: '#667eea' }}>Tools</span>
              </h2>
            </div>
          </div>

          <Card className="shadow">
            <Card.Body className="p-3">
              {/*<Nav variant="tabs" activeKey={mode} className="mb-4">
                <Nav.Item>
                  <Nav.Link eventKey="login" onClick={() => switchMode('login')}>
                    Login
                  </Nav.Link>
                </Nav.Item>
                <Nav.Item>
                  <Nav.Link eventKey="register" onClick={() => switchMode('register')}>
                    Register
                  </Nav.Link>
                </Nav.Item>
              </Nav>*/}

              {error && <Alert variant="danger" className="mb-3">{error}</Alert>}

              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label className="ms-1">Username</Form.Label>
                  <Form.Control
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    required
                    placeholder="Enter username"
                    autoComplete="username"
                  />
                </Form.Group>

                {/*mode === 'register' && (
                  <Form.Group className="mb-3">
                    <Form.Label>Email</Form.Label>
                    <Form.Control
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      placeholder="Enter email"
                      autoComplete="email"
                    />
                  </Form.Group>
                )*/}

                <Form.Group className="mb-3">
                  <Form.Label className="ms-1">Password</Form.Label>
                  <Form.Control
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    placeholder="Enter password"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                </Form.Group>

                {/*mode === 'register' && (
                  <Form.Group className="mb-4">
                    <Form.Label>Confirm Password</Form.Label>
                    <Form.Control
                      type="password"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      required
                      placeholder="Confirm password"
                      autoComplete="new-password"
                    />
                  </Form.Group>
                )*/}

                <Button
                  variant="primary"
                  type="submit"
                  disabled={loading}
                  className="w-100"
                  style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    border: 'none'
                  }}
                >
                  {loading ? 'Please wait...' : (mode === 'login' ? 'Login' : 'Register')}
                </Button>
              </Form>

              {/*mode === 'login' && (
                <div className="text-center mt-3">
                  <small className="text-muted">
                    Note: You can also enter your email in the username field
                  </small>
                </div>
              )*/}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Login;