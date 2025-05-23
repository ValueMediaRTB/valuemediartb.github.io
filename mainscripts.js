function generateRandomString(length) {
	let randomString = '';
	let allowedChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

	for (let charNumber= 0; charNumber < length; ++charNumber) {
		randomString += allowedChars.charAt(Math.floor(Math.random() * allowedChars.length));
	}
	return randomString;
}
function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}
async function generateCodeChallenge(codeVerifier) {
    // Convert string to ArrayBuffer
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    
    // Generate SHA-256 hash (browser crypto API)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    // Convert ArrayBuffer to Base64URL
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashBase64 = btoa(String.fromCharCode(...hashArray));
    return hashBase64
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

let codeVerifier;
let codeChallenge;
let clientID;

async function initializeCodes() {
      codeVerifier = generateRandomString(getRandomInt(128));
      sessionStorage.setItem('codeVerifier', codeVerifier);
      
      codeChallenge = await generateCodeChallenge(codeVerifier);
      sessionStorage.setItem('codeChallenge', codeChallenge);
}

async function indexLoaded() {
    await initializeCodes();
    document.getElementById('codeVerifierContainer').innerHTML = "Code verifier: "+codeVerifier;
}
function authLoaded(){
    codeVerifier = sessionStorage.getItem('codeVerifier');
    document.getElementById('codeVerificationInput').value = codeVerifier
}

function authorizeDaisycon(){
    // Get form values
    clientID = document.getElementById('clientID').value;
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

    authorizeUrl = new URL('https://login.daisycon.com/oauth/access-token');
    const formData = {'grant_type':'authorization_code',
        'code':token,
        'client_id':clientID,
        'redirect_uri':redirectURI,
        'code_verifier':codeVerifier
    }
    try {
        console.log(JSON.stringify(formData))
        const response = await fetch('https://login.daisycon.com/oauth/access-token', {
            mode: 'no-cors',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Success:', data);
        
        // Handle the response (e.g., save access token)
        document.getElementById('accessResult').innerHTML = "Authentication successful!"
        document.getElementById('accessTokens').innerHTML = data

    } catch (error) {
        console.error('Error:', error);
        alert('Failed to authenticate: ' + error.message);
    }
}