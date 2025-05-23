const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const app = express();
const PORT = 3000;

// Rate limit: max 1 request per second per IP
const limiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 1,
  message: 'Too many requests - please wait 1 second',
});

app.use((req, res, next) => {
  console.log('Received request:', req.method, req.url);
  next();
});
// Enable CORS for all routes
app.use((req, res, next) => {
  try {
    const allowedOrigin = 'https://valuemediartb.github.io';

    // Optional: only allow requests from your GitHub Pages
    const origin = req.headers.origin || '';
    const referer = req.headers.referer || '';

    if (
      origin && !origin.startsWith(allowedOrigin) &&
      referer && !referer.startsWith(allowedOrigin)
    ) {
      console.warn('Blocked request from disallowed origin:', origin || referer);
      return res.status(403).send('Forbidden');
    }

    if (req.method === 'OPTIONS') {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'ngrok-skip-browser-warning, Content-Type');
      return res.sendStatus(200);
    }
    console.log('Incoming request:', req.method, req.path);
    next();
  } catch (err) {
    console.error('Error in middleware:', err);
    res.status(500).send('Server error');
  }
});
// Serve static files (like your GitHub Pages HTML)
app.use(express.static('public'));

// Proxy endpoint
app.post('/proxy', express.json(), async (req, res) => {
  try {
    const { targetUrl, body, headers } = req.body;
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: headers || { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: typeof body === 'string' ? body : new URLSearchParams(body).toString()
    });

    const data = await response.text();
    res.status(response.status).send(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to save the token to a file
app.get('/save-token',limiter, (req, res) => {
  const token = req.query.token;
  if (token) {
    const tokenBytes = Buffer.byteLength(token, 'utf8');
    if (tokenBytes > 10240) { // 10 * 1024
      console.warn('Token too large:', tokenBytes, 'bytes');
      return res.status(413).send('Token too large (max 10KB)');
    }
    fs.writeFile('tokens.txt', `${token}\n`, (err) => {
      if (err) {
        console.error('Error saving token:', err);
        return res.status(500).send('Error saving token');
      }
      console.log('Token saved:', token);
      res.send('Token saved successfully!');
    });
  } else {
    res.status(400).send('No token provided');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});