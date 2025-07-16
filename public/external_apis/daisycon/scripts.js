// /public/external_apis/daisycon/scripts.js - Updated with authentication
window.authorizeDaisycon = authorizeDaisycon;

function downloadCSV(data, filename = 'data.csv') {
    try {
        // Convert data to CSV format
        const csvContent = convertToCSV(data);
        
        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error) {
        console.error('Error generating CSV:', error);
        alert('Could not generate CSV file. See console for details.');
    }
}

function convertToCSV(data) {
    // If data is a JSON string, parse it first
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch (e) {
            throw new Error('Invalid JSON string provided');
        }
    }

    // Case 1: Array of objects
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
        const headers = Object.keys(data[0]);
        const headerRow = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',');
        
        const dataRows = data.map(obj => {
            return headers.map(header => {
                const value = obj[header];
                // Handle nested objects/arrays by stringifying them
                if (value && typeof value === 'object') {
                    return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
                }
                return `"${String(value ?? '').replace(/"/g, '""')}"`;
            }).join(',');
        });
        
        return [headerRow, ...dataRows].join('\n');
    }

    // Case 2: Simple string array (one element per line)
    if (Array.isArray(data) && data.every(item => typeof item === 'string')) {
        return data.map(str => `"${str.replace(/"/g, '""')}"`).join('\n');
    }

    // Case 3: Object with array values (matrix format)
    if (typeof data === 'object' && data !== null && !Array.isArray(data) &&
        Object.values(data).every(val => Array.isArray(val))) {
        
        const headers = Object.keys(data);
        const maxLength = Math.max(...Object.values(data).map(arr => arr.length));
        
        const rows = [];
        // Add header row
        rows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));
        
        // Add data rows
        for (let i = 0; i < maxLength; i++) {
            const row = headers.map(header => {
                const value = data[header][i];
                return `"${String(value ?? '').replace(/"/g, '""')}"`;
            });
            rows.push(row.join(','));
        }
        
        return rows.join('\n');
    }

    throw new Error('Unsupported data format. Expected: array of objects, array of strings, object with array values, or JSON string.');
}

function downloadTextFile(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    URL.revokeObjectURL(url); // Clean up
}

function generateRandomString(length) {
	let randomString = '';
	let allowedChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

	for (let charNumber= 0; charNumber < length; ++charNumber) {
		randomString += allowedChars.charAt(Math.floor(Math.random() * allowedChars.length));
	}
	return randomString;
}

function getRandomInt(min,max) {
  return Math.floor(Math.random() * (max-min) + min);
}

async function generateCodeChallenge(codeVerifier) {
	let digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));

	return btoa(String.fromCharCode(...new Uint8Array(digest)))
		.replace(/=/g, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_');
}

let codeVerifier;
let codeChallenge;
let clientID;
let userID;
let token;
let access_token;
let refresh_token;
let serverURL;
let media;
let pageNr,pageSize,mediaID,programID,mediaIDParam;
const redirectURI = 'https://valuemediartb.github.io/public/external_apis/daisycon/auth.html'

async function initializeCodes() {
      codeVerifier = generateRandomString(getRandomInt(43,128));
      sessionStorage.setItem('codeVerifier', codeVerifier);
      
      codeChallenge = await generateCodeChallenge(codeVerifier);
      sessionStorage.setItem('codeChallenge', codeChallenge);
}

async function daisyconIndexLoaded() {
    await initializeCodes();

    access_token = sessionStorage.getItem('access_token');
    refresh_token = sessionStorage.getItem('refresh_token');
    let auatoken;
    if(!access_token || access_token == "undefined" || !refresh_token  || refresh_token == "undefined"){
        document.getElementById('authorizeDaisyconBtn').disabled = false;
        sessionStorage.setItem('clientID', 0);
        sessionStorage.setItem('userID', 0);
        serverURL = sessionStorage.getItem('serverURL')
        if(serverURL){
            document.getElementById('serverURLInput').value = serverURL;
        }
        document.getElementById('codeVerifierContainer').innerHTML = "Code verifier: "+codeVerifier;
    }
    else{
        accessGranted = new URL(redirectURI);
        location.replace(accessGranted.toString())
    }
    
    console.log("indexLoaded() called")
}

async function daisyconAuthLoaded(){
    console.log("authLoaded() called") //////////// ///// //
    codeVerifier = sessionStorage.getItem('codeVerifier');
    clientID = sessionStorage.getItem('clientID');
    userID = sessionStorage.getItem('userID');
    serverURL = sessionStorage.getItem('serverURL');
    access_token = sessionStorage.getItem('access_token');
    refresh_token = sessionStorage.getItem('refresh_token');
    if(!access_token || access_token == "undefined"){
        document.getElementById('codeVerificationInput').value = codeVerifier;
        document.getElementById('accessDaisyconBtn').disabled = false;
        document.getElementById('getCampaignMaterialBtn').disabled = true;
        document.getElementById('apiButtonsContainer').style.display = "none";
        document.getElementById('manualReqPanel').style.display = "none";
        const urlParams = new URLSearchParams(window.location.search);
        token = urlParams.get('code'); 

        if (token) {
            document.getElementById('tokenProcessed').value = token
        }
    }
    else
    {
        document.getElementById('accessToken').innerHTML = "Access token: "+access_token;
        document.getElementById('refreshToken').innerHTML = "Refresh token: "+refresh_token;
        document.getElementById('accessDaisyconBtn').disabled = true;
        document.getElementById('apiButtonsContainer').style.display = "block";
        document.getElementById('manualReqPanel').style.display = "block";
        document.getElementById('getCampaignMaterialBtn').disabled = false;
        if(!media || media == "undefined"){
            getMediasResult = await getMedias();
            if(getMediasResult){
                let mediaIDInput = document.getElementById('mediaIDInput');
                media.forEach(option => {
                    const optElem = document.createElement('option');
                    optElem.value = option.id;
                    optElem.textContent = `ID: ${option.id}, Name: ${option.name}`;
                    mediaIDInput.appendChild(optElem);
                });
                const noneOpt = document.createElement('option');
                noneOpt.value = '';
                noneOpt.textContent = 'All';
                noneOpt.selected = true;
                mediaIDInput.prepend(noneOpt);
            }
        }
    }
}

async function authorizeDaisycon(){
    // Get form values
    document.getElementById('authorizeDaisyconBtn').disabled = true
    userID = document.getElementById('userSelect').value;
    serverURL = document.getElementById('serverURLInput').value;
    
    // Validate inputs
    if (!userID || userID == "undefined") {
        alert('userID is missing!');
        return;
    }
    if (!serverURL || serverURL == "undefined") {
        alert('Server URL is missing!');
        return;
    }
    if(!redirectURI || !codeChallenge){
        alert('CodeVerifier or redirectURI are null!');
        return;
    }
    const response = await fetch(`${serverURL}/export` , {
        method: 'POST',
        body: JSON.stringify({
            commands : [  
                {
                    commandName:"daisyconClientID"
                },
                {
                    user:userID
                }
            ]
            }),
        headers: { 'Content-Type': 'application/json' }
        });
    
    if (!response.ok) {
            console.error("In authorizeDaisycon(): received error response from server");
            document.getElementById('resultTitle').innerHTML = "authorizeDaisycon failed! Received response "+response.status;
        }
    else{
        respJson = await response.json();
        console.log(respJson);
        clientID = respJson.ID;
        sessionStorage.setItem('userID', userID);
        sessionStorage.setItem('clientID', clientID);
        sessionStorage.setItem('serverURL',serverURL);

        authorizeUrl = new URL('https://login.daisycon.com/oauth/authorize');
        authorizeUrl.searchParams.append('response_type','code');
        authorizeUrl.searchParams.append('client_id',clientID);
        authorizeUrl.searchParams.append('redirect_uri',redirectURI);
        authorizeUrl.searchParams.append('code_challenge',codeChallenge);

        location.replace(authorizeUrl.toString())
    }
}; 

async function accessDaisycon(){
    // Validate inputs
    if (!token || token == "undefined") {
        alert('Token is missing!');
        return;
    }
    if(!redirectURI || !codeVerifier){
        alert('CodeVerifier or redirectURI are null!');
        return;
    }

    accessUrl = 'https://login.daisycon.com/oauth/access-token';
    const formData = {
        'grant_type':'authorization_code',
        'code':token,
        'client_id':clientID,
        'client_secret':'',
        'redirect_uri':redirectURI,
        'code_verifier':codeVerifier
    }
    try {
        const response = await fetch(`${serverURL}/proxy`, {
          method: 'POST',
          body: JSON.stringify({
            targetUrl: accessUrl,
            body: formData,
            headers: { 'Content-Type': 'application/json' },
            method:"POST"
          }),
          headers: { 
            'Content-Type': 'application/json'
        }});
    
        const data = await response.json();
        // Handle the response (e.g., save access token)
        document.getElementById('accessResult').innerHTML = "Authentication successful!";
        document.getElementById('accessToken').innerHTML = "Access token: "+data.access_token;
        document.getElementById('refreshToken').innerHTML = "Refresh token: "+data.refresh_token;
        document.getElementById('accessDaisyconBtn').disabled = true;
        document.getElementById('apiButtonsContainer').style.display = "block";
        document.getElementById('manualReqPanel').style.display = "block";
        document.getElementById('getCampaignMaterialBtn').disabled = false;

        access_token = data.access_token;
        refresh_token = data.refresh_token;
        sessionStorage.setItem('access_token',access_token);
        sessionStorage.setItem('refresh_token',refresh_token);

        console.log('Success:', data);
      } catch (error) {
        console.error('Error:', error);
      }
}

async function refreshAccessDaisycon(){
    // Validate inputs
    if (!refresh_token || refresh_token == "undefined") {
        alert('Refresh token is missing!');
        return;
    }

    accessUrl = 'https://login.daisycon.com/oauth/access-token';
    const formData = {'grant_type':'refresh_token',
        'refresh_token':refresh_token,
        'client_id':clientID,
        'client_secret':'',
        'redirect_uri':redirectURI
    }
    try {
        const response = await fetch(`${serverURL}/proxy`, {
          method: 'POST',
          body: JSON.stringify({
            targetUrl: accessUrl,
            body: formData,
            headers: { 'Content-Type': 'application/json' },
            method:"POST"
          }),
        headers:{"Content-Type":"application/json"}
        });
    
        const data = await response.json();
        // Handle the response (e.g., save access token)
        document.getElementById('accessResult').innerHTML = "Refresh successful!"
        document.getElementById('accessToken').innerHTML = "Access token: "+data.access_token
        document.getElementById('refreshToken').innerHTML = "Refresh token: "+data.refresh_token
        document.getElementById('accessDaisyconBtn').disabled = true
        document.getElementById('getCampaignMaterialBtn').disabled = false

        access_token = data.access_token;
        refresh_token = data.refresh_token;
        sessionStorage.setItem('access_token',access_token);
        sessionStorage.setItem('refresh_token',refresh_token);

        console.log('Success:', data);
      } catch (error) {
        console.error('Error:', error);
      }
}

function validateAPIInput(required){
    valid = true;
    pageNr = document.getElementById('pageInput').value || 1;
    pageSize = document.getElementById('pageSizeInput').value || 1000;
    mediaID = document.getElementById('mediaIDInput').value || 0;
    mediaIDParam = ( mediaID != 0 ? `media_id=${mediaID}&`: "");
    programID = document.getElementById('programIDInput').value || 0;
    if(required && required.includes('mediaID') && mediaID == 0){
        document.getElementById('mediaIDrequired').innerHTML = 'Please select a media ID (all is invalid).';
        valid = false;
    }
    else{
        document.getElementById('mediaIDrequired').innerHTML = '';
    }
    if(required && required.includes('programID') && programID == 0){
        document.getElementById('programIDrequired').innerHTML = 'Program ID is required!';
        valid = false;
    }
    else{
        document.getElementById('programIDrequired').innerHTML = '';
    }
    return valid;
}

async function getCampaignMaterial(){
    if(!access_token || access_token == "undefined"){
        alert('In getCampaignMaterial(): Access token is missing!');
        return;
    }
    try {
        validateAPIInput();
        const response = await fetch(`${serverURL}/proxy`, {
        method: 'POST',
        body: JSON.stringify({
            targetUrl:`https://services.daisycon.com/publishers/${userID}/material/programs?page=${pageNr}&per_page=${pageSize}`,
            headers: { 'accept': 'application/json',
            'Authorization':'Bearer '+access_token },
            method:"GET"
            }),
        headers:{"Content-Type":"application/json"}
        });
    
        const data = await response.json();
        // Handle the response (e.g., save access token)
        document.getElementById('resultTitle').innerHTML = "Get campaign material successful!"
        document.getElementById('resultContainer').innerHTML = "Result: "+data

        console.log('Success:', data);
    } catch (error) {
        console.error('Error:', error);
    }
}

async function getPrograms(){
    if(!access_token || access_token == "undefined"){
        alert('In getPrograms(): Access token is missing!');
        return;
    }
    try {
        validateAPIInput();
        const response = await fetch(`${serverURL}/proxy`, {
        method: 'POST',
        body: JSON.stringify({
            targetUrl:`https://services.daisycon.com/publishers/${userID}/programs?${mediaIDParam}order_direction=asc&page=${pageNr}&per_page=${pageSize}`,
            headers: { 'accept': 'application/json',
            'Authorization':'Bearer '+access_token },
            method:"GET"
            }),
        headers:{"Content-Type":"application/json"}
        });
    
        const data = await response.json();
        // Handle the response (e.g., save access token)
        document.getElementById('resultTitle').innerHTML = "Get campaign material successful!"
        document.getElementById('resultContainer').innerHTML = "Result in console"

        console.log('Success:', data);
    } catch (error) {
        console.error('Error:', error);
    }
}

async function getMaterialDeeplinks(){
    if(!access_token || access_token == "undefined"){
        alert('In getPrograms(): Access token is missing!');
        return;
    }
    try {
        validateAPIInput();
        document.getElementById('resultTitle').innerHTML = "Sent getMaterialDeeplinks request to server, waiting for response...";
        document.getElementById('resultContainer').innerHTML = "";
        const response = await fetch(`${serverURL}/proxy`, {
        method: 'POST',
        body: JSON.stringify({
            targetUrl:`https://services.daisycon.com/publishers/${userID}/material/deeplinks?${mediaIDParam}order_direction=asc&page=${pageNr}&per_page=${pageSize}`,
            headers: { 'accept': 'application/json',
            'Authorization':'Bearer '+access_token },
            method:"GET"
            }),
        headers:{"Content-Type":"application/json"}
        });
    
        const data = await response.json();
        // Handle the response (e.g., save access token)
        document.getElementById('resultTitle').innerHTML = "Get all ads with deeplinks successful!"
        document.getElementById('resultContainer').innerHTML = "Result in console"

        console.log('Success:', data);
    } catch (error) {
        document.getElementById('resultTitle').innerHTML = "Received error response for getMaterialDeeplinks";
        document.getElementById('resultContainer').innerHTML = "";
        console.error('Error:', error);
    }
}

async function getProducts(){
    if(!access_token || access_token == "undefined"){
        alert('In getProducts(): Access token is missing!');
        return;
    }
    try {
        validateAPIInput();
        const response = await fetch(`${serverURL}/proxy`, {
        method: 'POST',
        body: JSON.stringify({
            targetUrl:`https://services.daisycon.com/publishers/${userID}/material/product-feeds/products?language_code=en&order_direction=asc&page=${pageNr}&per_page=${pageSize}`,
            headers: { 'accept': 'application/json',
            'Authorization':'Bearer '+access_token },
            method:"GET"
            }),
        headers:{"Content-Type":"application/json"}
        });
    
        const data = await response.json();
        // Handle the response (e.g., save access token)
        document.getElementById('resultTitle').innerHTML = "Get products successful!"
        document.getElementById('resultContainer').innerHTML = "Result in console"

        console.log('Success:', data);
    } catch (error) {
        console.error('Error:', error);
    }
}

async function getMedias(){
    if(!access_token || access_token == "undefined"){
        alert('In getMedias(): Access token is missing!');
        return false;
    }
    try {
        pageNr = document.getElementById('pageInput').value || 1;
        pageSize = document.getElementById('pageSizeInput').value || 1000;
        const response = await fetch(`${serverURL}/proxy` , {
            method: 'POST',
            body: JSON.stringify({
                targetUrl:`https://services.daisycon.com/publishers/${userID}/media`,
                headers: { 'accept': 'application/json',
                'Authorization':'Bearer '+access_token },
                method:"GET"
                ////,writeToFile: 1 use this in production mode
                }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
            console.error("In getMedias(): received error response from server");
            return false;
        }
        const data = await response.json();
        media = data;
        // Handle the response (e.g., save access token)
        document.getElementById('resultTitle').innerHTML = "Get medias successful!"
        console.log('in getMedias() success:', data);
        return true;
    } catch (error) {
        console.error('Error:', error);
        return false;
    }
    
}

async function exportOffers(){
    if(!access_token || access_token == "undefined"){
        alert('In exportOffers(): Access token is missing!');
        return;
    }
    try {
        pageNr = document.getElementById('pageInput').value || 1;
        pageSize = document.getElementById('pageSizeInput').value || 1000;
        document.getElementById('resultTitle').innerHTML = "Sent exportOffers request to server, waiting for response...";
        document.getElementById('resultContainer').innerHTML = "";
        const response = await fetch(`${serverURL}/export` , {
        method: 'POST',
        body: JSON.stringify({
            commands : [  
                {
                    commandName:"daisyconOffers"
                },
                {
                    commandName:"getMedia",
                    targetUrl:`https://services.daisycon.com/publishers/${userID}/media`,
                    headers: { 'accept': 'application/json',
                    'Authorization':'Bearer '+access_token },
                    method:"GET"
                },
                {
                    commandName:"getProducts",
                    targetUrl:`https://services.daisycon.com/publishers/${userID}/programs`,
                    headers: { 'accept': 'application/json',
                    'Authorization':'Bearer '+access_token },
                    method:"GET"
                }
            ]
            }),
        headers: { 'Content-Type': 'application/json' }
        });

        // First check if the HTTP request itself succeeded
        if (!response.ok) {
            console.error("In exportOffers(): received error response from server");
            document.getElementById('resultTitle').innerHTML = "exportOffers failed! Received response "+response.status;
        }
        else{
            const data = await response.json();
            document.getElementById('resultTitle').innerHTML = "Export offers successful!";
            document.getElementById('resultContainer').innerHTML = "Downloading daisyconOffers.csv...";

            downloadCSV(data.result,'daisyconOffers.csv');
            console.log('exportOffers() success:', data);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}
async function subscribeProgram(){
    if(!access_token || access_token == "undefined"){
        alert('In subscribeProgram(): Access token is missing!');
        return;
    }
    validateAPIInput(['mediaID','programID']);
    pageNr = document.getElementById('pageInput').value || 1;
    pageSize = document.getElementById('pageSizeInput').value || 1000;
    document.getElementById('resultTitle').innerHTML = "Sent subscribeProgram request to server, waiting for response...";
    document.getElementById('resultContainer').innerHTML = "";
    const response = await fetch(`${serverURL}/proxy` , {
    method: 'POST',
    body: JSON.stringify({
        commandName:"subscribeProgram",
        targetUrl:`https://services.daisycon.com/publishers/${userID}/programs/${programID}/subscriptions/${mediaID}`,
        headers: { 'accept': 'application/json',
        'Authorization':'Bearer '+access_token },
        method:"POST"
    }),
    headers: { 'Content-Type': 'application/json' }
    });

    // First check if the HTTP request itself succeeded
    if (!response.ok) {
        console.error("In subscribeProgram(): received error response from server");
        document.getElementById('resultTitle').innerHTML = "subscribeProgram failed! Received response "+response.status;
    }
    else{
        const data = await response.json();
        document.getElementById('resultTitle').innerHTML = "Subscribe program successful!";
        document.getElementById('resultContainer').innerHTML = JSON.stringify(data);

        console.log('subscribeProgram() success:', data);
    }
} 
async function subscribeAllPrograms(){
    if(!access_token || access_token == "undefined"){
        alert('In subscribeAllPrograms(): Access token is missing!');
        return;
    }
    try {
        document.getElementById('resultTitle').innerHTML = "Sent subscribeAllPrograms request to server, waiting for response...";
        document.getElementById('resultContainer').innerHTML = "This may take a few minutes.";
        const response = await fetch(`${serverURL}/update` , {
        method: 'POST',
        body: JSON.stringify({
            commands: [
                {
                    commandName:"daisyconUpdate"
                },
                {
                    commandName:"subscribeAllPrograms",
                    body: {"publisherID":userID},
                    headers: { 'Content-Type': 'application/json',
                        'accept': 'application/json',
                        'Authorization':'Bearer '+access_token },
                    method:"POST"
                }
            ]
        }),
        headers: { 'Content-Type': 'application/json' }
        });

        // First check if the HTTP request itself succeeded
        if (!response.ok) {
            const errorData = await response.json();
            console.error("In subscribeAllPrograms(): received error response from server");
            if(JSON.stringify(errorData).toLowerCase().includes("expired token")) 
                document.getElementById('resultTitle').innerHTML = "<div style=\"color:red\">Token expired! Click refresh token button</div>"
            else
                document.getElementById('resultTitle').innerHTML = "subscribeAllPrograms failed! Received response: "+"<div style=\"color:red\">"+JSON.stringify(errorData)+"</div>";
        }
        else{
            const data = await response.json();
            document.getElementById('resultTitle').innerHTML = "Subscribe to all programs successful!";
            document.getElementById('resultContainer').innerHTML = JSON.stringify(data);
            downloadTextFile(data.result.join("\n"),"daisycon_subscribe_all_programs_logs.txt");
            console.log('subscribeAllPrograms() success. Downloading logs...');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function sendManualRequest(){
    if(!access_token || access_token == "undefined"){
        alert('In sendManualRequest(): Access token is missing!');
        return;
    }
    try {
        document.getElementById('resultTitle').innerHTML = "Sent manual request to server, waiting for response...";
        document.getElementById('resultContainer').innerHTML = "";
        validateAPIInput();
        let url = document.getElementById('manualReqUrl').value;
        let the_headers = JSON.parse(document.getElementById('manualReqHeaders').value) || {};
        let the_body = JSON.parse(document.getElementById("manualReqBody").value) || {};
        let type = document.getElementById('manualReqType').value || "get";

        //preprocessing the request
        if(!String(url).includes("?"))
            url = String(url) + "?";
        type = String(type).toUpperCase();
        if(type == "GET")
            the_body = {};
        the_headers.Authorization = 'Bearer '+access_token;
        
        const response = await fetch(`${serverURL}/proxy` , {
        method: 'POST',
        body: JSON.stringify({
            targetUrl:`${url}&order_direction=asc&page=${pageNr}&per_page=${pageSize}`,
            headers: the_headers,
            method:type,
            body: the_body
            ////,writeToFile: 1 use this in production mode
            }),
        headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
            document.getElementById('resultTitle').innerHTML = "Sent manual request failed";
            document.getElementById('resultContainer').innerHTML = "";
            console.error("In sendManualRequest(): received error response from server");
            return false;
        }
        const data = await response.json();
        document.getElementById('resultTitle').innerHTML = "Send manual request successful!"
        document.getElementById('resultContainer').innerHTML = "Result in console"
        console.log('Success:', data);
    } catch (error) {
        console.error('Error:', error);
    }
}