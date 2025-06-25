import React from 'react';
import { Button, ButtonGroup } from 'react-bootstrap';
import { fetchTableData } from '../api';

const NavigationBar = () => {
  const handleResetCache = async () => {
    try {
      // Call with "reset_cache" and current date
      const result = await fetchTableData("reset_cache", new Date());
      console.log('Reset cache result:', result);
      // You can add more logic here if needed (e.g., refresh UI)
    } catch (error) {
      console.error('Error resetting cache:', error);
    }
  };

  return (
    <nav className="bg-dark text-white p-1 px-2 d-flex justify-content-between align-items-center">
      {/* Left side buttons */}
      <ButtonGroup className="me-2" style={{ gap: '8px' }}>
        <a href="/public" size="sm" style={{color:'white'}}>
          <i className="bi bi-arrow-left"></i> <span style={{fontSize:16}}>Back</span>
        </a>
        <a href="#" variant="outline-light" size="sm" style={{color:'white'}} onClick={handleResetCache}>
          <i className="bi bi-arrow-counterclockwise"></i> <span style={{fontSize:16}}>Reset cache</span>
        </a>
      </ButtonGroup>

      {/* Center logo */}
      <div className="d-flex align-items-center justify-content-center flex-grow-1">
        <div className="d-flex align-items-center" style={{ 
          fontFamily: 'Arial, sans-serif',
          fontSize: '24px',
          fontWeight: 'bold',
          color: '#fff',
          textShadow: '0 2px 4px rgba(0,0,0,0.3)'
        }}>
          {/* Ad Traffic icon - funnel with data flow */}
          <div style={{
            width: '32px',
            height: '32px',
            marginRight: '4px',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {/* Funnel shape representing ad traffic conversion */}
            <div style={{
              width: '0',
              height: '0',
              borderLeft: '12px solid transparent',
              borderRight: '12px solid transparent',
              borderTop: '20px solid #4a5568',
              position: 'relative',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
            }}>
              {/* Top section - impressions (red) */}
              <div style={{
                position: 'absolute',
                top: '-18px',
                left: '-10px',
                width: '20px',
                height: '4px',
                background: 'linear-gradient(90deg, #f56565, #e53e3e)',
                borderRadius: '2px',
                boxShadow: '0 0 6px rgba(245, 101, 101, 0.4)'
              }}></div>
              
              {/* Middle section - clicks (orange) */}
              <div style={{
                position: 'absolute',
                top: '-12px',
                left: '-7px',
                width: '14px',
                height: '3px',
                background: 'linear-gradient(90deg, #fbb040, #ed8936)',
                borderRadius: '2px',
                boxShadow: '0 0 6px rgba(251, 176, 64, 0.4)'
              }}></div>
              
              {/* Bottom section - conversions (green) */}
              <div style={{
                position: 'absolute',
                top: '-6px',
                left: '-4px',
                width: '8px',
                height: '2px',
                background: 'linear-gradient(90deg, #48bb78, #38a169)',
                borderRadius: '2px',
                boxShadow: '0 0 6px rgba(72, 187, 120, 0.4)'
              }}></div>
            </div>
          </div>

          {/* App name with styling */}
          <span style={{
            background: 'linear-gradient(45deg, #63b3ed, #4299e1)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '0.5px'
          }}>
            Traffic
          </span>
          <span style={{
            background: 'linear-gradient(45deg, #68d391, #48bb78)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '0.5px',
            marginLeft: '2px'
          }}>
            Tools
          </span>
        </div>
      </div>

      {/* Right side spacer to balance the layout */}
      <div style={{ width: '140px' }}></div>
    </nav>
  );
};

export default NavigationBar;