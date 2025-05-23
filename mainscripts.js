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

(async function() {
const codeVerifier = generateRandomString(getRandomInt(128));
const codeChallenge = generateCodeChallenge(codeVerifier);

window.authorizeDaisycon = function(){
    // Get form values
    const clientID = document.getElementById('clientID').value;
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
})();