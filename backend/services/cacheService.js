const redis = require('../config/redis');

class CacheService {
  constructor() {
    this.defaultTTL = 86400; // 24 hours
    this.periodTTL = 43200; // 12 hours for period data (can be different)
    this.MAX_CACHE_SIZE = 500 * 1024 * 1024; // 300MB limit per cache entry
    this.MAX_STRING_LENGTH = 500 * 1024 * 1024; // 500MB string limit for safety
  }
  /**
   * Check if data is too large to cache
   * @param {*} data - Data to check
   * @returns {boolean} - True if data is too large
  */
  _isDataTooLarge(data) {
    try {
      const jsonString = JSON.stringify(data);
      const sizeInBytes = Buffer.byteLength(jsonString, 'utf8');
      
      if (sizeInBytes > this.MAX_CACHE_SIZE) {
        console.warn(`Data too large for cache: ${Math.round(sizeInBytes / 1024 / 1024)}MB (limit: ${Math.round(this.MAX_CACHE_SIZE / 1024 / 1024)}MB)`);
        return true;
      }
      
      if (jsonString.length > this.MAX_STRING_LENGTH) {
        console.warn(`String too long for JSON.stringify: ${Math.round(jsonString.length / 1024 / 1024)}M chars`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.warn('Error checking data size:', error.message);
      return true; // Assume too large if we can't check
    }
  }
  /**
   * Safely stringify data with size checking
   * @param {*} data - Data to stringify
   * @returns {string|null} - JSON string or null if too large
   */
  _safeStringify(data) {
    try {
      if (this._isDataTooLarge(data)) {
        return null;
      }
      return JSON.stringify(data);
    } catch (error) {
      console.error('JSON.stringify error:', error.message);
      return null;
    }
  }
  
  async getGeneralData(key){
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }
  async setGeneralData(key,value, ttl = this.defaultTTL){
    const jsonStrData = this._safeStringify(value);
    if (jsonStrData == null) {
      console.warn(`Skipping cache for ${key} - data too large!`);
      return false;
    }
    try{
      await redis.set(key, JSON.stringify(value), ttl);
      return true;
    }
    catch(error){
      console.error(`Error caching general data for ${key}:`, error.message);
      return false;
    }
  }

  async getDailyData(reportType, date,filters) {
    const key = `report:${reportType}:${date}:${this._hashFilters(filters)}`;
    const dataAndTotals = await redis.get(key);
    return dataAndTotals ? JSON.parse(dataAndTotals) : null;
  }

  async setDailyData(reportType, date, dataAndTotals, filters, ttl = this.defaultTTL) {
    const key = `report:${reportType}:${date}:${this._hashFilters(filters)}`;
    const jsonStrData = this._safeStringify(dataAndTotals);
    if (jsonStrData == null) {
      console.warn(`Skipping cache for ${key} - data too large!`);
      return false;
    }
    try{
      await redis.set(key, JSON.stringify(dataAndTotals), ttl);
      return true;
    }
    catch(error){
      console.error(`Error caching daily data for ${key}:`, error.message);
      return false;
    }
  }

  async getCompositeData(types, date, filters) {
    const key = this._generateCompositeKey(types, date, filters);
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async setCompositeData(types, date, data, filters, ttl = this.defaultTTL) {
    const key = this._generateCompositeKey(types, date, filters);
    const jsonStrData = this._safeStringify(data);
    if (jsonStrData == null) {
      console.warn(`Skipping cache for ${key} - data too large!`);
      return false;
    }
    try{
      await redis.set(key, JSON.stringify(data), ttl);
      return true;
    }
    catch(error){
      console.error(`Error caching composite data for ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Get cached period data for a date range
   * @param {String} periodKey - Pre-generated period cache key
   * @returns {Array|null} - Cached data or null if not found
   */
  async getPeriodData(periodKey) {
    const data = await redis.get(periodKey);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Set cached period data for a date range
   * @param {String} periodKey - Pre-generated period cache key
   * @param {Array} data - Combined data for the period
   * @param {Number} ttl - Time to live in seconds
   */
  async setPeriodData(periodKey, data, ttl = this.periodTTL) {
    const jsonStrData = this._safeStringify(data);
    if(jsonStrData == null){
      console.warn(`Skipping cache for ${periodKey} - data too large!`);
      return false;
    }
    try{
      await redis.set(periodKey, JSON.stringify(data), ttl);
      return true;
    }
    catch(error){
      console.error(`Error caching period data for ${periodKey}:`, error.message);
      return false;
    } 
  }

  /**
   * Clear period cache for a specific pattern (useful when underlying data changes)
   * @param {String} pattern - Pattern to match cache keys (e.g., "period:campaigns:*")
   */
  async clearPeriodCache(pattern) {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(keys);
        console.log(`Cleared ${keys.length} period cache entries matching pattern: ${pattern}`);
      }
    } catch (error) {
      console.error('Error clearing period cache:', error);
    }
  }

  /**
   * Clear all period cache entries
   */
  async clearAllPeriodCache() {
    await this.clearPeriodCache('period:*');
  }

  _generateCompositeKey(types, date, filters = {}) {
    const filterHash = this._hashFilters(filters);
    return `composite:${types.sort().join('_')}:${date}:${filterHash}`;
  }

  _hashFilters(filters) {
    // Simple hash implementation - replace with better one if needed
    return JSON.stringify(filters).split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);              
  }

  /**
   * Flush all cache data (including both daily and period data)
   */
  async flush() {
    await redis.flush();
  }
}

module.exports = new CacheService();