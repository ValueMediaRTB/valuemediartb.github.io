const redis = require('../config/redis');

class CacheService {
  constructor() {
    this.defaultTTL = 86400; // 24 hours
  }

  async getDailyData(reportType, date) {
    const key = `report:${reportType}:${date}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async setDailyData(reportType, date, data, ttl = this.defaultTTL) {
    const key = `report:${reportType}:${date}`;
    await redis.set(key, JSON.stringify(data), ttl);
  }

  async getCompositeData(types, date, filters) {
    const key = this._generateCompositeKey(types, date, filters);
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async setCompositeData(types, date, data, filters, ttl = this.defaultTTL) {
    const key = this._generateCompositeKey(types, date, filters);
    await redis.set(key, JSON.stringify(data), ttl);
  }

  _generateCompositeKey(types, date, filters = {}) {
    const filterHash = this._hashFilters(filters);
    return `composite:${types.sort().join('_')}:${date}:${filterHash}`;
  }

  _hashFilters(filters) {
    // Simple hash implementation - replace with better one if needed
    return JSON.stringify(filters).split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);              
  }
}

module.exports = new CacheService();