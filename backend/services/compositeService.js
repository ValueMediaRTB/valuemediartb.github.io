const models = require('../models');
const cacheService = require('./cacheService');
const externalApiService = require('./apiService');

class CompositeService {
  validTypes = ['campaigns', 'countries', 'isps', 'subids', 'zones'];

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
    const apiData = await externalApiService.fetchBinomDataForDateRange(types, date);
    return this._transformApiData(apiData, types,date);
  }

  async storeData(types, data) {
    this._validateTypes(types);
    let result;
    let ops;
    try{
      if((types[0] == 'campaigns' || types[1] == 'campaigns') &&(types[0] == 'subids' || types[1] == 'subids')){
          ops = data.map(item => ({
            updateOne: {
              filter: {
                primary_type: item.primary_type,
                primary_value: item.primary_value,
                secondary_type: item.secondary_type,
                secondary_value: item.secondary_value,
                exads_camp_id: item.exads_campaign_id,
                zone:item.zone,
                date: new Date(item.date)
              },
              update: { $set: item },
              upsert: true
            }
          }));
      }
      else if(types[0] == 'campaigns' || types[1] == 'campaigns'){
        ops = data.map(item => ({
            updateOne: {
              filter: {
                primary_type: item.primary_type,
                primary_value: item.primary_value,
                secondary_type: item.secondary_type,
                secondary_value: item.secondary_value,
                exads_camp_id: item.exads_campaign_id,
                date: new Date(item.date)
              },
              update: { $set: item },
              upsert: true
            }
          }));
      }
      else if(types[0] == 'subids' || types[1] == 'subids'){
        ops = data.map(item => ({
            updateOne: {
              filter: {
                primary_type: item.primary_type,
                primary_value: item.primary_value,
                secondary_type: item.secondary_type,
                secondary_value: item.secondary_value,
                zone:item.zone,
                date: new Date(item.date)
              },
              update: { $set: item },
              upsert: true
            }
          }));
      }
      else{
        ops = data.map(item => ({
            updateOne: {
              filter: {
                primary_type: item.primary_type,
                primary_value: item.primary_value,
                secondary_type: item.secondary_type,
                secondary_value: item.secondary_value,
                date: new Date(item.date)
              },
              update: { $set: item },
              upsert: true
            }
          }));
      }
      result = await models.Aggregation.bulkWrite(ops);
      console.log("BulkWrite Result (composite):", {
          inserted: result.insertedCount,
          matched: result.matchedCount,
          modified: result.modifiedCount,
          upserted: result.upsertedCount,
          upsertedIds: result.upsertedIds
        });
    }
    catch (err) {
      console.error("Rejected Document (composite):", JSON.stringify(ops, null, 2));
      console.error("Error Details:", err);
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

  _transformApiData(apiData, types,date) {
    let processedResult = [];
    let the_primary_value = -1;
    let the_secondary_value = -1;
    let zone = -1;
    let exads_campaign_id = -1;
    let campaign_name = '';
    let aggregateResult;

    for(const item of apiData){
      if(item.level == '1'){
        if(types[0] == 'campaigns'){
          the_primary_value = item.entity_id;
          campaign_name = item.name
        }
        else if(types[0] == 'subids'){
          if(types[1] != 'zones')
            zone = item.name;
          }
        else{
          the_primary_value = item.name;
        }
      }
      else if(item.level == '2'){
        if(types[0] == 'campaigns'){
          exads_campaign_id = item.name; 
        }
        else if(types[0] == 'subids'){
          the_primary_value = item.name;
        }
        else if(types[1] == 'campaigns' && (types[0] != 'subids') && (types[0] != 'campaigns')){
          the_secondary_value = item.entity_id;
          campaign_name = item.name;
        }
        else if(types[1] == 'subids' && (types[0] != 'campaigns' && (types[0] != 'subids') && (types[0] != 'zones'))){
            zone = item.name;
        }
        else{
          the_secondary_value = item.name;
          aggregateResult = {
            primary_type: types[0],
            primary_value: the_primary_value,
            secondary_type: types[1],
            secondary_value: the_secondary_value,
            clicks: item.clicks || 0,
            conversions: item.conversions || 0,
            cost: item.cost || 0,
            profit: item.profit || 0,
            revenue: item.revenue || 0,
            cpc: item.cpc || 0,
            epc: item.epc || 0,
            cr: item.cr || 0,
            roi: item.roi || 0,
            date: date
          };
          processedResult.push(aggregateResult);
          continue;
        }
      }
      else if(item.level == '3'){
        if(types[1] == 'campaigns'){
          the_secondary_value = item.entity_id;
          campaign_name = item.name;
        }
        else if(types[1] == 'subids' && types[1] != 'zones'){
            zone = item.name
        }
        else {
          the_secondary_value = item.name;
          aggregateResult = {
            primary_type: types[0],
            primary_value: the_primary_value,
            secondary_type: types[1],
            secondary_value: the_secondary_value,
            clicks: item.clicks || 0,
            conversions: item.conversions || 0,
            cost: item.cost || 0,
            profit: item.profit || 0,
            revenue: item.revenue || 0,
            cpc: item.cpc || 0,
            epc: item.epc || 0,
            cr: item.cr || 0,
            roi: item.roi || 0,
            date: date
          };
          if(types[0] == 'campaigns' || types[1] == 'campaigns'){
            aggregateResult.exads_camp_id = exads_campaign_id;
            aggregateResult.campaign_name = campaign_name;
          }
          if(types[0] == 'subids' || types[1] == 'subids')
            aggregateResult.zone = zone;
          processedResult.push(aggregateResult);
          continue;
        }
      }
      else if(item.level == '4'){
        if(types[1] == 'campaigns'){
          the_secondary_value = item.entity_id;
          campaign_name = item.name;
        }
        else if(types[1] == 'subids' && types[1] != 'zones'){
            the_secondary_value = item.name;
        }
        aggregateResult = {
            primary_type: types[0],
            primary_value: the_primary_value,
            secondary_type: types[1],
            secondary_value: the_secondary_value,
            clicks: item.clicks || 0,
            conversions: item.conversions || 0,
            cost: item.cost || 0,
            profit: item.profit || 0,
            revenue: item.revenue || 0,
            cpc: item.cpc || 0,
            epc: item.epc || 0,
            cr: item.cr || 0,
            roi: item.roi || 0,
            date: date
          };
          if(types[0] == 'campaigns' || types[1] == 'campaigns'){
            aggregateResult.exads_camp_id = exads_campaign_id;
            aggregateResult.campaign_name = campaign_name;
          }
          if(types[0] == 'subids' || types[1] == 'subids')
            aggregateResult.zone = zone;
          processedResult.push(aggregateResult);
          continue;
      }
    }
    
    return processedResult;
  }
}

module.exports = new CompositeService();