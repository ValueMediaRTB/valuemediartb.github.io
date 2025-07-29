const redisClient = require('../config/redis.js');
const cacheService  = require('../services/cacheService.js');

const getCachedData = async (key, fetchFromDB, ttl = 3600) => {
  try {
    const cachedData = await redisClient.get(key);
    if (cachedData) return JSON.parse(cachedData);
    
    const dbData = await fetchFromDB();
    await redisClient.setEx(key, ttl, JSON.stringify(dbData));
    return dbData;
  } catch (error) {
    console.error('Cache error:', error);
    return fetchFromDB();
  }
};

// Simple model accessors
const getCountries = async () => getCachedData('countries:all', () => Country.find().sort({ name: 1 }));

const getAffiliateOffers = async(affiliateNetwork,user) => {const cachedOffers = cacheService.getGeneralData(affiliateNetwork+"_"+user+"_offers"); return cachedOffers};
const setAffiliateOffers = async(affiliateNetwork,user,offers) => cacheService.setGeneralData(affiliateNetwork+"_"+user+"_offers",offers);

// Cache busting for when data changes
const bustCache = async (keyPattern) => {
  const keys = await redisClient.keys(keyPattern);
  if (keys.length) await redisClient.del(keys);
};

const clearCache = async() => {
  await redisClient.flush();
} 

module.exports = { 
  getCountries,
  getCachedData,
  getAffiliateOffers,
  setAffiliateOffers,
  bustCache,
  clearCache
};