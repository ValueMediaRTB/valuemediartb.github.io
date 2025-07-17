import React from 'react';
import { Button, ButtonGroup } from 'react-bootstrap';
import { fetchTableData } from '../api';

const NavigationBar = ({ currentDateRange, onBudgetCheckerToggle, onTrackerStatsView, currentView }) => {
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

  const handleResetDB = async () => {
    try {
      // Use the current date range from props
      const result = await fetchTableData("reset_db", currentDateRange);
      console.log('Reset DB result:', result);
      // You can add more logic here if needed (e.g., refresh UI)
    } catch (error) {
      console.error('Error resetting DB:', error);
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
    <nav className="bg-dark text-white p-1 px-2 d-flex justify-content-between align-items-center">
      {/* Left side buttons */}
      <ButtonGroup className="me-2" style={{ gap: '8px' }}>
        <a href="/public" size="sm" style={{color:'white'}}>
          <i className="bi bi-arrow-left"></i> <span style={{fontSize:16}}>Back</span>
        </a>
        <a href="#" variant="outline-light" size="sm" style={{color:'white',marginLeft:'16px'}} onClick={handleResetCache}>
          <i className="bi bi-arrow-counterclockwise"></i> <span style={{fontSize:16}}>Reset cache</span>
        </a>
        <a href="#" variant="outline-light" size="sm" style={{color:'white',marginLeft:'16px'}} onClick={handleResetDB}>
          <i className="bi bi-arrow-counterclockwise"></i> <span style={{fontSize:16}}>Reset database</span>
        </a>
      </ButtonGroup>

      {/* Center logo */}
      <div className="d-flex align-items-center justify-content-center flex-grow-1">
        <div className="d-flex align-items-center" style={{ 
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: '22px',
          fontWeight: '600',
          marginRight:'135px',
          color: '#fff'
        }}>
          {/* Modern analytics icon */}
          <div style={{
            width: '36px',
            height: '36px',
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
              top: '6px',
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
  );
};

export default NavigationBar;