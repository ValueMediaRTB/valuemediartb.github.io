let serverURL;
let accountID;
let kwankoAuthorized = true;
let kwankoToken;

function kwankoIndexLoaded(){
   serverURL = sessionStorage.getItem('serverURL');
   kwankoToken = sessionStorage.getItem('kwankoToken');
    if(!serverURL || serverURL == "undefined"){}
    else{
        document.getElementById('serverURLInput').value = serverURL;
    }
    if(!kwankoToken || kwankoToken == "undefined"){}
    else{
        document.getElementById('kwankoTokenInput').value = kwankoToken;
    }
}
function validateInput(){
    serverURL = document.getElementById('serverURLInput').value;
    if(!serverURL || serverURL == "undefined" || serverURL == ""){
        return false;
    }
    sessionStorage.setItem('serverURL',serverURL);
    kwankoToken = document.getElementById('kwankoTokenInput').value;
    if(!kwankoToken || kwankoToken == "undefined" || kwankoToken == ""){
        return false;
    }
    sessionStorage.setItem('kwankoToken',kwankoToken);
    return true;
}
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

async function kwankoAuth(){
    if(!validateInput()){
        alert('In kwanko/auth(): Invalid input!');
        return;
    }
    try {
        document.getElementById('resultTitle').innerHTML = "Sent authorize request to server, waiting for response...";
        const response = await fetch(`${serverURL}/proxy` , {
        method: 'POST',
        body: JSON.stringify({
            targetUrl:`https://api.kwanko.com`,
            headers: { 'Authorization': 'Bearer '+kwankoToken},
            method:"GET",
            body:{}
        }),
        headers: { 'Content-Type': 'application/json' }
        });

        // First check if the HTTP request itself succeeded
        if (!response.ok) {
            console.error("In kwanko/auth(): received error response from server");
            document.getElementById('resultTitle').innerHTML = "kwanko/auth failed! Received response "+response.status;
        }
        else{
            const data = await response.json();
            document.getElementById('resultTitle').innerHTML = "Auth successful!";
            document.getElementById('resultContainer').innerHTML = "";
            document.getElementById('kwankoAPIButtons').style.display = "block";
            kwankoAuthorized = true;
            console.log('kwanko/auth() success:', data);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function exportOffers(){
    if(!validateInput()){
        alert('In kwanko/exportOffers(): Invalid input!');
        return;
    }
    try {
        kwankoToken = document.getElementById('kwankoTokenInput').value;
        document.getElementById('resultTitle').innerHTML = "Sent exportOffers request to server, waiting for response...";
        const response = await fetch(`${serverURL}/export` , {
        method: 'POST',
        body: JSON.stringify({
            commands : [  
                {
                    commandName:"kwankoOffers"
                },
                {
                    commandName:"getCampaigns",
                    targetUrl:`https://api.kwanko.com/publishers/ads?ad_types=deeplink`,
                    headers: { 'Authorization':'Bearer '+kwankoToken},
                    method:"GET",
                    body:{}
                }
            ]
            }),
        headers: { 'Content-Type': 'application/json' }
        });

        // First check if the HTTP request itself succeeded
        if (!response.ok) {
            console.error("In kwanko/exportOffers(): received error response from server");
            document.getElementById('resultTitle').innerHTML = "kwanko/exportOffers failed! Received response "+response.status;
        }
        else{
            const data = await response.json();
            document.getElementById('resultTitle').innerHTML = "Export offers successful!";
            document.getElementById('resultContainer').innerHTML = "Downloading kwankoOffers.csv...";
            downloadCSV(data.result,'kwankoOffers.csv');
            console.log('kwanko/exportOffers() success:', data);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}