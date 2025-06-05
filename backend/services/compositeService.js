const models = require('../models');
const cacheService = require('./cacheService');
const externalApiService = require('./externalApiService');

class CompositeService {
  validTypes = ['campaign', 'country', 'isp', 'subid', 'zone'];

  async fetchFromDatabase(types, date, filters = {}) {
    this._validateTypes(types);
    
    const query = {
      date,
      primary_type: types[0],
      secondary_type: types[1]
    };
    
    // Add filters
    if (filters.primary) {
      query.primary_value = filters.primary;
    }
    if (filters.secondary) {
      query.secondary_value = filters.secondary;
    }
    
    return models.Aggregation.find(query).lean();
  }

  async fetchFromExternalApi(types, date) {
    this._validateTypes(types);
    // TODO: Implement based on your external API requirements
    const apiData = await externalApiService.fetchCompositeData(types, date);
    return this._transformApiData(apiData, types);
  }

  async storeData(types, data) {
    this._validateTypes(types);
    await models.Aggregation.bulkWrite(
      data.map(item => ({
        updateOne: {
          filter: {
            primary_type: item.primary_type,
            primary_value: item.primary_value,
            secondary_type: item.secondary_type,
            secondary_value: item.secondary_value,
            date: item.date
          },
          update: { $set: item },
          upsert: true
        }
      }))
    );
  }

  _validateTypes(types) {
    if (!Array.isArray(types) || types.length !== 2) {
      throw new Error('Composite report requires exactly 2 types');
    }
    
    types.forEach(type => {
      if (!this.validTypes.includes(type.toLowerCase())) {
        throw new Error(`Invalid type: ${type}. Valid types are: ${this.validTypes.join(', ')}`);
      }
    });
  }

  _transformApiData(apiData, types) {
    return apiData.map(item => ({
      primary_type: types[0],
      primary_value: item[`${types[0]}_id`] || item[types[0]] || item.id,
      secondary_type: types[1],
      secondary_value: item[`${types[1]}_id`] || item[types[1]] || item.name,
      date: item.date,
      metrics: {
        clicks: item.clicks || 0,
        conversions: item.conversions || 0,
        cost: item.cost || 0,
        profit: item.profit || 0,
        revenue: item.revenue || 0
      }
    }));
  }
}

module.exports = new CompositeService();