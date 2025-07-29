// 1. Create a new SupplierApiService for all supplier API interactions
// services/supplierApiService.js
const axios = require('axios');
const { default: PQueue } = require('p-queue');
const {suppliers} = require("../config/suppliers.js");

class SupplierApiService {
  constructor() {
    this.queue = new PQueue({ concurrency: 10 });
    this.timeout = 10000; // 10 seconds timeout
    this.accessTokens = {};
  }

  /**
   * Generic supplier API request handler
   * @param {Object} config - API configuration
   * @param {string} config.url - API endpoint
   * @param {Object} config.headers - Request headers
   * @param {string} config.method - HTTP method
   * @param {Object} config.params - URL parameters
   * @param {Object} config.body - Request body
   * @param {Function} config.transformer - Data transformation function
   * @returns {Promise<Object>} - Standardized response
   */
  async makeRequestAxios(config) {
    console.log('Sending axios request from supplierAPIService: '+config.url);
    return this.queue.add(async () => {
      try {
        const response = await axios({
          url: config.url,
          method: config.method || 'GET',
          headers: config.headers || {},
          params: config.params || {},
          data: config.body || {},
          timeout: this.timeout
        });
        const rawData = response.data;
        const transformedData = config.transformer ? 
          await config.transformer(rawData) : 
          rawData;

        return {
          success: true,
          data: transformedData,
          supplier: config.supplier,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error(`Error fetching from ${config.supplier}:`, error.message);
        return {
          success: false,
          error: error.message,
          supplier: config.supplier,
          timestamp: new Date().toISOString()
        };
      }
    });
  }
  async makeRequest(config) {
    console.log('Sending fetch request from supplierAPIService: ' + config.url);

    return this.queue.add(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
        // Build URL with query parameters
        const urlWithParams = config.params
            ? `${config.url}?${new URLSearchParams(config.params).toString()}`
            : config.url;

        const fetchOptions = {
            method: config.method || 'GET',
            headers: config.headers || {},
            signal: controller.signal
        };

        // Only add body if method allows it
        const method = (config.method || 'GET').toUpperCase();
        if (method !== 'GET' && method !== 'HEAD') {
            // Add default content-type if not present
            if (!fetchOptions.headers['Content-Type']) {
                fetchOptions.headers['Content-Type'] = 'application/json';
                fetchOptions.body = JSON.stringify(config.body || {});
            }
            else if(fetchOptions.headers['Content-Type'] == 'application/x-www-form-urlencoded'){
                fetchOptions.body = config.body;
            }
            else{
                fetchOptions.body = JSON.stringify(config.body || {});
            }
        }

        const response = await fetch(urlWithParams, fetchOptions);
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const rawData = await response.json();
        const transformedData = config.transformer
            ? await config.transformer(rawData)
            : rawData;

        return {
            success: true,
            data: transformedData,
            supplier: config.supplier,
            timestamp: new Date().toISOString()
        };

        } catch (error) {
        clearTimeout(timeoutId);
        console.error(`Error fetching from ${config.supplier}:`, error.message);
        return {
            success: false,
            error: error.message,
            supplier: config.supplier,
            timestamp: new Date().toISOString()
        };
        }
    });
  }

  // Specific supplier budget fetchers
  // Specific supplier methods for different report types
  // Specific supplier methods for different report types
  async getClickadillaBudget(date) {
    const tokens = JSON.parse(process.env.SUPPLIER_TOKENS);
    
    return this.makeRequest({
      supplier: 'clickadilla',
      url: suppliers.clickadilla.url+suppliers.clickadilla.endpoints.budget,
      headers: {
        'Authorization': `Bearer ${tokens["CLICKADILLA"]["ACCESS_TOKEN"]}`
      },
      method:'GET',
      params: {
        group:'date',
        start_date:date,
        end_date:date
      },
      transformer: (data) => ({
        supplierName: 'clickadilla',
        budgetRemaining: data.data.balance || 0,
        lastUpdated: new Date()
      })
    });
  }

  async exoclickAuth(){
    const tokens = JSON.parse(process.env.SUPPLIER_TOKENS);
    const exoclickLogin = JSON.parse(process.env.EXOCLICK);
    const result = await this.makeRequest({
      supplier: 'exoclick',
      url: suppliers.exoclick.url+suppliers.exoclick.endpoints.auth,
      headers: {
        'Content-Type':'application/json',
        'Authorization': `Bearer ${tokens["EXOCLICK"]["AUTH_KEY"]}`
      },
      method:"POST",
      body:{
        username:exoclickLogin["USERNAME"],
        password:exoclickLogin["PASSWORD"],
        api_token:tokens["EXOCLICK"]["AUTH_KEY"]
      },
      transformer: (data) => ({
        supplierName: 'exoclick',
        accessToken: data.token || null
      })
    });
    if(!result.data.accessToken)
        throw new Error("Exoclick authentication failed!");
    this.accessTokens["exoclick"] = result.data.accessToken;
  }
  async getExoclickBudget(date) {
    const tokens = JSON.parse(process.env.SUPPLIER_TOKENS);
    if(!this.accessTokens["exoclick"]){
        await this.exoclickAuth();
    }
    return this.makeRequest({
      supplier: 'exoclick',
      url: suppliers.exoclick.url+suppliers.exoclick.endpoints.budget,
      headers: {
        'Content-Type':'application/json',
        'Authorization': `Bearer ${this.accessTokens["exoclick"]}`
      },
      params:{
        "date-from":date,
        "date-to":date
      },
      method:"GET",
      transformer: (data) => ({
        supplierName: 'exoclick',
        budgetRemaining: data.result.balance || 0,
        lastUpdated: new Date()
      })
    });
  }

  async getHilltopAdsBudget() {
    const tokens = JSON.parse(process.env.SUPPLIER_TOKENS);
    return this.makeRequest({
      supplier: 'hilltopads',
      url: suppliers.hilltopads.url+suppliers.hilltopads.endpoints.budget,
      method:"GET",
      params: {
        key:tokens["HILLTOPADS"]["ACCESS_TOKEN"]
      },
      transformer: (data) => ({
        supplierName: 'hilltopads',
        budgetRemaining: data.result.balance || 0,
        lastUpdated: data.updated_at
      })
    });
  }

  async getKadamBudget() {
    const tokens = JSON.parse(process.env.SUPPLIER_TOKENS);
    
    return this.makeRequest({
      supplier: 'kadam',
      url: suppliers.kadam.url+suppliers.kadam.endpoints.budget,
      headers: {
        'Authorization': `Bearer ${tokens["KADAM"]["ACCESS_TOKEN"]}`
      },
      params: {
        app_id:tokens["KADAM"]["APP_ID"],
        client_id:tokens["KADAM"]["CLIENT_ID"]
      },
      method:"GET",
      transformer: (data) => ({
        supplierName: 'kadam',
        budgetRemaining: data.response?.balance || 0,
        lastUpdated: new Date()
      })
    });
  }

  async getOnclickaBudget(date) {
    const tokens = JSON.parse(process.env.SUPPLIER_TOKENS);
    
    return this.makeRequest({
      supplier: 'onclicka',
      url: suppliers.onclicka.url+suppliers.onclicka.endpoints.budget,
      headers: {
        'Authorization': `Bearer ${tokens["ONCLICKA"]["ACCESS_TOKEN"]}`
      },
      method:'GET',
      params: {
        group:'date',
        start_date:date,
        end_date:date
      },
      transformer: (data) => ({
        supplierName: 'onclicka',
        budgetRemaining: data.data.balance || 0,
        lastUpdated: new Date()
      })
    });
  }

  async getTrafficJunkyBudget(date) {
    const tokens = JSON.parse(process.env.SUPPLIER_TOKENS);
    
    return{supplierName:'trafficjunky',budgetRemaining:0}

    return this.makeRequest({
      supplier: 'trafficjunky',
      url: suppliers.trafficjunky.url+suppliers.trafficjunky.endpoints.stats,
      headers: {
        'X-API-Key': tokens["TRAFFICJUNKY"]["ACCESS_KEY"],
        'Accept': 'application/json'
      },
      params: {
        date: date
      },
      transformer: (data) => ({
        supplierName: 'trafficjunky',
        budgetRemaining: data.budget_remaining || 0,
        lastUpdated: data.last_updated
      })
    });
  }

  async getTrafficShopBudget() {
    const tokens = JSON.parse(process.env.SUPPLIER_TOKENS);
    
    return this.makeRequest({
      supplier: 'trafficshop',
      url: suppliers.trafficshop.url+suppliers.trafficshop.endpoints.budget,
      transformer: (data) => ({
        supplierName: 'trafficshop',
        budgetRemaining: data.advertiser.balance || 0,
        lastUpdated: new Date()
      })
    });
  }
  async trafficStarsAuth() {
    const tokens = JSON.parse(process.env.SUPPLIER_TOKENS);
    const result = await this.makeRequest({
      supplier: 'trafficstars',
      url: suppliers.trafficstars.url+suppliers.trafficstars.endpoints.auth,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      method: 'POST',
      body:`grant_type=refresh_token&refresh_token=${tokens["TRAFFICSTARS"]["API_TOKEN"]}`,
      transformer: (data) => ({
        supplierName: 'trafficstars',
        accessToken: data.access_token || null
      })
    });
    console.log(result);
    if(!result.data.accessToken)
        throw new Error("TrafficStars authentication failed!");
    this.accessTokens["trafficstars"] = result.data.accessToken;
  }
  async getTrafficStarsBudget() {
    const tokens = JSON.parse(process.env.SUPPLIER_TOKENS);
    if(!this.accessTokens["trafficstars"])
        await this.trafficStarsAuth();

    return this.makeRequest({
      supplier: 'trafficstars',
      url: suppliers.trafficstars.url+suppliers.trafficstars.endpoints.budget,
      headers: {
        'Authorization': `bearer ${this.accessTokens["trafficstars"]}`
      },
      method:"GET",
      transformer: (data) => ({
        supplierName: 'trafficstars',
        budgetRemaining: data.balance || 0,
        lastUpdated: new Date()
      })
    });
  }
  async twinRedAuth(){ 
    let tokens;
    try {
        tokens = JSON.parse(process.env.SUPPLIER_TOKENS);
    } catch (error) {
        console.error('Error parsing SUPPLIER_TOKENS:', error);
        throw new Error('Invalid SUPPLIER_TOKENS environment variable');
    }
    
    const result = await this.makeRequest({
      supplier: 'twinred',
      url: suppliers.twinred.url+suppliers.twinred.endpoints.auth,
      headers: {
        'Content-Type': `application/x-www-form-urlencoded`
      },
      method: "POST",
      body:`grant_type=client_credentials&client_id=${tokens["TWINRED"]["ID"]}&client_secret=${tokens["TWINRED"]["SECRET"]}`,
      transformer: (data) => ({
        supplierName: 'twinred',
        accessToken: data.access_token || null
      })
    });
    if(!result.data.accessToken)
        throw new Error("TwinRed authentication failed!");
    this.accessTokens["twinred"] = result.data.accessToken;
  }
  async getTwinRedBudget(date) {
    const tokens = JSON.parse(process.env.TOKENS);
    //if(!this.accessTokens["twinred"])
        //await this.twinRedAuth();
    let urlString = `${suppliers.twinred.url}${suppliers.twinred.endpoints.stats}?dimensions=campaign&startDate=${date}&endDate=${date}`
    
    return this.makeRequest({
      supplier: 'twinred',
      url: urlString,
      method: "GET",
      headers: {
        'Authorization': `Bearer ${this.accessTokens["twinred"]}`
      },
      transformer: (data) => ({
        supplierName: 'twinred',
        budgetRemaining: data[0].measures?.cost || 0,
        lastUpdated: new Date()
      })
    });
  }

  /**
   * Get all available suppliers
   * @returns {Array} - Array of supplier names
   */
  getAllAvailableSuppliers() {
    return [
      'clickadilla',
      'exoclick',
      'hilltopads',
      'kadam',
      'onclicka',
      'trafficjunky',
      'trafficshop',
      'trafficstars',
      'twinred'
    ];
  }

  /**
   * Fetch data from specified suppliers based on report type
   * @param {string} reportType - Type of data to retrieve
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {Array} suppliers - Array of supplier names
   * @returns {Promise<Array>} - Array of supplier responses
   */
  async getSupplierData(reportType, date, suppliers) {
    const validReportTypes = ['budget' /*,'stats', 'offers', 'campaigns', 'performance'*/];
    if (!validReportTypes.includes(reportType)) {
      throw new Error(`Invalid report type: ${reportType}`);
    }

    const supplierPromises = suppliers.map(supplier => {
      switch (reportType) {
        case 'budget':
          return this._getBudgetForSupplier(supplier, date);
        case 'stats':
          return this._getStatsForSupplier(supplier, date);
        case 'offers':
          return this._getOffersForSupplier(supplier, date);
        case 'campaigns':
          return this._getCampaignsForSupplier(supplier, date);
        case 'performance':
          return this._getPerformanceForSupplier(supplier, date);
        default:
          return Promise.resolve({
            success: false,
            error: `Unknown report type: ${reportType}`,
            supplier: supplier
          });
      }
    });

    const results = await Promise.allSettled(supplierPromises);
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          error: result.reason.message,
          supplier: suppliers[index],
          timestamp: new Date().toISOString()
        };
      }
    });
  }

  /**
   * Get budget data for a specific supplier
   * @param {string} supplier - Supplier name
   * @param {string} date - Date
   * @param {string|number} user - User identifier
   * @param {Object} filters - Filters
   * @returns {Promise} - Budget data promise
   */
  _getBudgetForSupplier(supplier, date) {
    switch (supplier) {
      case 'clickadilla':
        return this.getClickadillaBudget(date);
      case 'exoclick':
        return this.getExoclickBudget(date);
      case 'hilltopads':
        return this.getHilltopAdsBudget(date);
      case 'kadam':
        return this.getKadamBudget(date);
      case 'onclicka':
        return this.getOnclickaBudget(date);
      case 'trafficjunky':
        return this.getTrafficJunkyBudget(date);
      case 'trafficshop':
        return this.getTrafficShopBudget(date);
      case 'trafficstars':
        return this.getTrafficStarsBudget(date);
      case 'twinred':
        return this.getTwinRedBudget(date);
      default:
        return Promise.resolve({
          success: false,
          error: `Unknown supplier: ${supplier}`,
          supplier: supplier
        });
    }
  }

  /**
   * Get stats data for a specific supplier (placeholder for future implementation)
   * @param {string} supplier - Supplier name
   * @param {string} date - Date
   * @param {string|number} user - User identifier
   * @param {Object} filters - Filters
   * @returns {Promise} - Stats data promise
   */
  _getStatsForSupplier(supplier, date, user, filters) {
    // Placeholder - implement specific stats endpoints for each supplier
    return Promise.resolve({
      success: false,
      error: `Stats not implemented for ${supplier}`,
      supplier: supplier
    });
  }

  /**
   * Get offers data for a specific supplier (placeholder for future implementation)
   * @param {string} supplier - Supplier name
   * @param {string} date - Date
   * @param {string|number} user - User identifier
   * @param {Object} filters - Filters
   * @returns {Promise} - Offers data promise
   */
  _getOffersForSupplier(supplier, date, user, filters) {
    // Placeholder - implement specific offers endpoints for each supplier
    return Promise.resolve({
      success: false,
      error: `Offers not implemented for ${supplier}`,
      supplier: supplier
    });
  }

  /**
   * Get campaigns data for a specific supplier (placeholder for future implementation)
   * @param {string} supplier - Supplier name
   * @param {string} date - Date
   * @param {string|number} user - User identifier
   * @param {Object} filters - Filters
   * @returns {Promise} - Campaigns data promise
   */
  _getCampaignsForSupplier(supplier, date, user, filters) {
    // Placeholder - implement specific campaigns endpoints for each supplier
    return Promise.resolve({
      success: false,
      error: `Campaigns not implemented for ${supplier}`,
      supplier: supplier
    });
  }

  /**
   * Get performance data for a specific supplier (placeholder for future implementation)
   * @param {string} supplier - Supplier name
   * @param {string} date - Date
   * @param {string|number} user - User identifier
   * @param {Object} filters - Filters
   * @returns {Promise} - Performance data promise
   */
  _getPerformanceForSupplier(supplier, date, user, filters) {
    // Placeholder - implement specific performance endpoints for each supplier
    return Promise.resolve({
      success: false,
      error: `Performance not implemented for ${supplier}`,
      supplier: supplier
    });
  }

  /**
   * Get configured suppliers from environment or filters
   * @param {Object} filters - Request filters
   * @returns {Array} - Array of supplier configurations
   */
  _getConfiguredSuppliers(filters) {
    // This could be configurable via environment variables or database
    const defaultSuppliers = [
      { supplier: 'binom', user: null },
      { supplier: 'daisycon', user: filters.daisycon_user || 1 },
      { supplier: 'tradetracker', user: filters.tradetracker_user || 1 },
      { supplier: 'adpump', user: filters.adpump_user || 1 },
      { supplier: 'partnerboost', user: filters.partnerboost_user || 1 }
    ];

    // Filter based on request filters if specified
    if (filters.suppliers && Array.isArray(filters.suppliers)) {
      return defaultSuppliers.filter(s => filters.suppliers.includes(s.supplier));
    }

    return defaultSuppliers;
  }

}

module.exports = new SupplierApiService();
