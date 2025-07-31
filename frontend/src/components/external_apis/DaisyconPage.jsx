import React, { useState, useEffect } from 'react';
import { Container, Form, Button, Alert, Modal } from 'react-bootstrap';
import { useAuth } from '../../contexts/AuthContext';
import config from '../../config';

const DaisyconPage = ({ onBack }) => {
  const [selectedUser, setSelectedUser] = useState('470777');
  const [codeVerifier, setCodeVerifier] = useState('');
  const [codeChallenge, setCodeChallenge] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [clientID, setClientID] = useState('');
  const [userID, setUserID] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [token, setToken] = useState('');
  const [resultTitle, setResultTitle] = useState('');
  const [resultContainer, setResultContainer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [media, setMedia] = useState([]);
  const { token: authToken } = useAuth();

  const redirectURI = 'https://valuemediartb.github.io/public/external_apis/daisycon/auth.html';

  useEffect(() => {
    initializeCodes();
    const savedAccessToken = sessionStorage.getItem('access_token');
    const savedRefreshToken = sessionStorage.getItem('refresh_token');
    
    if (savedAccessToken && savedAccessToken !== "undefined" && savedRefreshToken && savedRefreshToken !== "undefined") {
      setAccessToken(savedAccessToken);
      setRefreshToken(savedRefreshToken);
      loadMedia();
    }
  }, []);

  const generateRandomString = (length) => {
    let randomString = '';
    let allowedChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let charNumber = 0; charNumber < length; ++charNumber) {
      randomString += allowedChars.charAt(Math.floor(Math.random() * allowedChars.length));
    }
    return randomString;
  };

  const getRandomInt = (min, max) => {
    return Math.floor(Math.random() * (max - min) + min);
  };

  const generateCodeChallenge = async (codeVerifier) => {
    let digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  };

  const initializeCodes = async () => {
    const newCodeVerifier = generateRandomString(getRandomInt(43, 128));
    setCodeVerifier(newCodeVerifier);
    sessionStorage.setItem('codeVerifier', newCodeVerifier);
    
    const newCodeChallenge = await generateCodeChallenge(newCodeVerifier);
    setCodeChallenge(newCodeChallenge);
    sessionStorage.setItem('codeChallenge', newCodeChallenge);
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

  const authorizeDaisycon = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${config.serverURL}/export`, {
        method: 'POST',
        body: JSON.stringify({
          commands: [
            { commandName: "daisyconClientID" },
            { user: selectedUser }
          ]
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        console.error("In authorizeDaisycon(): received error response from server");
        setResultTitle("authorizeDaisycon failed! Received response " + response.status);
      } else {
        const respJson = await response.json();
        console.log(respJson);
        const newClientID = respJson.ID;
        setClientID(newClientID);
        setUserID(selectedUser);
        sessionStorage.setItem('userID', selectedUser);
        sessionStorage.setItem('clientID', newClientID);

        const authorizeUrl = new URL('https://login.daisycon.com/oauth/authorize');
        authorizeUrl.searchParams.append('response_type', 'code');
        authorizeUrl.searchParams.append('client_id', newClientID);
        authorizeUrl.searchParams.append('redirect_uri', redirectURI);
        authorizeUrl.searchParams.append('code_challenge', codeChallenge);

        window.open(authorizeUrl.toString(), '_blank');
        setShowAuthModal(true);
      }
    } catch (error) {
      console.error('Error:', error);
      setResultTitle("Error occurred: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const accessDaisycon = async () => {
    if (!token || token === "undefined") {
      alert('Token is missing!');
      return;
    }

    setIsLoading(true);
    const accessUrl = 'https://login.daisycon.com/oauth/access-token';
    const formData = {
      'grant_type': 'authorization_code',
      'code': token,
      'client_id': clientID,
      'client_secret': '',
      'redirect_uri': redirectURI,
      'code_verifier': codeVerifier
    };

    try {
      const response = await fetch(`${config.serverURL}/proxy`, {
        method: 'POST',
        body: JSON.stringify({
          targetUrl: accessUrl,
          body: formData,
          headers: { 'Content-Type': 'application/json' },
          method: "POST"
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      const data = await response.json();
      setResultTitle("Authentication successful!");
      setAccessToken(data.access_token);
      setRefreshToken(data.refresh_token);
      sessionStorage.setItem('access_token', data.access_token);
      sessionStorage.setItem('refresh_token', data.refresh_token);
      setShowAuthModal(false);
      loadMedia();
      console.log('Success:', data);
    } catch (error) {
      console.error('Error:', error);
      setResultTitle("Error occurred: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMedia = async () => {
    // Load media for dropdowns
    try {
      const response = await fetch(`${config.serverURL}/proxy`, {
        method: 'POST',
        body: JSON.stringify({
          targetUrl: `https://services.daisycon.com/publishers/${selectedUser}/media`,
          headers: { 
            'accept': 'application/json',
            'Authorization': 'Bearer ' + accessToken 
          },
          method: "GET"
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setMedia(data);
      }
    } catch (error) {
      console.error('Error loading media:', error);
    }
  };

  const exportOffers = async () => {
    if (!accessToken || accessToken === "undefined") {
      alert('In exportOffers(): Access token is missing!');
      return;
    }

    setIsLoading(true);
    setResultTitle("Sent exportOffers request to server, waiting for response...");
    setResultContainer("");

    try {
      const response = await fetch(`${config.serverURL}/export`, {
        method: 'POST',
        body: JSON.stringify({
          commands: [
            { commandName: "daisyconOffers" },
            {
              user: userID,
              commandName: "getMedia",
              targetUrl: `https://services.daisycon.com/publishers/${userID}/media`,
              headers: { 
                'accept': 'application/json',
                'Authorization': 'Bearer ' + accessToken 
              },
              method: "GET"
            },
            {
              commandName: "getProducts",
              targetUrl: `https://services.daisycon.com/publishers/${userID}/programs`,
              headers: { 
                'accept': 'application/json',
                'Authorization': 'Bearer ' + accessToken 
              },
              method: "GET"
            }
          ]
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        console.error("In exportOffers(): received error response from server");
        setResultTitle("exportOffers failed! Received response " + response.status);
        setResultContainer("");
      } else {
        const data = await response.json();
        setResultTitle("Export offers successful!");
        setResultContainer("Downloading daisyconOffers.csv...");
        downloadCSV(data.result, 'daisyconOffers.csv');
        setTimeout(() => setResultContainer(""), 2000);
        console.log('exportOffers() success:', data);
      }
    } catch (error) {
      console.error('Error:', error);
      setResultTitle("Error occurred: " + error.message);
      setResultContainer("");
    } finally {
      setIsLoading(false);
    }
  };

  const subscribeAllPrograms = async () => {
    if (!accessToken || accessToken === "undefined") {
      alert('In subscribeAllPrograms(): Access token is missing!');
      return;
    }

    setIsLoading(true);
    setResultTitle("Sent subscribeAllPrograms request to server, waiting for response...");
    setResultContainer("This may take a few minutes.");

    try {
      const response = await fetch(`${config.serverURL}/update`, {
        method: 'POST',
        body: JSON.stringify({
          commands: [
            { commandName: "daisyconUpdate" },
            {
              commandName: "subscribeAllPrograms",
              body: { "publisherID": userID },
              headers: { 
                'Content-Type': 'application/json',
                'accept': 'application/json',
                'Authorization': 'Bearer ' + accessToken 
              },
              method: "POST"
            }
          ]
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("In subscribeAllPrograms(): received error response from server");
        if (JSON.stringify(errorData).toLowerCase().includes("expired token")) {
          setResultTitle("Token expired! Please refresh token");
        } else {
          setResultTitle("subscribeAllPrograms failed! Received response: " + JSON.stringify(errorData));
        }
        setResultContainer("");
      } else {
        const data = await response.json();
        setResultTitle("Subscribe to all programs successful!");
        setResultContainer(JSON.stringify(data));
        console.log('subscribeAllPrograms() success. Downloading logs...');
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
        <h3 style={{ margin: '8px' }}>Daisycon API</h3>
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
          {codeVerifier && (
            <div style={{ gridColumn: '1 / span 2', marginBottom: '8px' }}>
              Code verifier: {codeVerifier}
            </div>
          )}
          
          <Form.Label style={{ gridRow: '1' }}>Select user</Form.Label>
          <Form.Select 
            style={{ gridRow: '1', width: '250px' }}
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            required
          >
            <option value="470777">Netcraft</option>
            <option value="470838">Alphaads</option>
            <option value="470796">Trai</option>
          </Form.Select>
        </div>

        <div style={{ margin: '8px' }}>
          {!accessToken ? (
            <Button 
              variant="primary"
              onClick={authorizeDaisycon}
              disabled={isLoading}
              style={{ margin: '8px' }}
            >
              {isLoading ? 'Loading...' : 'Authorize Daisycon'}
            </Button>
          ) : (
            <>
              <Button 
                variant="success"
                onClick={exportOffers}
                disabled={isLoading}
                style={{ margin: '8px' }}
              >
                {isLoading ? 'Loading...' : 'Export Offers'}
              </Button>
              <Button 
                variant="secondary"
                onClick={subscribeAllPrograms}
                disabled={isLoading}
                style={{ margin: '8px' }}
              >
                {isLoading ? 'Loading...' : 'Subscribe to all programs'}
              </Button>
            </>
          )}
        </div>
      </Form>

      {/* Auth Modal */}
      <Modal show={showAuthModal} onHide={() => setShowAuthModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Complete Authorization</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Please complete the authorization in the opened window, then paste the authorization code below:</p>
          <Form.Group className="mb-3">
            <Form.Label>Authorization Code</Form.Label>
            <Form.Control
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste authorization code here"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAuthModal(false)}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={accessDaisycon}
            disabled={!token || isLoading}
          >
            {isLoading ? 'Loading...' : 'Complete Authorization'}
          </Button>
        </Modal.Footer>
      </Modal>

      {resultTitle && (
        <div style={{ margin: '8px', overflowWrap: 'break-word', wordBreak: 'break-all' }}>
          <Alert variant={resultTitle.includes('failed') || resultTitle.includes('Error') ? 'danger' : 'info'}>
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

export default DaisyconPage;