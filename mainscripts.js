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
const publisherID = 470796;

async function initializeCodes() {
      codeVerifier = generateRandomString(getRandomInt(43,128));
      sessionStorage.setItem('codeVerifier', codeVerifier);
      
      codeChallenge = await generateCodeChallenge(codeVerifier);
      sessionStorage.setItem('codeChallenge', codeChallenge);
}

async function indexLoaded() {
    await initializeCodes();
    document.getElementById('authorizeDaisyconBtn').disabled = false
    sessionStorage.setItem('clientID', 0);
    document.getElementById('codeVerifierContainer').innerHTML = "Code verifier: "+codeVerifier;
    console.log("indexLoaded() called")
}
function authLoaded(){
    codeVerifier = sessionStorage.getItem('codeVerifier');
    clientID = sessionStorage.getItem('clientID');
    document.getElementById('codeVerificationInput').value = codeVerifier
    document.getElementById('accessDaisyconBtn').disabled = false
    console.log("authLoaded() called")
}

function authorizeDaisycon(){
    // Get form values
    document.getElementById('authorizeDaisyconBtn').disabled = true
    clientID = document.getElementById('clientID').value;
    sessionStorage.setItem('clientID', clientID);
    const redirectURI = 'https://valuemediartb.github.io/auth.html'
    
    // Validate inputs
    if (!clientID) {
        alert('Client ID is missing!');
        return;
    }
    if(!redirectURI || !codeChallenge){
        alert('CodeVerifier or redirectURI are null!');
        return;
    }

    authorizeUrl = new URL('https://login.daisycon.com/oauth/authorize');
    authorizeUrl.searchParams.append('response_type','code');
    authorizeUrl.searchParams.append('client_id',clientID);
    authorizeUrl.searchParams.append('redirect_uri',redirectURI);
    authorizeUrl.searchParams.append('code_challenge',codeChallenge);

    location.replace(authorizeUrl.toString())

}; 
async function accessDaisycon(){
    // Get form values
    const token = document.getElementById('tokenProcessed').value;
    const redirectURI = 'https://valuemediartb.github.io/auth.html'

    // Validate inputs
    if (!token) {
        alert('Token is missing!');
        return;
    }
    if(!redirectURI || !codeVerifier){
        alert('CodeVerifier or redirectURI are null!');
        return;
    }

    accessUrl = 'https://login.daisycon.com/oauth/access-token';
    const formData = {'grant_type':'authorization_code',
        'code':token,
        'client_id':clientID,
        'client_secret':'',
        'redirect_uri':redirectURI,
        'code_verifier':codeVerifier
    }
    try {
        const response = await fetch('https://e9ff-91-132-4-72.ngrok-free.app/proxy' , {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUrl: 'https://login.daisycon.com/oauth/access-token',
            body: formData,
            headers: { 'Content-Type': 'application/json' },
            method:"POST"
          })
        });
    
        const data = await response.json();
        // Handle the response (e.g., save access token)
        document.getElementById('accessResult').innerHTML = "Authentication successful!"
        document.getElementById('accessToken').innerHTML = "Access token: "+data.access_token
        document.getElementById('refreshToken').innerHTML = "Refresh token: "+data.refresh_token
        document.getElementById('accessDaisyconBtn').disabled = true

        console.log('Success:', data);
      } catch (error) {
        console.error('Error:', error);
      }
}

async function getCampaignMaterial(){
    try {
        const response = await fetch('https://e9ff-91-132-4-72.ngrok-free.app/proxy' , {
          method: 'GET',
          body: JSON.stringify({
            targetUrl:'https://services.daisycon.com/publishers/470796/material/programs?page=1&per_page=5',
            headers: { 'Content-Type': 'application/json' },
            method:"GET"
            }),
          headers: { 'accept': 'application/json',
            'Authorization':'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJ1aWQiOjM3OTExOSwidXNnIjo2LCJwdWJsaXNoZXJzIjpbeyJpZCI6NDcwNzk2LCJzZXJ2aWNlX2dyb3VwcyI6NTJ9XSwiaWF0IjoxNzQ4MDA4MDQ1LCJleHAiOjE3NDgwMDk4NDUsImlzcyI6Im9hdXRoIiwiYXVkIjoiNzkwIn0.sXF57_sDMhC54nIQsAGyjnBaPrwnvsmkDpC0fRajxO2LqpxKxHV35D3vKYmW9vQU_G5XAoMFR62YlHplrhYiUw' 
           }
        });
    
        const data = await response.json();
        // Handle the response (e.g., save access token)
        document.getElementById('accessResult').innerHTML = "Authentication successful!"
        document.getElementById('accessToken').innerHTML = "Access token: "+data.access_token
        document.getElementById('refreshToken').innerHTML = "Refresh token: "+data.refresh_token
        document.getElementById('accessDaisyconBtn').disabled = true

        console.log('Success:', data);
      } catch (error) {
        console.error('Error:', error);
      }
}