const models = require('../models');
const cacheService = require('./cacheService');
const externalApiService = require('./binomAPIService');

class DataService {
  getModel(reportType) {
    const modelMap = {
      'campaigns': models.Campaign,
      'countries': models.Country,
      'isps': models.ISP,
      'subids': models.SubID,
      'zones': models.Zone
    };
    
    if (!modelMap[reportType.toLowerCase()]) {
      throw new Error(`Unknown report type: ${reportType}`);
    }
    
    return modelMap[reportType.toLowerCase()];
  }

  async fetchFromDatabase(reportType, date, filters = {}) {
    const Model = this.getModel(reportType);
    const query = this._buildQuery(date, filters);
    const dbData = await Model.find(query).lean();
    //return dbData.map(({_id,updatedAt,createdAt,__v,date,traffic_sources,...restOfRecord}) => {return {traffic_sources:traffic_sources.split(',').map(s=>parseInt(s,10)), ...restOfRecord}});
    return dbData.map(({_id,updatedAt,date,ts,...restOfRecord}) => restOfRecord);
  }

  async fetchFromExternalApi(reportType, date, filters = {}) {
    const result = await externalApiService.fetchBinomDataForDateRange([reportType], date,filters);
    //asta de jos trebuie gandita, nu merge pt subid pentru ca ai level 1 zone si level 2 subid
    let processedResult = [];
    if(reportType == 'campaigns'){
      let campaign_id = -1;
      let campaign_name = '';
      for(const item of result){
        if(item.level == '1'){
          campaign_id = item.entity_id;
          campaign_name = item.name
        }
        else if(item.level == '2'){
          processedResult.push({
            campId:campaign_id,
            name:campaign_name,
            exadsCamp:item.name || "",
            cl:Number(item.clicks) || 0,
            cv:Number(item.leads) || 0,
            cost:Number(item.cost) || 0,
            pft:Number(item.profit) || 0,
            rev:Number(item.revenue) || 0,
            cpc:Number(item.cpc) || 0,
            epc:Number(item.epc) || 0,
            cr:Number(item.cr) || 0,
            roi:Number(item.roi) || 0,
            ts: filters.traffic_sources,
            date: date
          })
        }
      }
    }
    else if(reportType == 'subids'){
      let zone = -1;
      for(const item of result){
        if(item.level == '1'){
          if(this._isValidNumber(item.name))
            zone = item.name;
          else zone = -1;
        }
        else if(item.level == '2'){
          processedResult.push({
            name:item.name,
            zone:zone,
            cl:Number(item.clicks) || 0,
            cv:Number(item.leads) || 0,
            cost:Number(item.cost) || 0,
            pft:Number(item.profit) || 0,
            rev:Number(item.revenue) || 0,
            cpc:Number(item.cpc) || 0,
            epc:Number(item.epc) || 0,
            cr:Number(item.cr) || 0,
            roi:Number(item.roi) || 0,
            ts: filters.traffic_sources,
            date: date
          })
        }
      }
    }
    else{
      processedResult = result.map(item => ({
        name:item.name,
        cl:Number(item.clicks) || 0,
        cv:Number(item.leads) || 0,
        cost:Number(item.cost) || 0,
        pft:Number(item.profit) || 0,
        rev:Number(item.revenue) || 0,
        cpc:Number(item.cpc) || 0,
        epc:Number(item.epc) || 0,
        cr:Number(item.cr) || 0,
        roi:Number(item.roi) || 0,
        ts: filters.traffic_sources,
        date: date
      }));
    }
    
    return processedResult;
  }
  async storeData(reportType, data,date,filters) {
    const Model = this.getModel(reportType);
    const the_date = new Date(date);
    if (isNaN(the_date.getTime())) {
      throw new Error(`dataService::storeDate() error: Invalid date: ${date}`);
    }
    let ops;
    let ts = filters.traffic_sources;
    if(reportType == 'campaigns'){
      ops = data.map(item => {
        return {
          updateOne: {
            filter: { campId: item.campId,exadsCamp:item.exadsCamp, name: item.name, ts: ts,  date: the_date},
            update: { $set: {...item,this:ts,date:the_date}}, // ensure proper date type
            upsert: true
          }
        };
      });
    }
    else if(reportType == 'subids'){
      ops = data.map(item => {
        return {
          updateOne: {
            filter: { zone:item.zone,name: item.name, ts: ts,date: the_date },
            update: { $set: {...item,ts:ts,date:the_date}}, // ensure proper date type
            upsert: true
          }
        };
      });
    }
    else{
      ops = data.map(item => {
        return {
          updateOne: {
            filter: { name: item.name, date: the_date, ts: ts, date:the_date },
            update: { $set: {...item,ts:ts,date:the_date}}, // ensure proper date type
            upsert: true
          }
        };
      });
    }
    /* manual insert for debugging try {
      const testDoc = new Model({...data[0],date:the_date});
      await testDoc.validate(); // Mongoose schema validation
      await testDoc.save();     // Try inserting into DB
      console.log("Manual insert worked.");
    } catch (err) {
      console.error("Manual insert failed:", err.message);
      if (err.errors) {
        console.error("Validation errors:", err.errors);
      }
    }*/
    try {
      const result = await Model.bulkWrite(ops, { ordered: false });
      /*console.log("BulkWrite Result:", {
        inserted: result.insertedCount,
        matched: result.matchedCount,
        modified: result.modifiedCount,
        upserted: result.upsertedCount,
        upsertedIds: result.upsertedIds
      });*/
    } catch (err) {
      console.error("BulkWrite Error:", err.message || err);
    }
  }

/*
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
  }*/
  /**
   * Combine data records across multiple days for single reports
   * @param {Array} data - All data records from all days
   * @param {String} reportType - Type of report (campaigns, countries, isps, subids, zones)
   * @returns {Array} - Combined data records
   */
  combineDataAcrossDays(data, reportType) {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    const combinedMap = new Map();
    for (const record of data) {
      if (!record || typeof record !== 'object') continue;
      // Generate combination key based on report type
      const combineKey = this.generateCombineKey(record, reportType);
      
      if (combinedMap.has(combineKey)) {
        // Combine with existing record
        const existing = combinedMap.get(combineKey);
        combinedMap.set(combineKey, this.combineRecords(existing, record));
      } else {
        // Create new record (remove date field)
        const { date, ...recordWithoutDate } = record;
        combinedMap.set(combineKey, { ...recordWithoutDate });
      }
    }

    return Array.from(combinedMap.values());
  }

  /**
   * Combine data records across multiple days for composite reports
   * @param {Array} data - All data records from all days
   * @param {Array} types - Array of two report types for composite
   * @returns {Array} - Combined data records
   */
  combineCompositeDataAcrossDays(data, types) {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    const combinedMap = new Map();

    for (const record of data) {
      if (!record || typeof record !== 'object') continue;

      // Generate combination key for composite data
      const combineKey = this.generateCompositeCombineKey(record, types);
      
      if (combinedMap.has(combineKey)) {
        // Combine with existing record
        const existing = combinedMap.get(combineKey);
        combinedMap.set(combineKey, this.combineRecords(existing, record));
      } else {
        // Create new record (remove date field)
        const { date, ...recordWithoutDate } = record;
        combinedMap.set(combineKey, { ...recordWithoutDate });
      }
    }

    return Array.from(combinedMap.values());
  }

  /**
   * Generate combination key for single reports
   * @param {Object} record - Data record
   * @param {String} reportType - Type of report
   * @returns {String} - Combination key
   */
  generateCombineKey(record, reportType) {
    switch (reportType.toLowerCase()) {
      case 'campaigns':
        return `${record.campId || ''}_${record.exadsCamp || ''}`;
      
      case 'countries':
      case 'isps':
      case 'zones':
        return `${record.name || ''}`;
      
      case 'subids':
        return `${record.zone || ''}_${record.name || ''}`;
      
      default:
        throw new Error(`Unknown report type for combination: ${reportType}`);
    }
  }

  /**
   * Generate combination key for composite reports
   * @param {Object} record - Data record
   * @param {Array} types - Array of report types
   * @returns {String} - Combination key
   */
  generateCompositeCombineKey(record, types) {
    let keyParts = [];
    
    // Add primary and secondary values
    keyParts.push(record.pt || '');
    keyParts.push(record.pv || '');
    keyParts.push(record.st || '');
    keyParts.push(record.sv || '');
    
    // Add additional fields based on report types
    if (types.includes('campaigns')) {
      keyParts.push(record.exadsCamp || '');
    }
    
    if (types.includes('subids')) {
      keyParts.push(record.zone || '');
    }
    
    return keyParts.join('_');
  }

  /**
   * Combine two records by adding numeric fields and weighted averaging of calculated fields
   * @param {Object} existing - Existing combined record
   * @param {Object} newRecord - New record to combine
   * @returns {Object} - Combined record
   */
  combineRecords(existing, newRecord) {
    // Fields to add
    const addFields = ['cl', 'cv', 'cost', 'pft', 'rev'];
    
    const combined = { ...existing };
    
    // Store original clicks for weighted averaging
    const existingClicks = existing.cl || 0;
    const newClicks = newRecord.cl || 0;
    const totalClicks = existingClicks + newClicks;
    
    // Store original cost for ROI calculation
    const existingCost = existing.cost || 0;
    const newCost = newRecord.cost || 0;
    const totalCost = existingCost + newCost;
    
    // Add numeric fields
    for (const field of addFields) {
      combined[field] = (existing[field] || 0) + (newRecord[field] || 0);
    }
    
    // Calculate weighted averages for derived metrics
    if (totalClicks > 0) {
      // CPC = weighted average by clicks
      const existingCpcWeight = existingClicks * (existing.cpc || 0);
      const newCpcWeight = newClicks * (newRecord.cpc || 0);
      combined.cpc = (existingCpcWeight + newCpcWeight) / totalClicks;
      
      // EPC = weighted average by clicks
      const existingEpcWeight = existingClicks * (existing.epc || 0);
      const newEpcWeight = newClicks * (newRecord.epc || 0);
      combined.epc = (existingEpcWeight + newEpcWeight) / totalClicks;
      
      // CR = weighted average by clicks
      const existingCrWeight = existingClicks * (existing.cr || 0);
      const newCrWeight = newClicks * (newRecord.cr || 0);
      combined.cr = (existingCrWeight + newCrWeight) / totalClicks;
    } else {
      combined.cpc = 0;
      combined.epc = 0;
      combined.cr = 0;
    }
    
    // ROI = weighted average by cost
    if (totalCost > 0) {
      const existingRoiWeight = existingCost * (existing.roi || 0);
      const newRoiWeight = newCost * (newRecord.roi || 0);
      combined.roi = (existingRoiWeight + newRoiWeight) / totalCost;
    } else {
      combined.roi = 0;
    }
    
    return combined;
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
  _isValidNumber(value) {
    const str = String(value).trim();
    return str.trim() !== '' && !isNaN(str);
  }
}



module.exports = new DataService();