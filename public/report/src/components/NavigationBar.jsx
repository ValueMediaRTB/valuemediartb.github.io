import React, { useState } from 'react';
import { Button, ButtonGroup, Modal, Form, Alert } from 'react-bootstrap';
import { fetchTableData } from '../api';

const NavigationBar = ({ currentDateRange, onBudgetCheckerToggle, onTrackerStatsView, currentView }) => {
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // You can change this password to whatever you want
  const RESET_PASSWORD = 'binomdbrefresh2025'; // Change this to your desired password

  const handleResetCache = async () => {
    try {
      const isConfirmed = window.confirm(
      'This action will clear all cached data and may cause temporary slower performance while data reloads. Do you want to continue?'
      );
      if (!isConfirmed) {
        return; // User cancelled, don't proceed
      }
      // Call with "reset_cache" and current date
      const result = await fetchTableData("reset_cache", new Date());
      console.log('Reset cache result:', result);
      // You can add more logic here if needed (e.g., refresh UI)
    } catch (error) {
      console.error('Error resetting cache:', error);
    }
  };

  const handleResetDBClick = () => {
    // Show the password modal instead of window.confirm
    setShowPasswordModal(true);
    setPassword('');
    setPasswordError('');
  };

  const handlePasswordSubmit = async () => {
    // Validate password
    if (password !== RESET_PASSWORD) {
      setPasswordError('Incorrect password. Please try again.');
      return;
    }

    // Show final confirmation
    const isConfirmed = window.confirm(
      'This action will clear the database, and the current data will be lost forever. Are you sure you want to continue?'
    );
    
    if (!isConfirmed) {
      setShowPasswordModal(false);
      return;
    }

    setIsResetting(true);
    try {
      // Use the current date range from props
      const result = await fetchTableData("reset_db", currentDateRange);
      console.log('Reset DB result:', result);
      setShowPasswordModal(false);
      setPassword('');
      // You can add more logic here if needed (e.g., refresh UI, show success message)
    } catch (error) {
      console.error('Error resetting DB:', error);
      setPasswordError('Error occurred while resetting database. Please try again.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleModalClose = () => {
    if (!isResetting) {
      setShowPasswordModal(false);
      setPassword('');
      setPasswordError('');
    }
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    if (passwordError) {
      setPasswordError(''); // Clear error when user starts typing
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && password.trim() && !isResetting) {
      handlePasswordSubmit();
    }
  };

  const handleTrackerStats = () => {
    // Navigate to Tracker Stats view
    if (onTrackerStatsView) {
      onTrackerStatsView();
    }
  };

  const handleBudgetChecker = () => {
    // Navigate to Budget Checker view
    if (onBudgetCheckerToggle) {
      onBudgetCheckerToggle();
    }
  };

  return (
    <>
      <nav className="bg-dark text-white p-1 px-2 d-flex justify-content-between align-items-center">
        {/* Left side buttons */}
        <ButtonGroup className="me-2" style={{ gap: '8px' }}>
          <a href="/public" size="sm" style={{color:'white'}}>
            <i className="bi bi-arrow-left"></i> <span style={{fontSize:16}}>Back</span>
          </a>
          <a href="#" variant="outline-light" size="sm" style={{color:'white',marginLeft:'16px'}} onClick={handleResetCache}>
            <i className="bi bi-arrow-counterclockwise"></i> <span style={{fontSize:16}}>Reset cache</span>
          </a>
          <a href="#" variant="outline-light" size="sm" style={{color:'white',marginLeft:'16px'}} onClick={handleResetDBClick}>
            <i className="bi bi-arrow-counterclockwise"></i> <span style={{fontSize:16}}>Reset database</span>
          </a>
        </ButtonGroup>

        {/* Center logo */}
        <div className="d-flex align-items-center justify-content-center flex-grow-1">
          <div className="d-flex align-items-center" style={{ 
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontSize: '22px',
            fontWeight: '600',
            marginRight:'90px',
            color: '#fff'
          }}>
            {/* Modern analytics icon */}
            <div style={{
              width: '36px',
              height: '30px',
              marginRight: '12px',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
            }}>
              {/* Traffic flow bars - representing analytics data */}
              <div style={{
                display: 'flex',
                alignItems: 'end',
                gap: '2px',
                height: '18px'
              }}>
                {/* Bar 1 - shortest */}
                <div style={{
                  width: '3px',
                  height: '8px',
                  background: 'rgba(255, 255, 255, 0.9)',
                  borderRadius: '1px'
                }}></div>
                {/* Bar 2 - medium */}
                <div style={{
                  width: '3px',
                  height: '12px',
                  background: 'rgba(255, 255, 255, 0.9)',
                  borderRadius: '1px'
                }}></div>
                {/* Bar 3 - tallest */}
                <div style={{
                  width: '3px',
                  height: '16px',
                  background: 'rgba(255, 255, 255, 0.9)',
                  borderRadius: '1px'
                }}></div>
                {/* Bar 4 - medium */}
                <div style={{
                  width: '3px',
                  height: '10px',
                  background: 'rgba(255, 255, 255, 0.9)',
                  borderRadius: '1px'
                }}></div>
                {/* Bar 5 - tall */}
                <div style={{
                  width: '3px',
                  height: '14px',
                  background: 'rgba(255, 255, 255, 0.9)',
                  borderRadius: '1px'
                }}></div>
              </div>
              
              {/* Small indicator dot */}
              <div style={{
                position: 'absolute',
                top: '3px',
                right: '6px',
                width: '4px',
                height: '4px',
                background: '#26de81',
                borderRadius: '50%',
                boxShadow: '0 0 4px rgba(38, 222, 129, 0.6)'
              }}></div>
            </div>

            {/* App name */}
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span style={{ 
                color: '#ffffff',
                letterSpacing: '-0.02em'
              }}>
                Traffic
              </span>
              <span style={{ 
                color: '#667eea',
                marginLeft: '4px',
                letterSpacing: '-0.02em'
              }}>
                Tools
              </span>
            </div>
          </div>
        </div>

        {/* Right side buttons */}
        <ButtonGroup style={{ gap: '8px' }}>
          <Button 
            variant={currentView === 'tracker' ? 'light' : 'outline-light'}
            size="md" 
            onClick={handleTrackerStats}
            style={{ whiteSpace: 'nowrap' }}
          >
            <i className="bi bi-bar-chart"></i> Tracker stats
          </Button>
          <Button 
            variant={currentView === 'budget' ? 'light' : 'outline-light'}
            size="md" 
            onClick={handleBudgetChecker}
            style={{ whiteSpace: 'nowrap' }}
          >
            <i className="bi bi-currency-dollar"></i> Budget checker
          </Button>
        </ButtonGroup>
      </nav>

      {/* Password Modal */}
      <Modal 
        show={showPasswordModal} 
        onHide={handleModalClose}
        backdrop={isResetting ? 'static' : true}
        keyboard={!isResetting}
        centered
      >
        <Modal.Header closeButton={!isResetting}>
          <Modal.Title className="text-danger">
            <i className="bi bi-exclamation-triangle-fill"></i>
            Database Reset Authorization
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="warning" className="mb-3">
            <i className="bi bi-exclamation-triangle"></i>
            <strong>Warning:</strong> This action will permanently delete all database data and cannot be undone.
          </Alert>
          
          <Form.Group>
            <Form.Label className="fw-bold ms-1">
              Enter password to authorize database reset:
            </Form.Label>
            <Form.Control
              type="password"
              value={password}
              onChange={handlePasswordChange}
              onKeyPress={handleKeyPress}
              placeholder="Enter password"
              disabled={isResetting}
              autoFocus
              className={passwordError ? 'is-invalid' : ''}
            />
            {passwordError && (
              <div className="invalid-feedback">
                {passwordError}
              </div>
            )}
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button 
            variant="secondary" 
            onClick={handleModalClose}
            disabled={isResetting}
          >
            Cancel
          </Button>
          <Button 
            variant="danger" 
            onClick={handlePasswordSubmit}
            disabled={!password.trim() || isResetting}
          >
            {isResetting ? (
              <>
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                Resetting Database...
              </>
            ) : (
              <>
                <i className="bi bi-trash-fill"></i>
                Reset Database
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default NavigationBar;