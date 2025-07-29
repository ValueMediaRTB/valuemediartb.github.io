const supplierApiService = require('./supplierAPIService');
const cacheService = require('./cacheService');

class SupplierService {
  constructor() {
    this.CACHE_TTL = 43200; // 12 hours (half a day)
  }

  /**
   * Fetch data from suppliers based on report type
   * @param {string} reportType - Type of data to retrieve (budget, stats, offers, etc.)
   * @param {string} date - Date in YYYY-MM-DD format 
   * @param {Array|string} suppliers - Array of supplier names or 'All' for all suppliers
   * @returns {Promise<Object>} - Supplier report data
   */
  async fetchSupplierData(reportType, date, suppliers) {
    // Validate report type
    const validReportTypes = ['budget' /*,'stats', 'offers', 'campaigns', 'performance'*/];
    if (!validReportTypes.includes(reportType)) {
      throw new Error(`Invalid report type: ${reportType}. Valid types: ${validReportTypes.join(', ')}`);
    }

    // Handle 'All' suppliers
    if (suppliers === 'All' || (Array.isArray(suppliers) && suppliers.includes('All'))) {
      suppliers = supplierApiService.getAllAvailableSuppliers();
    }

    // Ensure suppliers is an array
    if (typeof suppliers === 'string') {
      suppliers = [suppliers];
    }

    // Validate suppliers
    const availableSuppliers = supplierApiService.getAllAvailableSuppliers();
    const invalidSuppliers = suppliers.filter(s => !availableSuppliers.includes(s));
    if (invalidSuppliers.length > 0) {
      throw new Error(`Invalid suppliers: ${invalidSuppliers.join(', ')}. Available: ${availableSuppliers.join(', ')}`);
    }

    // Check cache first
    const cacheKey = `supplier:${reportType}:${date}:${suppliers.sort().join(',')}`;
    
    /*const cachedData = await cacheService.getGeneralData(cacheKey); 
    
    if (cachedData) {
      console.log(`${reportType} data retrieved from cache for suppliers: ${suppliers.join(', ')}`);
      return {
        data: cachedData.data,
        totals: cachedData.totals
        //,cached: true,
        //cache_timestamp: cachedData.timestamp
      };
    }
      uncomment in production */

    // Fetch fresh data from specified suppliers
    console.log(`Fetching fresh ${reportType} data from suppliers: ${suppliers.join(', ')}...`);
    const supplierResponses = await supplierApiService.getSupplierData(reportType, date, suppliers);

    // Process and standardize the data based on report type
    const processedData = this._processSupplierResponses(supplierResponses, reportType);
    const totals = this._calculateTotals(processedData, reportType);

    const result = {
      data: processedData,
      totals: totals
      //,cached: false,
      //timestamp: new Date().toISOString()
    };

    // Cache the result

    //await cacheService.setGeneralData(cacheKey, result, this.CACHE_TTL); uncomment in production

    console.log(`${reportType} data cached for 12 hours`);
    return result;
  }

  /**
   * Process supplier responses into standardized format based on report type
   * @param {Array} responses - Array of supplier responses
   * @param {string} reportType - Type of report being processed
   * @returns {Array} - Processed data
   */
  _processSupplierResponses(responses, reportType) {
    const successfulResponses = responses.filter(response => response.success);
    
    switch (reportType) {
      case 'budget':
        return this._processBudgetResponses(successfulResponses);
      case 'stats':
        return this._processStatsResponses(successfulResponses);
      case 'offers':
        return this._processOffersResponses(successfulResponses);
      case 'campaigns':
        return this._processCampaignsResponses(successfulResponses);
      case 'performance':
        return this._processPerformanceResponses(successfulResponses);
      default:
        return successfulResponses.map(response => response.data);
    }
  }

  /**
   * Process budget-specific responses
   * @param {Array} responses - Array of successful supplier responses
   * @returns {Array} - Processed budget data
   */
  _processBudgetResponses(responses) {
    return responses
      .map(response => (response.data))
      .sort((a, b) => a.supplierName.localeCompare(b.supplierName));
  }

  /**
   * Process stats-specific responses
   * @param {Array} responses - Array of successful supplier responses
   * @returns {Array} - Processed stats data
   */
  _processStatsResponses(responses) {
    return responses
      .map(response => ({
        supplier: response.data.supplier,
        impressions: Number(response.data.impressions) || 0,
        clicks: Number(response.data.clicks) || 0,
        conversions: Number(response.data.conversions) || 0,
        spend: Number(response.data.spend) || 0,
        revenue: Number(response.data.revenue) || 0,
        ctr: response.data.ctr || 0,
        cpm: response.data.cpm || 0,
        cpc: response.data.cpc || 0,
        currency: response.data.currency || 'USD',
        last_updated: response.data.last_updated || response.timestamp
      }))
      .sort((a, b) => a.supplier.localeCompare(b.supplier));
  }

  /**
   * Process offers-specific responses
   * @param {Array} responses - Array of successful supplier responses
   * @returns {Array} - Processed offers data
   */
  _processOffersResponses(responses) {
    return responses
      .flatMap(response => response.data.offers || [])
      .map(offer => ({
        supplier: offer.supplier,
        offer_id: offer.offer_id,
        offer_name: offer.offer_name,
        payout: offer.payout || 0,
        currency: offer.currency || 'USD',
        category: offer.category || 'Unknown',
        countries: offer.countries || [],
        status: offer.status || 'active'
      }))
      .sort((a, b) => a.supplier.localeCompare(b.supplier) || a.offer_name.localeCompare(b.offer_name));
  }

  /**
   * Process campaigns-specific responses
   * @param {Array} responses - Array of successful supplier responses
   * @returns {Array} - Processed campaigns data
   */
  _processCampaignsResponses(responses) {
    return responses
      .flatMap(response => response.data.campaigns || [])
      .map(campaign => ({
        supplier: campaign.supplier,
        campaign_id: campaign.campaign_id,
        campaign_name: campaign.campaign_name,
        status: campaign.status || 'active',
        daily_budget: campaign.daily_budget || 0,
        bid: campaign.bid || 0,
        currency: campaign.currency || 'USD'
      }))
      .sort((a, b) => a.supplier.localeCompare(b.supplier) || a.campaign_name.localeCompare(b.campaign_name));
  }

  /**
   * Process performance-specific responses
   * @param {Array} responses - Array of successful supplier responses
   * @returns {Array} - Processed performance data
   */
  _processPerformanceResponses(responses) {
    return responses
      .map(response => ({
        supplier: response.data.supplier,
        impressions: Number(response.data.impressions) || 0,
        clicks: Number(response.data.clicks) || 0,
        conversions: Number(response.data.conversions) || 0,
        spend: Number(response.data.spend) || 0,
        revenue: Number(response.data.revenue) || 0,
        profit: Number(response.data.revenue) - Number(response.data.spend),
        roas: response.data.spend > 0 ? (Number(response.data.revenue) / Number(response.data.spend)) : 0,
        currency: response.data.currency || 'USD',
        last_updated: response.data.last_updated || response.timestamp
      }))
      .sort((a, b) => a.supplier.localeCompare(b.supplier));
  }

  /**
   * Calculate totals based on report type
   * @param {Array} data - Processed data
   * @param {string} reportType - Type of report
   * @returns {Object} - Calculated totals
   */
  _calculateTotals(data, reportType) {
    switch (reportType) {
      case 'budget':
        return this._calculateBudgetTotals(data);
      case 'stats':
      case 'performance':
        return this._calculateStatsTotals(data);
      case 'offers':
        return this._calculateOffersTotals(data);
      case 'campaigns':
        return this._calculateCampaignsTotals(data);
      default:
        return {
          total_records: data.length,
          suppliers_count: [...new Set(data.map(item => item.supplier))].length,
          last_updated: new Date().toISOString()
        };
    }
  }

  /**
   * Calculate budget totals
   * @param {Array} data - Processed budget data
   * @returns {Object} - Budget totals
   */
  _calculateBudgetTotals(data) {
    const totals = data.reduce((acc, item) => {
      const multiplier = this._getCurrencyMultiplier(item.currency);
      
      acc.total_budget_remaining += item.budget_remaining * multiplier;
      acc.total_daily_budget += item.daily_budget * multiplier;
      acc.total_budget_used += item.budget_used * multiplier;
      acc.suppliers_count += 1;
      
      if (item.budget_remaining === 0) acc.depleted_suppliers += 1;
      if (item.budget_utilization > 80) acc.high_utilization_suppliers += 1;
      
      return acc;
    }, {
      total_budget_remaining: 0,
      total_daily_budget: 0,
      total_budget_used: 0,
      suppliers_count: 0,
      depleted_suppliers: 0,
      high_utilization_suppliers: 0
    });

    totals.overall_utilization = totals.total_daily_budget > 0 ? 
      (totals.total_budget_used / totals.total_daily_budget) * 100 : 0;
    totals.currency = 'USD';
    totals.last_updated = new Date().toISOString();

    return totals;
  }

  /**
   * Calculate stats/performance totals
   * @param {Array} data - Processed stats data
   * @returns {Object} - Stats totals
   */
  _calculateStatsTotals(data) {
    const totals = data.reduce((acc, item) => {
      const multiplier = this._getCurrencyMultiplier(item.currency);
      
      acc.total_impressions += item.impressions || 0;
      acc.total_clicks += item.clicks || 0;
      acc.total_conversions += item.conversions || 0;
      acc.total_spend += (item.spend || 0) * multiplier;
      acc.total_revenue += (item.revenue || 0) * multiplier;
      acc.suppliers_count += 1;
      
      return acc;
    }, {
      total_impressions: 0,
      total_clicks: 0,
      total_conversions: 0,
      total_spend: 0,
      total_revenue: 0,
      suppliers_count: 0
    });

    totals.total_profit = totals.total_revenue - totals.total_spend;
    totals.overall_ctr = totals.total_impressions > 0 ? (totals.total_clicks / totals.total_impressions) * 100 : 0;
    totals.overall_roas = totals.total_spend > 0 ? totals.total_revenue / totals.total_spend : 0;
    totals.currency = 'USD';
    totals.last_updated = new Date().toISOString();

    return totals;
  }

  /**
   * Calculate offers totals
   * @param {Array} data - Processed offers data
   * @returns {Object} - Offers totals
   */
  _calculateOffersTotals(data) {
    const supplierCounts = data.reduce((acc, item) => {
      acc[item.supplier] = (acc[item.supplier] || 0) + 1;
      return acc;
    }, {});

    return {
      total_offers: data.length,
      suppliers_count: Object.keys(supplierCounts).length,
      offers_by_supplier: supplierCounts,
      categories: [...new Set(data.map(item => item.category))],
      countries: [...new Set(data.flatMap(item => item.countries))],
      last_updated: new Date().toISOString()
    };
  }

  /**
   * Calculate campaigns totals
   * @param {Array} data - Processed campaigns data
   * @returns {Object} - Campaigns totals
   */
  _calculateCampaignsTotals(data) {
    const supplierCounts = data.reduce((acc, item) => {
      acc[item.supplier] = (acc[item.supplier] || 0) + 1;
      return acc;
    }, {});

    const totalBudget = data.reduce((sum, item) => {
      const multiplier = this._getCurrencyMultiplier(item.currency);
      return sum + (item.daily_budget * multiplier);
    }, 0);

    return {
      total_campaigns: data.length,
      suppliers_count: Object.keys(supplierCounts).length,
      campaigns_by_supplier: supplierCounts,
      total_daily_budget: totalBudget,
      active_campaigns: data.filter(item => item.status === 'active').length,
      currency: 'USD',
      last_updated: new Date().toISOString()
    };
  }

  /**
   * Determine budget status based on remaining budget
   * @param {Object} budgetData - Budget data for a supplier
   * @returns {string} - Status string
   */
  _getBudgetStatus(budgetData) {
    const remaining = Number(budgetData.budget_remaining);
    const total = Number(budgetData.daily_budget);
    
    if (remaining === 0) return 'depleted';
    if (total === 0) return 'unlimited';
    
    const utilization = ((total - remaining) / total) * 100;
    
    if (utilization >= 90) return 'critical';
    if (utilization >= 70) return 'warning';
    if (utilization >= 50) return 'moderate';
    return 'good';
  }

  /**
   * Simple currency multiplier for USD conversion
   * @param {string} currency - Currency code
   * @returns {number} - Multiplier to convert to USD
   */
  _getCurrencyMultiplier(currency) {
    const rates = {
      'USD': 1,
      'EUR': 1.1,
      'GBP': 1.25,
      'CAD': 0.75
    };
    return rates[currency] || 1;
  }

  /**
   * Hash filters for cache key generation
   * @param {Object} filters - Filters object
   * @returns {string} - Hash string
   */
  _hashFilters(filters) {
    return JSON.stringify(filters).split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);
  }
}

module.exports = new SupplierService();