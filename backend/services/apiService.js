// apiService.js
const axios = require('axios');

const fetchDataForDateRange = async (reportType, startDate, endDate) => {
  try {
    // Replace with your actual API endpoint structure
    const endpoint = `https://api.example.com/${reportType}?start_date=${startDate}&end_date=${endDate}`;
    
    const response = await axios.get(endpoint);
    return response.data.map(item => ({
      ...item,
      date: new Date(item.date) // Ensure date is properly parsed
    }));
  } catch (error) {
    console.error(`Error fetching ${reportType} data:`, error);
    throw error;
  }
};

const fetchCompositeDataForDateRange  = async (types, startDate, endDate) => {
  try {
    // Normalize and validate types
    const normalizedTypes = types.map(t => t.toLowerCase()).sort();
    const endpoint = `https://api.example.com/composite/${normalizedTypes.join('-')}` +
                     `?start_date=${startDate}&end_date=${endDate}`;
    
    const response = await axios.get(endpoint);
    return response.data;
  } catch (error) {
    console.error('Error fetching composite data:', error);
    throw error;
  }
};
module.exports = { 
  fetchDataForDateRange,
  fetchCompositeDataForDateRange 
};