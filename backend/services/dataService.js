const models = require('../models');
const cacheService = require('./cacheService');
const externalApiService = require('./externalApiService');

class DataService {
  getModel(reportType) {
    const modelMap = {
      'campaign': models.Campaign,
      'country': models.Country,
      'isp': models.ISP,
      'subid': models.SubID,
      'zone': models.Zone
    };
    
    if (!modelMap[reportType.toLowerCase()]) {
      throw new Error(`Unknown report type: ${reportType}`);
    }
    
    return modelMap[reportType.toLowerCase()];
  }

  async fetchFromDatabase(reportType, date, filters = {}) {
    const Model = this.getModel(reportType);
    const query = this._buildQuery(date, filters);
    return Model.find(query).lean();
  }

  async fetchFromExternalApi(reportType, date) {
    // TODO: Implement based on your external API requirements
    return externalApiService.fetchData(reportType, date);
  }

  async storeData(reportType, data) {
    const Model = this.getModel(reportType);
    await Model.bulkWrite(
      data.map(item => ({
        updateOne: {
          filter: { 
            name: item.name,
            date: item.date
          },
          update: { $set: item },
          upsert: true
        }
      }))
    );
  }

  _buildQuery(date, filters) {
    const query = { date };
    
    // Add filters to query
    Object.entries(filters).forEach(([field, value]) => {
      if (value) {
        query[field] = value;
      }
    });
    
    return query;
  }
}

module.exports = new DataService();