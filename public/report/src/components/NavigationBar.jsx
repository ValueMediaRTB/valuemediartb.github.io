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
    <nav className="bg-dark text-white p-1 px-2">
      <ButtonGroup className="me-2" style={{ gap: '8px' }}>
        <Button variant="outline-light" size="sm">
          <i className="bi bi-arrow-left"></i> <span style={{fontSize:16}}>Back</span>
        </Button>
        <Button variant="outline-light" size="sm" onClick={handleResetCache}>
          <i className="bi bi-arrow-counterclockwise"></i> <span style={{fontSize:16}}>Reset cache</span>
        </Button>
      </ButtonGroup>
    </nav>
  );
};

export default NavigationBar;
