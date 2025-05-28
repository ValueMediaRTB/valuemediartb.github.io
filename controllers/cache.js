const { getAsync, setAsync } = require('../config/redis');
const Country = require('../models/Country');
const ISP = require('../models/ISP');
// Import other models...

const getCachedData = async (key, fetchFromDB) => {
  try {
    // Try to get from Redis cache
    const cachedData = await getAsync(key);
    
    if (cachedData) {
      return JSON.parse(cachedData);
    }
    
    // If not in cache, fetch from DB
    const dbData = await fetchFromDB();
    
    // Store in cache for 1 hour
    await setAsync(key, JSON.stringify(dbData), 'EX', 3600);
    
    return dbData;
  } catch (error) {
    console.error('Cache error:', error);
    return fetchFromDB(); // Fallback to DB
  }
};

const getCountries = async () => {
  return getCachedData('countries', async () => {
    return await Country.find().sort({ name: 1 });
  });
};

// Create similar functions for other entities (getISPs, getZones, etc.)

module.exports = { getCountries /*, other get functions */ };