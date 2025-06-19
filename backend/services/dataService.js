const models = require('../models');
const cacheService = require('./cacheService');
const externalApiService = require('./apiService');

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
    return Model.find(query).lean();
  }

  async fetchFromExternalApi(reportType, date) {
    const result = await externalApiService.fetchBinomDataForDateRange([reportType], date);
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
            camp_id:campaign_id,
            name:campaign_name,
            exads_camp_id:item.name,
            clicks:item.clicks,
            conversions:item.leads,
            cost:item.cost,
            profit:item.profit,
            revenue:item.revenue,
            cpc:item.cpc,
            epc:item.epc,
            cr:item.cr,
            roi: item.roi,
            date: date
          })
        }
      }
    }
    else if(reportType == 'subids'){
      let zone = -1;
      for(const item of result){
        if(item.level == '1'){
          zone = item.name;
        }
        else if(item.level == '2'){
          processedResult.push({
            name:item.name,
            zone:zone,
            clicks:item.clicks,
            conversions:item.leads,
            cost:item.cost,
            profit:item.profit,
            revenue:item.revenue,
            cpc:item.cpc,
            epc:item.epc,
            cr:item.cr,
            date: date,
            roi: item.roi,
          })
        }
      }
    }
    else{
      processedResult = result.map(item => ({
        name:item.name,
        clicks:item.clicks,
        conversions:item.leads,
        cost:item.cost,
        profit:item.profit,
        revenue:item.revenue,
        cpc:item.cpc,
        epc:item.epc,
        cr:item.cr,
        roi: item.roi,
        date: date
      }));
    }
    
    return processedResult;
  }
  async storeData(reportType, data,date) {
    const Model = this.getModel(reportType);
    const the_date = new Date(date);
    if (isNaN(the_date.getTime())) {
      throw new Error(`dataService::storeDate() error: Invalid date: ${date}`);
    }
    const ops = data.map(item => {
      return {
        updateOne: {
          filter: { name: item.name, date: the_date },
          update: { $set: item}, // ensure proper date type
          upsert: true
        }
      };
    });
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
      console.log("BulkWrite Result:", {
        inserted: result.insertedCount,
        matched: result.matchedCount,
        modified: result.modifiedCount,
        upserted: result.upsertedCount,
        upsertedIds: result.upsertedIds
      });
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