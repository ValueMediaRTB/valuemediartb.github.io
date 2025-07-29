const models = require('../models');
const cacheService = require('./cacheService');
const externalApiService = require('./binomAPIService');

class CompositeService {
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
  validTypes = ['campaigns', 'countries', 'isps', 'subids', 'zones'];

  async fetchFromDatabase(types, date, filters = {}) {
  this._validateTypes(types);
  
  const query = {
    date: new Date(date), // Ensure it's a Date object
    pt: types[0],
    st: types[1]
  };
  
  if(filters.traffic_sources){
    query.ts = { $in: filters.traffic_sources }; // Use $in for array matching
  }
  
  // Use aggregation pipeline for better performance with large datasets
  const pipeline = [
    { $match: query },
    // Project only needed fields (exclude _id, timestamps)
    { 
      $project: {
        _id: 0,
        pt: 1, pv: 1, st: 1, sv: 1,
        zone: 1, exadsCamp: 1, campName: 1,
        cl: 1, cv: 1, cost: 1, pft: 1, rev: 1,
        cpc: 1, epc: 1, cr: 1, roi: 1
      }
    }
  ];
  
  // For very large datasets, consider adding pagination
  if (filters.limit) {
    pipeline.push({ $limit: filters.limit });
  }
  
  // Use cursor for memory efficiency
  const cursor = models.Aggregation.aggregate(pipeline)
    .hint('main_query_idx') // Force index usage
    .allowDiskUse(true)
    .cursor({ batchSize: 5000 });
  
  const results = [];
  for await (const doc of cursor) {
    results.push(doc);
  }
  
  return results;
}

// Alternative: Direct query with optimization
async fetchFromDatabaseDirect(types, date, filters = {}) {
  this._validateTypes(types);
  
  const query = {
    date: new Date(date),
    pt: types[0],
    st: types[1]
  };
  
  if(filters.traffic_sources){
    query.ts = { $in: filters.traffic_sources };
  }
  
  // Use lean() for better performance
  const dbData = await models.Aggregation
    .find(query)
    .select('-_id -updatedAt -createdAt -__v') // Exclude unnecessary fields
    .hint('main_query_idx') // Force specific index
    .lean({ virtuals: false }) // Disable virtuals for performance
    .maxTimeMS(30000); // Set timeout
  
  return dbData;
}

  async fetchFromExternalApi(types, date,filters = {}) {
    this._validateTypes(types);
    // TODO: Implement based on your external API requirements
    const apiData = await externalApiService.fetchBinomDataForDateRange(types, date,filters);
    return this._transformApiData(apiData, types,date,filters);
  }

 async storeData(types, data, filters) {
  this._validateTypes(types);
  
  const ts = filters.traffic_sources.sort(); // Sort for consistent unique key
  const BATCH_SIZE = 5000; // Larger batches for better performance
  
  console.log(`Storing ${data.length} records...`);
  const startTime = Date.now();
  
  // Pre-process all operations in memory first
  const operations = data.map(item => {
    const dateObj = new Date(item.date);
    
    // Build unique key for upsert
    const uniqueKey = [
      item.pt,
      item.pv,
      item.st,
      item.sv,
      dateObj.toISOString(),
      ts.join(','),
      item.zone || 'null',
      item.exadsCamp || 'null'
    ].join('|');
    
    // Build update document - only include defined values
    const updateDoc = {
      pt: item.pt,
      pv: item.pv,
      st: item.st,
      sv: item.sv,
      date: dateObj,
      ts: ts,
      _uk: uniqueKey,
      // Numeric fields
      cl: Number(item.cl) || 0,
      cv: Number(item.cv) || 0,
      cost: Number(item.cost) || 0,
      pft: Number(item.pft) || 0,
      rev: Number(item.rev) || 0,
      cpc: Number(item.cpc) || 0,
      epc: Number(item.epc) || 0,
      cr: Number(item.cr) || 0,
      roi: Number(item.roi) || 0
    };
    
    // Only add optional fields if they have valid values
    if (item.zone && item.zone !== -1 && !isNaN(item.zone)) {
      updateDoc.zone = Number(item.zone);
    }
    
    if (item.exadsCamp && item.exadsCamp !== -1 && !isNaN(item.exadsCamp)) {
      updateDoc.exadsCamp = Number(item.exadsCamp);
    }
    
    if (item.campName) {
      updateDoc.campName = item.campName;
    }
    
    return {
      updateOne: {
        filter: { _uk: uniqueKey },
        update: { $set: updateDoc },
        upsert: true
      }
    };
  });
  
  // Execute in parallel batches for better performance
  const batchPromises = [];
  const maxConcurrentBatches = 4; // Adjust based on your MongoDB server capacity
  
  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    const batch = operations.slice(i, i + BATCH_SIZE);
    
    // Control concurrency
    if (batchPromises.length >= maxConcurrentBatches) {
      await Promise.race(batchPromises);
    }
    
    const batchPromise = this._executeBatch(batch, i, BATCH_SIZE)
      .then(result => {
        // Remove completed promise from array
        const index = batchPromises.indexOf(batchPromise);
        if (index > -1) batchPromises.splice(index, 1);
        return result;
      });
    
    batchPromises.push(batchPromise);
  }
  
  // Wait for all remaining batches
  const results = await Promise.all(batchPromises);
  
  // Calculate totals
  const totals = results.reduce((acc, result) => ({
    modified: acc.modified + result.modified,
    upserted: acc.upserted + result.upserted,
    errors: acc.errors + result.errors
  }), { modified: 0, upserted: 0, errors: 0 });
  
  const duration = (Date.now() - startTime) / 1000;
  const rps = Math.round(data.length / duration);
  
  console.log(`Completed in ${duration}s (${rps} records/sec)`);
  console.log(`Modified: ${totals.modified}, Upserted: ${totals.upserted}, Errors: ${totals.errors}`);
  
  return totals;
}

async _executeBatch(batch, startIndex, batchSize) {
  try {
    const result = await models.Aggregation.bulkWrite(batch, {
      ordered: false,
      w: 1,
      j: false,
      wtimeout: 30000 // 30 second timeout
    });
    
    console.log(`Batch ${Math.floor(startIndex/batchSize) + 1}: ` +
      `Modified: ${result.modifiedCount}, ` +
      `Upserted: ${result.upsertedCount}`);
    
    return {
      modified: result.modifiedCount,
      upserted: result.upsertedCount,
      errors: 0
    };
    
  } catch (err) {
    console.error(`Batch error at ${startIndex}:`, err.message);
    
    // Count errors
    let errorCount = 0;
    if (err.writeErrors) {
      errorCount = err.writeErrors.length;
      
      // Log sample of errors for debugging
      const sampleErrors = err.writeErrors.slice(0, 3);
      sampleErrors.forEach(e => {
        console.error(`- Error ${e.code}: ${e.errmsg}`);
      });
    }
    
    return {
      modified: err.result?.nModified || 0,
      upserted: err.result?.nUpserted || 0,
      errors: errorCount
    };
  }
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

  _transformApiData(apiData, types,date,filters) {
    let processedResult = [];
    let the_primary_value = -1;
    let the_secondary_value = -1;
    let zone = -1;
    let exads_campaign_id = "";
    let campaign_name = "";
    let aggregateResult;
    for(const item of apiData){
      if(item.level == '1'){
        if(types[0] == 'campaigns'){
          the_primary_value = item.entity_id;
          campaign_name = item.name
        }
        else if(types[0] == 'subids'){
          if(types[1] != 'zones'){
            if(this._isValidNumber(item.name))
              zone = this._safeNumber(item.name);
            else zone = -1;
          }
          else 
            the_secondary_value = item.name;
        }
        else{
          the_primary_value = item.name;
        }
      }
      else if(item.level == '2'){
        if(types[0] == 'campaigns'){
          if(this._isValidNumber(item.name))
            exads_campaign_id = this._safeNumber(item.name); 
          else exads_campaign_id = -1;
        }
        else if(types[0] == 'subids'){
          the_primary_value = item.name;
          if(types[1] == 'zones'){
            aggregateResult = {
            pt: types[0],
            pv: the_primary_value,
            st: types[1],
            sv: the_secondary_value,
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
          };
          processedResult.push(aggregateResult);
          continue;
          }
        }
        else if(types[1] == 'campaigns' && (types[0] != 'subids') && (types[0] != 'campaigns')){
          the_secondary_value = item.entity_id;
          campaign_name = item.name;
        }
        else if(types[1] == 'subids' && (types[0] != 'campaigns' && (types[0] != 'subids') && (types[0] != 'zones'))){
          if(this._isValidNumber(item.name))
            zone = this._safeNumber(item.name);
          else zone = -1;
        }
        else{
          the_secondary_value = item.name;
          aggregateResult = {
            pt: types[0],
            pv: the_primary_value,
            st: types[1],
            sv: the_secondary_value,
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
          };
          processedResult.push(aggregateResult);
          continue;
        }
      }
      else if(item.level == '3'){
        if(types[1] == 'campaigns' && (types[0] != 'subids')){
          if(this._isValidNumber(item.name))
            exads_campaign_id = this._safeNumber(item.name);
          else exads_campaign_id = -1;
          aggregateResult = {
            pt: types[0],
            pv: the_primary_value,
            st: types[1],
            sv: the_secondary_value,
            exadsCamp:exads_campaign_id,
            campName:campaign_name,
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
          };
          processedResult.push(aggregateResult);
          continue;
        }
        else if(types[1] == 'campaigns'){
          the_secondary_value = item.entity_id;
          campaign_name = item.name;
        }
        else if(types[1] == 'subids' && types[0] != 'campaigns'){
          the_secondary_value = item.name;
          aggregateResult = {
            pt: types[0],
            pv: the_primary_value,
            st: types[1],
            sv: the_secondary_value,
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
          };
          processedResult.push(aggregateResult);
          continue;
        }
        else if(types[1] == 'subids' && types[1] != 'zones'){
          if(this._isValidNumber(zone))
            zone = this._safeNumber(item.name);
          else zone = -1;
        }
        else {
          the_secondary_value = item.name;
          aggregateResult = {
            pt: types[0],
            pv: the_primary_value,
            st: types[1],
            sv: the_secondary_value,
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
          };
          if(types[0] == 'campaigns' || types[1] == 'campaigns'){
            aggregateResult.exadsCamp = exads_campaign_id  || "";
            aggregateResult.campName = campaign_name;
          }
          if(types[0] == 'subids' || types[1] == 'subids')
            aggregateResult.zone = zone;
          processedResult.push(aggregateResult);
          continue;
        }
      }
      else if(item.level == '4'){
        if(types[1] == 'campaigns'){
          if(this._isValidNumber(item.name))
            exads_campaign_id = this._safeNumber(item.name);
          else exads_campaign_id = -1;
        }
        else if(types[1] == 'subids' && types[1] != 'zones'){
            the_secondary_value = item.name;
        }
        aggregateResult = {
            pt: types[0],
            pv: the_primary_value,
            st: types[1],
            sv: the_secondary_value,
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
          };
          if(types[0] == 'campaigns' || types[1] == 'campaigns'){
            aggregateResult.exadsCamp = exads_campaign_id || "";
            aggregateResult.campName = campaign_name;
          }
          if(types[0] == 'subids' || types[1] == 'subids')
            aggregateResult.zone = zone;
          processedResult.push(aggregateResult);
          continue;
      }
    }
    
    return processedResult;
  }
  _isValidNumber(value) {
    const str = String(value).trim();
    return str.trim() !== '' && !isNaN(str);
  }
  _safeNumber = (value) => {
    const num = Number(value);
    return isNaN(num) ? -1 : num;
  };
}

module.exports = new CompositeService();