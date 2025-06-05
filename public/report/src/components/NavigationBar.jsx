import React from 'react';
import { Button, ButtonGroup } from 'react-bootstrap';

const NavigationBar = () => (
  <nav className="bg-dark text-white p-1 px-2">
    <ButtonGroup className="me-2" style={{gap:'8px'}}>
      <Button variant="outline-light" size="sm">
        <i className="bi bi-arrow-left"></i> Back
      </Button>
      <Button variant="outline-light" size="sm">
        <i className="bi bi-arrow-counterclockwise"></i> Reset
      </Button>
    </ButtonGroup>
  </nav>
);

export default NavigationBar;