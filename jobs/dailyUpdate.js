const cron = require('node-cron');
const apiService = require('../services/apiService');
const dataService = require('../services/dataService');
const { client: redisClient } = require('../config/redis');

// Schedule daily update at 3 AM
const scheduleDailyUpdate = () => {
  cron.schedule('0 3 * * *', async () => {
    console.log('Running daily data update...');
    
    try {
      // Fetch data from external APIs
      const apiData = await apiService.fetchAllData();
      
      // Process and merge data
      await dataService.processAndStoreData(apiData);
      
      // Clear Redis cache to force fresh data on next request
      await redisClient.flushDb();
      console.log('Daily update completed and cache cleared');
    } catch (error) {
      console.error('Daily update failed:', error);
    }
  });
};

module.exports = scheduleDailyUpdate;