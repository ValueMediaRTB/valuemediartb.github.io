const axios = require('axios');

const fetchAllData = async () => {
  try {
    // Example - replace with your actual API endpoints
    const endpoints = [
      'https://api.example.com/countries',
      'https://api.example.com/isps',
      // Add other endpoints
    ];
    
    const requests = endpoints.map(endpoint => axios.get(endpoint));
    const responses = await Promise.all(requests);
    
    return {
      countries: responses[0].data,
      isps: responses[1].data,
      // Process other responses
    };
  } catch (error) {
    console.error('Error fetching API data:', error);
    throw error;
  }
};

module.exports = { fetchAllData };