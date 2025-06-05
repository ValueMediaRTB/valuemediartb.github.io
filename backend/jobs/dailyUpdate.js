const cron = require('node-cron');
const dataService = require('../services/dataService');
const compositeService = require('../services/compositeService');
const cacheService = require('../services/cacheService');

class DailyUpdate {
  constructor() {
    this.compositeTypes = [
      ['campaign', 'subid'],
      ['campaign', 'country'],
      ['campaign', 'isp'],
      ['campaign', 'zone'],
      ['subid', 'country']
      // Add other combinations as needed
    ];
  }

  start() {
    // Run at 3 AM daily
    cron.schedule('0 3 * * *', async () => {
      try {
        console.log('Starting daily data update...');
        
        // 1. Update individual tables
        await this._updateIndividualTables();
        
        // 2. Update composite tables
        await this._updateCompositeTables();
        
        // 3. Clear cache
        await cacheService.flush();
        
        console.log('Daily update completed successfully');
      } catch (error) {
        console.error('Daily update failed:', error);
      }
    });
  }

  async _updateIndividualTables() {
    const reportTypes = ['campaign', 'country', 'isp', 'subid', 'zone'];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    for (const type of reportTypes) {
      try {
        const data = await dataService.fetchFromExternalApi(type, yesterday);
        if (data.length > 0) {
          await dataService.storeData(type, data);
        }
      } catch (error) {
        console.error(`Error updating ${type}:`, error);
      }
    }
  }

  async _updateCompositeTables() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    await Promise.all(
      this.compositeTypes.map(async types => {
        try {
          const data = await compositeService.fetchFromExternalApi(types, yesterday);
          if (data.length > 0) {
            await compositeService.storeData(types, data);
          }
        } catch (error) {
          console.error(`Error updating composite ${types.join('+')}:`, error);
        }
      })
    );
  }
}

module.exports = new DailyUpdate();