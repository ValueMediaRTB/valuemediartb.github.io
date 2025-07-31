
import {config} from '../../config';
import React, { useState, useEffect } from 'react';
import { Container, Form, Button, Alert } from 'react-bootstrap';
import { useAuth } from '../../contexts/AuthContext';

// TradeTrackerPage.jsx
const TradeTrackerPage = ({ onBack }) => {
  const [selectedUser, setSelectedUser] = useState('romeaa');
  const [resultTitle, setResultTitle] = useState('');
  const [resultContainer, setResultContainer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { token } = useAuth();

  const validateInput = () => {
    return true;
    /*
    if (!serverURL || serverURL === "undefined" || serverURL === "") {
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

  const downloadText = (data, filename = 'data.txt') => {
    const blob = new Blob([data], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => URL.revokeObjectURL(url), 100);
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
      alert('In TradeTracker/exportOffers(): Invalid input!');
      return;
    }

    setIsLoading(true);
    setResultTitle("Sent exportOffers request to server, waiting for response...");

    try {
      const response = await fetch(`${config.serverURL}/export`, {
        method: 'POST',
        body: JSON.stringify({
          commands: [
            { commandName: "tradeTrackerOffers" },
            { user: selectedUser }
          ]
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.error("In TradeTracker/exportOffers(): received error response from server");
        setResultTitle("TradeTracker/exportOffers failed! Received response " + response.status);
      } else {
        const data = await response.json();
        setResultTitle("Export offers successful!");
        setResultContainer("Downloading tradeTrackerOffers.csv...");
        downloadCSV(data.result, 'tradeTrackerOffers.csv');
        setTimeout(() => setResultContainer(""), 2000);
        console.log('TradeTracker/exportOffers() success:', data);
      }
    } catch (error) {
      console.error('Error:', error);
      setResultTitle("Error occurred: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const subscribeAll = async () => {
    if (!validateInput()) {
      alert('In TradeTracker/subscribeAll(): Invalid input!');
      return;
    }

    setIsLoading(true);
    setResultTitle("Sent subscribeAll request to server, waiting for response...");

    try {
      const response = await fetch(`${config.serverURL}/update`, {
        method: 'POST',
        body: JSON.stringify({
          commands: [
            { commandName: "tradeTrackerUpdate" },
            {
              commandName: "subscribeAll",
              user: selectedUser
            }
          ]
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.error("In TradeTracker/subscribeAll(): received error response from server");
        setResultTitle("TradeTracker/subscribeAll failed! Received response " + response.status);
      } else {
        const data = await response.json();
        setResultTitle("Subscribe to all campaigns successful!");
        let dataString = "";
        for (const [camp, sites] of Object.entries(data.result)) {
          dataString += `Campaign ${camp}, subscribed to sites ${sites}\n`;
        }
        setResultContainer(dataString.replace(/\n/g, '<br>'));
        downloadText(dataString, `tradeTrackerSubscribeLogs_${selectedUser}.txt`);
        console.log('TradeTracker/subscribeAll() success:', data);
      }
    } catch (error) {
      console.error('Error:', error);
      setResultTitle("Error occurred: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container fluid className="p-4">
      <div className="mb-4">
        <h3 style={{ margin: '8px' }}>TradeTracker API</h3>
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
            <option value="romeaa">romeaa</option>
            <option value="Tombowman">Tombowman</option>
            <option value="Trai">Trai</option>
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
            {isLoading ? 'Loading...' : 'Subscribe to all campaigns'}
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
        <div 
          style={{ margin: '8px', overflowWrap: 'break-word', wordBreak: 'break-all' }}
          dangerouslySetInnerHTML={{ __html: resultContainer }}
        />
      )}
    </Container>
  );
};

export default TradeTrackerPage;