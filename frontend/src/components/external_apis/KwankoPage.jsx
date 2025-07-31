import React, { useState, useEffect } from 'react';
import { Container, Form, Button, Alert } from 'react-bootstrap';
import { useAuth } from '../../contexts/AuthContext';
import {config} from '../../config';

// KwankoPage.jsx
const KwankoPage = ({ onBack }) => {
  const [kwankoToken, setKwankoToken] = useState('');
  const [resultTitle, setResultTitle] = useState('');
  const [resultContainer, setResultContainer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { token } = useAuth();

  useEffect(() => {
    const savedKwankoToken = sessionStorage.getItem('kwankoToken');
    
    if (savedKwankoToken && savedKwankoToken !== "undefined") {
      setKwankoToken(savedKwankoToken);
    }
  }, []);

  const validateInput = () => {
    if (!kwankoToken || kwankoToken === "undefined" || kwankoToken === "") {
      return false;
    }
    sessionStorage.setItem('kwankoToken', kwankoToken);
    return true;
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
      alert('In kwanko/exportOffers(): API token is required!');
      return;
    }

    setIsLoading(true);
    setResultTitle("Sent exportOffers request to server, waiting for response...");

    try {
      const response = await fetch(`${config.serverURL}/export`, {
        method: 'POST',
        body: JSON.stringify({
          commands: [
            { commandName: "kwankoOffers" },
            {
              commandName: "getCampaigns",
              targetUrl: `https://api.kwanko.com/publishers/ads?ad_types=deeplink`,
              headers: { 'Authorization': 'Bearer ' + kwankoToken },
              method: "GET",
              body: {}
            }
          ]
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.error("In kwanko/exportOffers(): received error response from server");
        setResultTitle("kwanko/exportOffers failed! Received response " + response.status);
      } else {
        const data = await response.json();
        setResultTitle("Export offers successful!");
        setResultContainer("Downloading kwankoOffers.csv...");
        downloadCSV(data.result, 'kwankoOffers.csv');
        setTimeout(() => setResultContainer(""), 2000);
        console.log('kwanko/exportOffers() success:', data);
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
        <h3 style={{ margin: '8px' }}>Kwanko API</h3>
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
          
          <Form.Label style={{ gridRow: '2' }}>API Token:</Form.Label>
          <Form.Control
            style={{ width: '250px', gridRow: '2' }}
            type="text"
            value={kwankoToken}
            onChange={(e) => setKwankoToken(e.target.value)}
            required
          />
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

export default KwankoPage;