const cacheService = require('../services/cacheService');
const dataService = require('../services/dataService');
const supplierService = require('../services/supplierService');
const compositeService = require('../services/compositeService');
const { Parser } = require('json2csv');
const fs = require('fs');
const connectDB = require('../config/db.js');
const jobManager = require('../services/jobManager.js');

class DataController {
  connected = -1
  binom_traffic_sources = [282,284,303,313,341,363,381,388,402,421,430,432,434,435,436,437];
  // Chunk size for processing large datasets
  CHUNK_SIZE = 1000;
  
  async isDBConnected(){
    if(this.connected === -1)
      this.connected = await connectDB();
    return this.connected
  }

  async getReport(reportType, startDate, endDate, filters = {},jobId,socket) {
    try {
      if (jobId) {
        await jobManager.updateJob(jobId, {
          status: 'processing',
          progress: 5,
          message: `Starting ${reportType} report generation...`
        },socket);
      } 
      // Budget report
      if(reportType === 'budget'){ //check all 'supplier' reports here, not only budget
        const dates = this._getDateRange(new Date(startDate), new Date(endDate));
        let allSupplierResults = [], allSupplierTotals = [];
        const suppliers = filters.find(f=>f.type === 'suppliers');
        for (const date of dates) {
          let {data:suppliersData,totals:suppliersTotal} = await supplierService.fetchSupplierData(reportType, date, suppliers.value);
          
          /** TODO combine suppliersData and suppliersTotal into allSupplierResults and allSupplierTotals**/

          allSupplierResults = [...allSupplierResults,...suppliersData];
          allSupplierTotals = suppliersTotal;
        }
        return {data:allSupplierResults,totals:allSupplierTotals};
      }
      else{// Binom report
        // leave only 'traffic_sources' filter, others are not relevant in backend
        if(filters && filters.some(f=>f.type === 'traffic_source')){
          const ts_filter = filters.find(f=>f.type === 'traffic_source');
          filters = {traffic_sources: ts_filter.split(",").map(s=>s.trim()).map(s=>parseInt(s,10)).sort((a,b)=>a-b)}
        }
        else
          filters = {traffic_sources:this.binom_traffic_sources};
        if (reportType.includes('_')) {
          const types = reportType.split('_');
          if(types.length > 2){
            console.error("Error in DataController::getReport(): too many group members (more than 2)");
            return null;
          }
          return this._getCompositeReport(types, startDate, endDate, filters,jobId,socket);
        }
        return this._getSingleReport(reportType, startDate, endDate, filters,jobId,socket);
      }
    } catch (error) {
      console.error(`Error getting report ${reportType}:`, error);
      // Update job with error if job ID provided
      if (jobId) {
        await jobManager.updateJob(jobId, {
          status: 'error',
          progress: 100,
          message: `Report generation failed: ${error.message}`,
          error: error.message
        });
      }
      throw error;
    }
  }

  async deleteDBData(dataType,startDate,endDate,filters) {}

  async _getSingleReport(reportType, startDate, endDate, filters,jobId,socket) {
    // Check if combined data is already cached for this period
    /*const periodCacheKey = `period:${reportType}:${startDate}:${endDate}:${this._hashFilters(filters)}`;
    let cachedPeriodData = await cacheService.getPeriodData(periodCacheKey);
    
    if (cachedPeriodData) {
      console.log('Found cached period data for', reportType, startDate, 'to', endDate);
      return {data:cachedPeriodData.data,totals:cachedPeriodData.totals};
    }*/
    // Implementation for single table reports
    const dates = this._getDateRange(new Date(startDate), new Date(endDate));
    let allResults = [], allTotals = [];
    let overallProgress, dayCounter = 0;

    const datesInMonthlyIntervals = this._chunkArray(dates,31);
    let monthlyIntervalsCount = datesInMonthlyIntervals.length;
    let monthlyIntervalsIndex = 0
    do{
      let monthlyResults = [], monthlyTotals = [];
      for (const date of datesInMonthlyIntervals[monthlyIntervalsIndex]) {
        let progressInterval;
        if (jobId) {
          overallProgress = 5 + (dayCounter*85)/dates.length;
          progressInterval = setInterval(async () => {
            const currentJob = await jobManager.getJob(jobId);
            if (currentJob && currentJob.status === 'processing') {
              await jobManager.updateJob(jobId, {
                progress: overallProgress,
                message: `Processing single report for date ${date} (${dayCounter+1} / ${dates.length}) ...`
              }, socket);
            } else {
              clearInterval(progressInterval);
            }
          }, 5000);
        }
        let cachedDataAndTotals = await cacheService.getDailyData(reportType, date,filters);
        let data,totals;
        
        if (!cachedDataAndTotals) {
          if(await this.isDBConnected()){
            data = await dataService.fetchFromDatabase(reportType, date, filters);
          }
          else{
            console.warn("Not connected to DB!");
          }
          
          if (data.length > 0) {
            console.log("Fetched from database (single) for ",date);
            totals = await this.processDataInChunks(data,'getTotals'); // calculate totals
            const cacheSuccess = await cacheService.setDailyData(reportType, date, {data:data,totals:totals},filters);
            if (!cacheSuccess) {
              console.log(`Daily data too large to cache for ${reportType} on ${date}`);
            }
          } else {
            console.log('Retrieving from external api...');
            // Try external API if no data in DB
            data = await dataService.fetchFromExternalApi(reportType, date, filters); 

            console.log("Data length:"+data.length);
            if (data.length > 0) {
              if(await this.isDBConnected()){
                await dataService.storeData(reportType, data, date, filters); 
                totals = await this.processDataInChunks(data,'getTotals'); // calculate totals
                const cacheSuccess = await cacheService.setDailyData(reportType, date, {data:data,totals:totals},filters);
                if (!cacheSuccess) {
                  console.log(`Daily data too large to cache for ${reportType} on ${date}`);
                }
              }
              else{
                console.warn("Not connected to DB!");
              }
            } else {
              console.log('Data is empty');
            }
          }
        }
        else{
            console.log("Fetched daily data from Redis cache for ",date);
        }
        
        if(!cachedDataAndTotals){
          cachedDataAndTotals = {data:data,totals:totals};
        }
        // Process data in chunks to avoid stack overflow and remove traffic_sources
        const cleanedData = await this.processDataInChunks(cachedDataAndTotals.data,'');
        monthlyResults = monthlyResults.concat(cleanedData);
        monthlyTotals.push(cachedDataAndTotals.totals);
        clearInterval(progressInterval);
        dayCounter+=1;
      }
      let monthlyCombinedResult, monthlyCombinedTotals;
      if(datesInMonthlyIntervals[monthlyIntervalsIndex].length > 1){
        // Combine data across all dates
        monthlyCombinedResult = dataService.combineDataAcrossDays(monthlyResults,reportType);
        monthlyCombinedTotals = monthlyTotals[0];
        for(let crtTotal of monthlyTotals.slice(1)){
          monthlyCombinedTotals = dataService.combineRecords(monthlyCombinedTotals,crtTotal);
        }
        // Cache the combined result for this period
        /*const cacheSuccess = await cacheService.setPeriodData(periodCacheKey, {data:combinedResult,totals:combinedTotals});
        if (cacheSuccess) {
          console.log('Cached period data for', reportType, startDate, 'to', endDate);
        } else {
          console.log('Period data too large to cache for', reportType, startDate, 'to', endDate);
        }*/
      }
      else{
        monthlyCombinedResult = monthlyResults;
        monthlyCombinedTotals = monthlyTotals[0];
      }
      allResults = allResults.concat(monthlyCombinedResult);
      allTotals.push(monthlyCombinedTotals);
      monthlyIntervalsIndex += 1;
      monthlyResults = null;
      monthlyTotals = null;
    } while(monthlyIntervalsIndex < monthlyIntervalsCount);

    if(allTotals.length > 1){
      let allCombinedResults,allCombinedTotals;
      allCombinedResults = dataService.combineDataAcrossDays(allResults,reportType);
      allCombinedTotals = allTotals[0];
      for(let crtTotal of allTotals.slice(1)){
        allCombinedTotals = dataService.combineRecords(allCombinedTotals,crtTotal);
      }
      return {data:allCombinedResults,totals:allCombinedTotals}
    }
    else{
      return {data:allResults,totals:allTotals[0]};
    }
  }

  async _getCompositeReport(types, startDate, endDate, filters,jobId,socket) {
    // Check if combined data is already cached for this period
    /*const periodCacheKey = `period:${types.sort().join('_')}:${startDate}:${endDate}:${this._hashFilters(filters)}`;
    let cachedPeriodData = await cacheService.getPeriodData(periodCacheKey);

    if (cachedPeriodData) {
      console.log('Found cached period data for', types.sort().join('_'), startDate, 'to', endDate);
      return {data:cachedPeriodData.data,totals:cachedPeriodData.totals};
    }*/
    // Implementation for composite reports
    const dates = this._getDateRange(new Date(startDate), new Date(endDate));
    let allResults = [], allTotals = [];

    const datesInMonthlyIntervals = this._chunkArray(dates,31);
    let overallProgress,dayCounter = 0;
    let monthlyIntervalsCount = datesInMonthlyIntervals.length;
    let monthlyIntervalsIndex = 0
    do{
      let monthlyResults = [], monthlyTotals = [];
      for (const date of datesInMonthlyIntervals[monthlyIntervalsIndex]) {
        let progressInterval;
         if (jobId) {
          overallProgress = 5 + (dayCounter*85)/dates.length;
          progressInterval = setInterval(async () => {
            const currentJob = await jobManager.getJob(jobId);
            if (currentJob && currentJob.status === 'processing') {
              await jobManager.updateJob(jobId, {
                progress: overallProgress,
                message: `Processing composite report for date ${date} (${dayCounter+1} / ${dates.length}) ...`
              }, socket);
            } else {
              clearInterval(progressInterval);
            }
          }, 5000);
        }
        let cachedDataAndTotals = await cacheService.getCompositeData(types, date, filters);
        let data = [],totals;
        
        if (!cachedDataAndTotals) {
          if(await this.isDBConnected()){
            data = await compositeService.fetchFromDatabase(types, date, filters); 
          }
          else {
            console.warn("Not connected to DB!");
          }
          
          if (data.length > 0) {
            console.log("Fetched from database (composite) for ",date);
            totals = await this.processDataInChunks(data,'getTotals'); // calculate totals
            const cacheSuccess = await cacheService.setCompositeData(types, date, {data:data,totals:totals}, filters);
            if (!cacheSuccess) {
              console.log(`Composite data too large to cache for ${types.join('_')} on ${date}`);
            } 
          } else {
            // Try external API if no data in DB
            data = await compositeService.fetchFromExternalApi(types, date, filters);
            console.log("Fetched data from external API (composite) ")
            
            if (data.length > 0) {
              if(await this.isDBConnected()){
                await compositeService.storeData(types, data, filters);
                totals = await this.processDataInChunks(data,'getTotals'); // calculate totals
                const cacheSuccess = await cacheService.setCompositeData(types, date, {data:data,totals:totals}, filters);
                if (!cacheSuccess) {
                  console.log(`Composite data too large to cache for ${types.join('_')} on ${date}`);
                }
              }
              else 
                console.warn("Not connected to DB!");
            }
          }
        }
        else{
            console.log("Fetched daily data from Redis cache for ",date);
        }
        
        if(!cachedDataAndTotals){
          cachedDataAndTotals = {data:data,totals:totals};
        }
        // Process data and remove traffic_sources
        const cleanedData = await this.processDataInChunks(cachedDataAndTotals.data,'');
        monthlyResults = monthlyResults.concat(cleanedData);
        monthlyTotals.push(cachedDataAndTotals.totals);
        dayCounter +=1;
        clearInterval(progressInterval);
        //allResults = data.map(({traffic_sources,...restOfData})=>restOfData); works for large datasets
      }
      let monthlyCombinedResult, monthlyCombinedTotals;
      if(datesInMonthlyIntervals[monthlyIntervalsIndex].length > 1){
        // Combine data across all dates for composite reports
        monthlyCombinedResult = dataService.combineCompositeDataAcrossDays(monthlyResults, types);
        monthlyCombinedTotals = monthlyTotals[0];
        for(let crtTotal of monthlyTotals.slice(1)){
          monthlyCombinedTotals = dataService.combineRecords(monthlyCombinedTotals,crtTotal);
        }// Try to cache the combined result for this period
        /*const cacheSuccess = await cacheService.setPeriodData(periodCacheKey, {data:combinedResult,totals:combinedTotals});
        if (cacheSuccess) {
          console.log('Cached period data for', types.join('_'), startDate, 'to', endDate);
        } else {
          console.log('Period data too large to cache for', types.join('_'), startDate, 'to', endDate);
        }*/
      }
      else{
        monthlyCombinedResult = monthlyResults;
        monthlyCombinedTotals = monthlyTotals[0];
      }
      allResults = allResults.concat(monthlyCombinedResult);
      allTotals.push(monthlyCombinedTotals);
      monthlyIntervalsIndex += 1;
      monthlyResults = null;
      monthlyTotals = null;
    } while(monthlyIntervalsIndex < monthlyIntervalsCount);
    if(allTotals.length > 1){
      let allCombinedResults,allCombinedTotals;
      allCombinedResults = dataService.combineCompositeDataAcrossDays(allResults,types);
      allCombinedTotals = allTotals[0];
      for(let crtTotal of allTotals.slice(1)){
        allCombinedTotals = dataService.combineRecords(allCombinedTotals,crtTotal);
      }
      return {data:allCombinedResults,totals:allCombinedTotals}
    }
    else{
      return {data:allResults,totals:allTotals[0]};
    }
  }

  /**
 * Process large datasets in chunks to avoid stack overflow and remove traffic_sources
 * @param {Array} data - The data array to process
 * @param {Array} operation - The operation applied to the data
 * @returns {Array} - Processed data with traffic_sources removed and totals at the beginning
 */
async processDataInChunks(data,operation) {
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }
  if(operation == 'getTotals'){
    // Initialize totals for aggregation
    let totals = {
      cl: 0,
      cv: 0,
      cost: 0,
      pft: 0,
      rev: 0,
      // For weighted averages - we'll store weighted sums and divide at the end
      cpcWeightedSum: 0,
      epcWeightedSum: 0,
      crWeightedSum: 0,
      roiWeightedSum: 0,
      totalCpcWeight: 0, // Total clicks for CPC weighting
      totalEpcWeight: 0, // Total clicks for EPC weighting
      totalCrWeight: 0,  // Total clicks for CR weighting
      totalRoiWeight: 0  // Total cost for ROI weighting
    };

    const results = [];
    
    // Process data in chunks to avoid stack overflow
    for (let i = 0; i < data.length; i += this.CHUNK_SIZE) {
      const chunk = data.slice(i, i + this.CHUNK_SIZE);
      
      // Process chunk efficiently without destructuring
      const processedChunk = chunk.map(item => {
        if (!item || typeof item !== 'object') return item;
        
        // Accumulate totals while processing
        totals.cl += Number(item.cl) || 0;
        totals.cv += Number(item.cv) || 0;
        totals.cost += Number(item.cost) || 0;
        totals.pft += Number(item.pft) || 0;
        totals.rev += Number(item.rev) || 0;
        
        // For weighted averages - weight by clicks for CPC, EPC, CR
        const itemClicks = Number(item.cl) || 0;
        const itemCost = Number(item.cost) || 0;
        
        if (itemClicks > 0) {
          // CPC: weight by clicks
          totals.cpcWeightedSum += itemClicks * (Number(item.cpc) || 0);
          totals.totalCpcWeight += itemClicks;
          
          // EPC: weight by clicks
          totals.epcWeightedSum += itemClicks * (Number(item.epc) || 0);
          totals.totalEpcWeight += itemClicks;
          
          // CR: weight by clicks
          totals.crWeightedSum += itemClicks * (Number(item.cr) || 0);
          totals.totalCrWeight += itemClicks;
        }
        
        if (itemCost > 0) {
          // ROI: weight by cost
          totals.roiWeightedSum += itemCost * (Number(item.roi) || 0);
          totals.totalRoiWeight += itemCost;
        }
      });
      
      results.push(...processedChunk);
      
      // Allow event loop to process other tasks
      if (i % (this.CHUNK_SIZE * 10) === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    
    // Calculate final averages for totals
    const aggregatedTotals = {
      name: 'Totals', // Identifier for the totals row
      cl: totals.cl,
      cv: totals.cv,
      cost: totals.cost,
      pft: totals.pft,
      rev: totals.rev,
      cpc: totals.totalCpcWeight > 0 ? totals.cpcWeightedSum / totals.totalCpcWeight : 0,
      epc: totals.totalEpcWeight > 0 ? totals.epcWeightedSum / totals.totalEpcWeight : 0,
      cr: totals.totalCrWeight > 0 ? totals.crWeightedSum / totals.totalCrWeight : 0,
      roi: totals.totalRoiWeight > 0 ? totals.roiWeightedSum / totals.totalRoiWeight : 0
    };
    // Return totals at the beginning, followed by individual records
    return aggregatedTotals;
  }
  else{ 
    // do usual processing - remove 'traffic_sources' from the data
    const results = [];
    
    // Process data in chunks to avoid stack overflow
    for (let i = 0; i < data.length; i += this.CHUNK_SIZE) {
      const chunk = data.slice(i, i + this.CHUNK_SIZE);
      
      // Process chunk efficiently without destructuring
      const processedChunk = chunk.map(item => {
        if (!item || typeof item !== 'object') return item;
        
        // Create new object without traffic_sources
        const newItem = {};
        for (const key in item) {
          if (key !== 'ts' && item.hasOwnProperty(key)) {
            newItem[key] = item[key];
          }
        }
        return newItem;
      });
      
      results.push(...processedChunk);
      
      // Allow event loop to process other tasks
      if (i % (this.CHUNK_SIZE * 10) === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    
    return results;
  }
}

  /**
   * Alternative streaming approach for very large datasets
   * @param {Array} data - The data array to process
   * @returns {Array} - Processed data
   */
  async _processDataStream(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const results = [];
      let index = 0;

      const processNext = () => {
        try {
          const batchEnd = Math.min(index + this.CHUNK_SIZE, data.length);
          
          for (let i = index; i < batchEnd; i++) {
            const item = data[i];
            if (item && typeof item === 'object') {
              const {ts, ...restOfData} = item;
              results.push(restOfData);
            } else {
              results.push(item);
            }
          }
          
          index = batchEnd;
          
          if (index >= data.length) {
            resolve(results);
          } else {
            // Use setImmediate to prevent stack overflow
            setImmediate(processNext);
          }
        } catch (error) {
          reject(error);
        }
      };

      processNext();
    });
  }

  /**
   * Hash filters for cache key generation
   * @param {Object} filters - Filters object
   * @returns {String} - Hash string
   */
  _hashFilters(filters) {
    // Simple hash implementation - replace with better one if needed
    return JSON.stringify(filters).split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);              
  }

  /* Create a list of formatted (yyyy-mm-dd) dates within the range */
  _getDateRange(startDate, endDate) {
    const dates = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
      dates.push(`${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,'0')}-${String(current.getDate()).padStart(2,'0')}`);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }
  _chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}
}

module.exports = new DataController();