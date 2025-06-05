const cacheService = require('../services/cacheService');
const dataService = require('../services/dataService');
const compositeService = require('../services/compositeService');

class DataController {
  async getReport(reportType, startDate, endDate, filters = {}) {
    try {
      if (reportType.includes('+')) {
        const types = reportType.split('+');
        return this._getCompositeReport(types, startDate, endDate, filters);
      }
      return this._getSingleReport(reportType, startDate, endDate, filters);
    } catch (error) {
      console.error(`Error getting report ${reportType}:`, error);
      throw error;
    }
  }

  async _getSingleReport(reportType, startDate, endDate, filters) {
    // Implementation for single table reports
    const dates = this._getDateRange(new Date(startDate), new Date(endDate));
    
    const results = [];
    for (const date of dates) {
      let data = await cacheService.getDailyData(reportType, date);
      
      if (!data) {
        data = await dataService.fetchFromDatabase(reportType, date, filters);
        if (data.length > 0) {
          await cacheService.setDailyData(reportType, date, data);
        } else {
          // Try external API if no data in DB
          data = await dataService.fetchFromExternalApi(reportType, date);
          if (data.length > 0) {
            await dataService.storeData(reportType, data);
            await cacheService.setDailyData(reportType, date, data);
          }
        }
      }
      
      results.push(...data);
    }
    
    return results;
  }

  async _getCompositeReport(types, startDate, endDate, filters) {
    // Implementation for composite reports
    const dates = this._getDateRange(new Date(startDate), new Date(endDate));
    
    const results = [];
    for (const date of dates) {
      let data = await cacheService.getCompositeData(types, date, filters);
      
      if (!data) {
        data = await compositeService.fetchFromDatabase(types, date, filters);
        if (data.length > 0) {
          await cacheService.setCompositeData(types, date, data, filters);
        } else {
          // Try external API if no data in DB
          data = await compositeService.fetchFromExternalApi(types, date);
          if (data.length > 0) {
            await compositeService.storeData(types, data);
            await cacheService.setCompositeData(types, date, data, filters);
          }
        }
      }
      
      results.push(...data);
    }
    
    return results;
  }

  _getDateRange(startDate, endDate) {
    const dates = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    return dates;
  }
}

module.exports = new DataController();