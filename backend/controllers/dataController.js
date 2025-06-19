const cacheService = require('../services/cacheService');
const dataService = require('../services/dataService');
const compositeService = require('../services/compositeService');
const { Parser } = require('json2csv');
const fs = require('fs');
const connectDB = require('../config/db.js');

class DataController {
  connected = -1
  async isDBConnected(){
    if(this.connected === -1)
      this.connected = await connectDB();
    return this.connected
  }

  async getReport(reportType, startDate, endDate, filters = {}) {
    try {
      if (reportType.includes('_')) {
        const types = reportType.split('_');
        if(types.length > 2){
          console.error("Error in DataController::getReport(): too many group members (more than 2)");
          return null;
        }
        return this._getCompositeReport(types, startDate, endDate, filters);
      }
      return this._getSingleReport(reportType, startDate, endDate, filters);
    } catch (error) {
      console.error(`Error getting report ${reportType}:`, error);
      throw error;
    }
  }

  async _getSingleReport(reportType, startDate, endDate, filters) {
    // Implementation for single table reports
    const dates = this._getDateRange(new Date(startDate), new Date(endDate));
    const results = [];
    for (const date of dates) {
      let data = await cacheService.getDailyData(reportType, date);
      
      if (!data) {
        if(await this.isDBConnected()){
          data = await dataService.fetchFromDatabase(reportType, date, filters);
        }
        else{
          console.warn("Not connected to DB!");
        }
        console.log("Fetched from database:");
        console.log(data);
        if (data.length > 0) {
            //await cacheService.setDailyData(reportType, date, data); production code, uncomment later
        } else {
          console.log('Retrieving from external api...');
          // Try external API if no data in DB
          data = await dataService.fetchFromExternalApi(reportType, date); 
          //export to CSV
          const parser = new Parser();
          const csv = parser.parse(data);
          fs.writeFileSync("externapAPIdata.csv", csv);

          console.log("Data length:"+data.length)
          console.log(data.slice(0,10));
          if (data.length > 0) {
            if(await this.isDBConnected()){
              await dataService.storeData(reportType, data,date); 
              //await cacheService.setDailyData(reportType, date, data); production code, uncomment later
            }
            else{
              console.warn("Not connected to DB!");
            }
            console.log('Data is empty');
          }
        }
      }
      
      results.push(...data);
    }
    
    return results;
  }

  async _getCompositeReport(types, startDate, endDate, filters) {
    // Implementation for composite reports
    const dates = this._getDateRange(new Date(startDate), new Date(endDate));
    
    const results = [];
    for (const date of dates) {
      let data;
      //let data = await cacheService.getCompositeData(types, date, filters); production code, uncomment later
      
      if (!data) {
        data = [];
        if(await this.isDBConnected()){
          data = await compositeService.fetchFromDatabase(types, date, filters); 
        }
        else {
          console.warn("Not connected to DB!");
        }
        console.log("Fetched from database (composite):");
        console.log(data);
        if (data.length > 0) {
          //await cacheService.setCompositeData(types, date, data, filters); production code, uncomment later
        } else {
          // Try external API if no data in DB
          data = await compositeService.fetchFromExternalApi(types, date);
          console.log("Fetched data from external API (composite):")
          console.log("Data length:"+data.length)
          console.log(data.slice(0,10));
          if (data.length > 0) {
            if(await this.isDBConnected())
              await compositeService.storeData(types, data.slice(0,2));
            else 
              console.warn("Not connected to DB!");
            //await cacheService.setCompositeData(types, date, data, filters);production code, uncomment later
          }
        }
      }
      
      results.push(...data);
    }
    
    return results;
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
}

module.exports = new DataController();