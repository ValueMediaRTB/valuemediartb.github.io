const Country = require('../models/Country');
const ISP = require('../models/ISP');
const Zone = require('../models/Zone');
const SubID = require('../models/SubID');
const Domain = require('../models/Domain');

const processAndStoreData = async (apiData) => {
  try {
    // Process each entity type
    await Promise.all([
      mergeData(Country, apiData.countries),
      mergeData(ISP, apiData.isps),
      mergeData(Zone, apiData.zones),
      mergeData(SubID, apiData.subIds),
      mergeData(Domain, apiData.domains)
    ]);
  } catch (error) {
    console.error('Error processing data:', error);
    throw error;
  }
};

const mergeData = async (Model, newData) => {
  for (const item of newData) {
    await Model.findOneAndUpdate(
      { name: item.name },
      { 
        $inc: { 
          clicks: item.clicks || 0,
          leads: item.leads || 0,
          cost: item.cost || 0,
          profit: item.profit || 0 
        },
        lastUpdated: new Date()
      },
      { upsert: true, new: true }
    );
  }
};

module.exports = { processAndStoreData };