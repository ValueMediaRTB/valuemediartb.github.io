import React, { useState, useEffect } from 'react';
import { Container, Form, Button, Alert } from 'react-bootstrap';
import { useAuth } from '../../contexts/AuthContext';
import {config} from '../../config';

const AdPumpPage = ({ onBack }) => {
  const [selectedUser, setSelectedUser] = useState('compliancealphaads');
  const [resultTitle, setResultTitle] = useState('');
  const [resultContainer, setResultContainer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { token } = useAuth();

  const validateInput = () => {
    return true;
    /*if (!serverURL || serverURL === "undefined" || serverURL === "") {
      return false;
    }
    sessionStorage.setItem('serverURL', serverURL);
    return true;*/
  };

  const downloadCSV = (data, filename = 'data.csv') => {
    try {
      const csvContent = convertToCSV(data);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error) {
      console.error('Error generating CSV:', error);
      alert('Could not generate CSV file. See console for details.');
    }
  };

  const convertToCSV = (data) => {
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        throw new Error('Invalid JSON string provided');
      }
    }

    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
      const headers = Object.keys(data[0]);
      const headerRow = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',');
      
      const dataRows = data.map(obj => {
        return headers.map(header => {
          const value = obj[header];
          if (value && typeof value === 'object') {
            return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
          }
          return `"${String(value ?? '').replace(/"/g, '""')}"`;
        }).join(',');
      });
      
      return [headerRow, ...dataRows].join('\n');
    }

    throw new Error('Unsupported data format.');
  };

  const exportOffers = async () => {
    if (!validateInput()) {
      alert('In adPump/exportOffers(): Invalid input!');
      return;
    }

    setIsLoading(true);
    setResultTitle("Sent exportOffers request to server, waiting for response...");
    setResultContainer("This may take a couple of minutes.");

    try {
      const response = await fetch(`${config.serverURL}/export`, {
        method: 'POST',
        body: JSON.stringify({
          commands: [
            { commandName: "adPumpOffers" },
            { user: selectedUser }
          ]
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.error("In adPump/exportOffers(): received error response from server");
        setResultTitle("adPump/exportOffers failed! Received response " + response.status);
        setResultContainer("");
      } else {
        const data = await response.json();
        setResultTitle("Export offers successful for user " + selectedUser + " !");
        setResultContainer("Downloading adPumpOffers.csv...");
        downloadCSV(data, 'adPumpOffers.csv');
        setTimeout(() => setResultContainer(""), 2000);
        console.log('adPump/exportOffers() success:', data);
      }
    } catch (error) {
      console.error('Error:', error);
      setResultTitle("Error occurred: " + error.message);
      setResultContainer("");
    } finally {
      setIsLoading(false);
    }
  };

  const subscribeAll = async () => {
    if (!validateInput()) {
      alert('In adPump/subscribeAll(): Invalid input!');
      return;
    }

    setIsLoading(true);
    setResultTitle("Sent subscribeAll request to server, waiting for response...");
    setResultContainer("This may take a couple of minutes.");

    try {
      const response = await fetch(`${config.serverURL}/update`, {
        method: 'POST',
        body: JSON.stringify({
          commands: [
            { commandName: "adPumpSubscribeAll" },
            { user: selectedUser }
          ]
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.error("In adPump/subscribeAll(): received error response from server");
        setResultTitle("adPump/subscribeAll failed! Received response " + response.status);
        setResultContainer("");
      } else {
        const data = await response.json();
        console.log('adPump/subscribeAll() success:', data);
        setResultTitle("Subscribe to all offers successful for user " + selectedUser + " !");
        setResultContainer("Subscribed to: " + data.result.join(","));
      }
    } catch (error) {
      console.error('Error:', error);
      setResultTitle("Error occurred: " + error.message);
      setResultContainer("");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container fluid className="p-4">
      <div className="mb-4">
        <h3 style={{ margin: '8px' }}>AdPump API</h3>
        <Button 
          variant="outline-primary" 
          onClick={onBack}
          style={{ margin: '8px' }}
        >
          Back
        </Button>
      </div>

      <Form>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'auto 1fr', 
          alignItems: 'center', 
          margin: '8px', 
          gap: '8px' 
        }}>
          <Form.Label style={{ gridRow: '1' }}>Select user</Form.Label>
          <Form.Select 
            style={{ gridRow: '1', width: '250px' }}
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            required
          >
            <option value="affiliatetraimedia">affiliate@trai-media</option>
            <option value="compliancealphaads">compliance@alphaads-group.com</option>
            <option value="advertisersuccessnetcraft">Netcraft</option>
          </Form.Select>
        </div>

        <div style={{ margin: '8px' }}>
          <Button 
            variant="primary"
            onClick={exportOffers}
            disabled={isLoading}
            style={{ margin: '8px' }}
          >
            {isLoading ? 'Loading...' : 'Export Offers'}
          </Button>
          <Button 
            variant="secondary"
            onClick={subscribeAll}
            disabled={isLoading}
            style={{ margin: '8px' }}
          >
            {isLoading ? 'Loading...' : 'Subscribe to all offers'}
          </Button>
        </div>
      </Form>

      {resultTitle && (
        <div style={{ margin: '8px', overflowWrap: 'break-word', wordBreak: 'break-all' }}>
          <Alert variant={resultTitle.includes('failed') ? 'danger' : 'info'}>
            {resultTitle}
          </Alert>
        </div>
      )}

      {resultContainer && (
        <div style={{ margin: '8px', overflowWrap: 'break-word', wordBreak: 'break-all' }}>
          {resultContainer}
        </div>
      )}
    </Container>
  );
};

export default AdPumpPage;