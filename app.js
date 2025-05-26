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

let accessToken;

async function sendRequest(req){
  try {
    const { targetUrl, body, headers,method,writeToFile } = req;
    let response;
    if(method == 'GET'){
      response = await fetch(targetUrl, {
        method: method,
        headers: headers
      });
    }
    else if(method =="POST"){
      response = await fetch(targetUrl, {
      method: method,
      headers: headers,
      body: JSON.stringify(body)
    });
    }
    let data = await response.text();
    return data;
  }
  catch (error) {
    res.status(500).json({ error: error.message });
  }
}

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

    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  } catch (err) {
    console.error('Error in middleware:', err);
    res.status(500).send('Server error');
  }
});
// Serve static files (like your GitHub Pages HTML)
app.use(express.static('public'));


app.post('/export',express.json(),async (req,res) => {
  try {
    const { commands } = req.body;
    let media = [];
    let programs = [];
    commands.forEach(command => {
      let page = 1, pageSize = 1000;
      if(command.commandName == "getMedia"){
        do{
          trgtUrl = command.targetUrl + `?page=${page}&per_page=${pageSize}`;
          page++;
          crt_media = sendRequest({targetUrl:trgtUrl,headers:command.headers,method:command.method});
          crt_media.forEach(med => media.push(med.id));
        }
        while(crt_media.length == pageSize);
      }
      else if(command.commandName = "getProducts"){
        media.forEach(med => {
          page = 1;
          pageSize = 1000;
          do{
            trgtUrl = command.targetUrl +  `?media_id=${med}order_direction=asc&page=${page}&per_page=${pageSize}`;
            page++;
            program = sendRequest({targetUrl:trgtUrl,headers:command.headers,method:command.method});
            programs.push(program);
          } while(program.length == pageSize);
        })
      }
      else if(command.commandName == "exportOffers"){
        fs.writeFile('daisyconOffers.csv',programs.map(prg => prg.display_url.join('\n')),(err) => {if (err) {
          console.error('Error in /export: Failed writing result to file:', err);
          return res.status(500).send('Error storing to file');
        }
      });
      }
    })
    res.status(response.status).send("OK");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Proxy endpoint
app.post('/proxy', express.json(), async (req, res) => {
  try{
    const data = sendRequest(req)
    if(writeToFile == 1){ 
      fs.writeFile('result.txt', `${data}\n`, (err) => {
        if (err) {
          console.error('Error writing result to file:', err);
          return res.status(500).send('Error storing to file');
        }
        console.log('Result saved!');
        msg = {'message':'Saved result to result.txt on server!'};
        res.status(response.status).send(JSON.stringify(msg));
      });
    }
    else{
      res.status(response.status).send(data);
    }
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