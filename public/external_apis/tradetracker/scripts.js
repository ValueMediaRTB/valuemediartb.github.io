let serverURL;
let accountID;

function tradeTrackerIndexLoaded(){
   serverURL = sessionStorage.getItem('serverURL',serverURL);
    if(!serverURL || serverURL == "undefined"){}
    else{
        document.getElementById('serverURLInput').value = serverURL;
    }
}
function validateInput(){
    serverURL = document.getElementById('serverURLInput').value;
    if(!serverURL || serverURL == "undefined" || serverURL == "")
        return false;
    sessionStorage.setItem('serverURL',serverURL);
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

async function exportOffers(){
    if(!validateInput()){
        alert('In TradeTracker/exportOffers(): Invalid input!');
        return;
    }
    try {
        const user = document.getElementById('userSelect').value;
        document.getElementById('resultTitle').innerHTML = "Sent exportOffers request to server, waiting for response...";
        const response = await fetch(`${serverURL}/export` , {
        method: 'POST',
        body: JSON.stringify({
            commands : [  
                {
                    commandName:"tradeTrackerOffers"
                },
                {   user: user
                    /* replace with tradetracker commands
                    commandName:"getBrands",
                    targetUrl:`https://app.partnerboost.com/api.php?mod=medium&op=monetization_api`,
                    headers: { 'Content-Type': 'application/json',
                        'accept':'application/json' },
                    method:"POST",
                    body:{user:document.getElementById('accountInput').value}*/
                }
            ]
            }),
        headers: { 'Content-Type': 'application/json' }
        });

        // First check if the HTTP request itself succeeded
        if (!response.ok) {
            console.error("In TradeTracker/exportOffers(): received error response from server");
            document.getElementById('resultTitle').innerHTML = "TradeTracker/exportOffers failed! Received response "+response.status;
        }
        else{
            const data = await response.json();
            document.getElementById('resultTitle').innerHTML = "Export offers successful!";

            document.getElementById('resultContainer').innerHTML = "Downloading tradeTrackerOffers.csv...";
            downloadCSV(data.result,'tradeTrackerOffers.csv');
                
            console.log('TradeTracker/exportOffers() success:', data);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}
async function subscribeAll(){
    if(!validateInput()){
        alert('In TradeTracker/subscribeAll(): Invalid input!');
        return;
    }
    try {
        const user = document.getElementById('userSelect').value;
        document.getElementById('resultTitle').innerHTML = "Sent subscribeAll request to server, waiting for response...";
        const response = await fetch(`${serverURL}/update` , {
        method: 'POST',
        body: JSON.stringify({
            commands : [  
                {
                    commandName:"tradeTrackerUpdate"
                },
                {   
                    commandName:"subscribeAll",
                    user: user
                    /* replace with tradetracker commands
                    commandName:"getBrands",
                    targetUrl:`https://app.partnerboost.com/api.php?mod=medium&op=monetization_api`,
                    headers: { 'Content-Type': 'application/json',
                        'accept':'application/json' },
                    method:"POST",
                    body:{user:document.getElementById('accountInput').value}*/
                }
            ]
            }),
        headers: { 'Content-Type': 'application/json' }
        });

        // First check if the HTTP request itself succeeded
        if (!response.ok) {
            console.error("In TradeTracker/subscribeAll(): received error response from server");
            document.getElementById('resultTitle').innerHTML = "TradeTracker/subscribeAll failed! Received response "+response.status;
        }
        else{
            const data = await response.json();
            document.getElementById('resultTitle').innerHTML = "Subscribe to all campaigns successful!";
            document.getElementById('resultContainer').innerHTML = JSON.stringify(data);
                
            console.log('TradeTracker/exportOffers() success:', data);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}