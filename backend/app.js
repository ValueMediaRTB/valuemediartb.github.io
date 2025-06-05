require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const app = express();
const PORT = 3000;
const cors = require('cors');
//const dataController = require('./controllers/dataController');

const allowedOrigins = ['http://localhost:3001', 'https://valuemediartb.github.io'];
// Rate limit: max 1 request per second per IP
const limiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 1,
  message: 'Too many requests - please wait 1 second',
});

let accessToken;

function getProgramCountryCode(programName){
  let countryCode = '';
  if (programName.includes('.')) {
    countryCode = programName.split('.').pop().trim();
  } else if (programName.includes('(') && programName.includes(')')) {
    const match = programName.match(/\(([^)]+)\)/);
    if (match) {
      countryCode = match[1].trim();
    }
  }
  if(countryCode.startsWith('com'))
    return '';
  return countryCode;
}

async function sendRequest(req){
  try{
    const { targetUrl, body, headers,method } = req;
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
    let theData = await response.text();
    let result = {data:theData,status:response.status}
    return result;
  }
  catch(error){
    console.log("Error in sendRequest: "+error.message)
  }
}
async function sendRequestDaisycon(url,headers,method,body){
  try{
    let result = []
    let page = 1, pageSize = 1000;
    let temp;
    let theUrl;
    let theBody = body;
    do{
      theUrl = url+ `page=${page}&per_page=${pageSize}`;
      console.log("Sending request: "+method+" "+theUrl);
      const {data,status} = await sendRequest({targetUrl:theUrl,body:theBody,headers:headers,method:method});
      if(status === 204){
        break;
      }
      else if(status === 200){
        page+=1;
        temp = JSON.parse(data);
        result = result.concat(temp);
      }
      else{
        throw new Error(`Daisycon API returned HTTP ${status} for URL ${theUrl} with data: ${data}`);
      }
    }
    while(temp.length == pageSize);
    return result;
  }
  catch(err){
    console.log("Error in sendRequestWithPagination(): "+err.message);
  }
}
async function sendRequestPartnerBoost(url,headers,method,body,usePagination){
  try{
    let result = []
    let page = 1, pageSize = 100;
    let temp;
    let theUrl = url
    let theBody = body;
    do{
      if(usePagination){
        theBody["page"] = page;
        theBody["limit"] = pageSize;
      }
      console.log("Sending request: "+method+" "+theUrl);
      const {data,status} = await sendRequest({targetUrl:theUrl,body:theBody,headers:headers,method:method});
      if(status === 204){
        break;
      }
      else if(status === 200){
        page+=1;
        temp = JSON.parse(data);
        result = result.concat(temp.data.list);
      }
      else{
        throw new Error(`Daisycon API returned HTTP ${status} for URL ${theUrl} with data: ${data}`);
      }
      if(!usePagination)
        break;
    }
    while(temp.length == pageSize);
    return result;
  }
  catch(err){
    console.log("Error in sendRequestWithPagination(): "+err.message);
  }
}

async function exportDaisyconOffers(commands,res){
  let media = [];
  let programs = [];
  tempMedia = await sendRequestDaisycon(commands[1].targetUrl + '?',commands[1].headers,commands[1].method,"");
  tempMedia.forEach(med => media.push(med.id));

  for(const med of media){
    tempProgram = await sendRequestDaisycon(commands[2].targetUrl + `?media_id=${med}&order_direction=asc&`,commands[2].headers,commands[2].method,"");
    programs = programs.concat(tempProgram);
  }
  const uniquePrograms = [...new Map(programs.map(prg => [prg.id, prg])).values()];
  const headers = ['Program ID,Affiliate program name', 'Affiliate Link', 'GEO', 'Currency'].join(',');
  const rows = uniquePrograms.map(prg => {
    // Escape helper
    const escapeCsv = str => `"${str.replace(/"/g, '""')}"`;
    return [
      prg.id,
      escapeCsv(prg.name),
      escapeCsv(prg.url),
      escapeCsv(getProgramCountryCode(prg.name)),
      escapeCsv(prg.currency_code)
    ].join(',');
  });
  const output = [headers, ...rows].join('\n');
  fs.writeFile('daisyconOffers.csv',output,(err) => {if (err) {
    console.error('Error in /export: Failed writing result to file:', err);
    return res.status(500).send('Error storing to file');
  }});
  const jsonRows = uniquePrograms.map(prg => ({
    "Program ID":prg.id,
    "Affiliate program name": prg.name,
    "Affiliate Link": prg.url,
    "GEO":getProgramCountryCode(prg.name),
    "Currency": prg.currency_code
  }));
  console.log("Exported to daisyconOffers.csv!");
  res.status(200).send({result:jsonRows});
}

async function exportPartnerBoostOffers(commands,res){
  const tokens = JSON.parse(process.env.TOKENS);
  const user = commands[1]["body"]["user"];
  let access_tokens;
  if(user == 1){
    //get for all users
    access_tokens = Object.entries(tokens["PARTNERBOOST"]).map(([key, value]) => value);
  }
  else{
    access_tokens = [tokens["PARTNERBOOST"][user]];
  }
  let brands = [];
  for(const access_token of access_tokens){
    let req_body = {token:access_token,relationship:"Joined"};
    let temp = await sendRequestPartnerBoost(commands[1]["targetUrl"],commands[1]["headers"],commands[1]["method"],req_body,false);
    brands = brands.concat(temp);
  }
  const headers = ['Brand ID','Brand name','Tracking URL', 'GEO', 'Currency'].join(',');
  const rows = brands.map(brd => 
    [
      brd?.brand_id ?? '', 
      `"${(brd?.merchant_name ?? '').replace(/"/g, '""')}"`,  
      `"${(brd?.tracking_url ?? '').replace(/"/g, '""')}"`,  
      `"${(brd?.country ?? '').replace(/"/g, '""')}"`,  
      `"${(brd?.currency_name ?? '').replace(/"/g, '""')}"`
    ].join(',')
  );
  const output = [headers, ...rows].join('\n');
  fs.writeFile('partnerboostOffers.csv',output,(err) => {if (err) {
    console.error('Error in exportPartnerBoostOffers(): Failed writing result to file:', err);
    return res.status(500).send('Error storing to file');
  }});
  const jsonRows = brands.map(brd => ({
    "Brand ID":brd.brand_id,
    "Brand name":brd.merchant_name,
    "Tracking URL": brd.tracking_url,
    "GEO": brd.country,
    "Currency": brd.currency_name
  }));
  console.log("Exported to partnerboostOffers.csv!");
  res.status(200).send({result:jsonRows});
}

app.use((req, res, next) => {
  console.log('Received request:', req.method, req.url);
  next();
});
// Enable CORS for all routes
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow non-browser requests
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
// Serve static files (like your GitHub Pages HTML)
app.use(express.static(path.join(__dirname, '../public')));

/*
app.post('/reportAPI/:reportType', cacheMiddleware(48200), async (req, res) => {
  try {
    const { reportType } = req.params;
    const { start_date, end_date, filters = [] } = req.body;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date are required' });
    }

    // Convert filters array to object format expected by compositeService
    const filterObj = {};
    filters.forEach(filter => {
      if (filter.type === 'primary') filterObj.primary = filter.value;
      if (filter.type === 'secondary') filterObj.secondary = filter.value;
    });

    const reportData = await dataController.getReport(
      reportType,
      start_date,
      end_date,
      filterObj
    );

    res.json(reportData);
  } catch (error) {
    console.error('Report API error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});
});*/

app.post('/export',express.json(),async (req,res) => {
  try {
    const { commands } = req.body;
    switch(commands[0].commandName){
      case 'daisyconOffers': exportDaisyconOffers(commands,res); break;
      case 'partnerboostOffers': exportPartnerBoostOffers(commands,res); break;
      default: throw new Error('Invalid /export operation!');
    }
  } catch (error) {
    console.log("Error in /export: "+error.message);
    res.status(500).json({ error: error.message });
  }
});


// Proxy endpoint
app.post('/proxy', express.json(), async (req, res) => {
  try{
    const {data,status} = await sendRequest(req.body)
    /*if(writeToFile == 1){ 
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
    else{*/
      res.status(status).send(data);
    //}
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