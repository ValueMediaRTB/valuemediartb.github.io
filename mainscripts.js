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
let token;
let access_token;
let refresh_token;
let serverURL;
const publisherID = 470796;
const redirectURI = 'https://valuemediartb.github.io/auth.html'

async function initializeCodes() {
      codeVerifier = generateRandomString(getRandomInt(43,128));
      sessionStorage.setItem('codeVerifier', codeVerifier);
      
      codeChallenge = await generateCodeChallenge(codeVerifier);
      sessionStorage.setItem('codeChallenge', codeChallenge);
}

async function indexLoaded() {
    await initializeCodes();

    if(sessionStorage.getItem('access_token')){
        accessGranted = new URL('https://valuemediartb.github.io/auth.html');
        location.replace(accessGranted.toString())
    }
    else{
        document.getElementById('authorizeDaisyconBtn').disabled = false;
        sessionStorage.setItem('clientID', 0);
        serverURL = sessionStorage.getItem('serverURL')
        if(serverURL){
            document.getElementById('serverURLInput').value = serverURL;
        }
        document.getElementById('codeVerifierContainer').innerHTML = "Code verifier: "+codeVerifier;
    }
    
    console.log("indexLoaded() called")
}
function authLoaded(){
    codeVerifier = sessionStorage.getItem('codeVerifier');
    clientID = sessionStorage.getItem('clientID');
    serverURL = sessionStorage.getItem('serverURL');
    access_token = sessionStorage.getItem('access_token');
    refresh_token = sessionStorage.getItem('refresh_token');
    if(sessionStorage.getItem('access_token')){
        document.getElementById('accessToken').innerHTML = "Access token: "+access_token;
        document.getElementById('refreshToken').innerHTML = "Refresh token: "+refresh_token;
        document.getElementById('accessDaisyconBtn').disabled = true;
        document.getElementById('getCampaignMaterialBtn').disabled = false;
    }
    else{
        document.getElementById('codeVerificationInput').value = codeVerifier;
        document.getElementById('accessDaisyconBtn').disabled = false;
        document.getElementById('getCampaignMaterialBtn').disabled = true;
        const urlParams = new URLSearchParams(window.location.search);
        token = urlParams.get('code'); ///////
        if (token) {
            document.getElementById('tokenProcessed').value = token
        }
    }
    console.log("authLoaded() called")
}

function authorizeDaisycon(){
    // Get form values
    document.getElementById('authorizeDaisyconBtn').disabled = true
    clientID = document.getElementById('clientID').value;
    serverURL = document.getElementById('serverURLInput').value;
    
    // Validate inputs
    if (!clientID) {
        alert('Client ID is missing!');
        return;
    }
    if (!serverURL) {
        alert('Server URL is missing!');
        return;
    }
    if(!redirectURI || !codeChallenge){
        alert('CodeVerifier or redirectURI are null!');
        return;
    }

    sessionStorage.setItem('clientID', clientID);
    sessionStorage.setItem('serverURL',serverURL);

    authorizeUrl = new URL('https://login.daisycon.com/oauth/authorize');
    authorizeUrl.searchParams.append('response_type','code');
    authorizeUrl.searchParams.append('client_id',clientID);
    authorizeUrl.searchParams.append('redirect_uri',redirectURI);
    authorizeUrl.searchParams.append('code_challenge',codeChallenge);

    location.replace(authorizeUrl.toString())

}; 
async function accessDaisycon(){

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
        const response = await fetch(`${serverURL}/proxy` , {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUrl: accessUrl,
            body: formData,
            headers: { 'Content-Type': 'application/json' },
            method:"POST"
          })
        });
    
        const data = await response.json();
        // Handle the response (e.g., save access token)
        document.getElementById('accessResult').innerHTML = "Authentication successful!";
        document.getElementById('accessToken').innerHTML = "Access token: "+data.access_token;
        document.getElementById('refreshToken').innerHTML = "Refresh token: "+data.refresh_token;
        document.getElementById('accessDaisyconBtn').disabled = true;
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
    if (!refresh_token) {
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
        const response = await fetch(`${serverURL}/proxy` , {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUrl: accessUrl,
            body: formData,
            headers: { 'Content-Type': 'application/json' },
            method:"POST"
          })
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

async function getCampaignMaterial(){
    if(access_token){
        try {
            const response = await fetch(`${serverURL}/proxy` , {
            method: 'POST',
            body: JSON.stringify({
                targetUrl:`https://services.daisycon.com/publishers/${publisherID}/material/programs?page=1&per_page=100`,
                headers: { 'accept': 'application/json',
                'Authorization':'Bearer '+access_token },
                method:"GET"
                }),
            headers: { 'Content-Type': 'application/json' }
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
}

async function getPrograms(){
    if(access_token){
        try {
            const response = await fetch(`${serverURL}/proxy` , {
            method: 'POST',
            body: JSON.stringify({
                targetUrl:`https://services.daisycon.com/publishers/${publisherID}/programs`,
                headers: { 'accept': 'application/json',
                'Authorization':'Bearer '+access_token },
                method:"GET"
                }),
            headers: { 'Content-Type': 'application/json' }
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
}