const mongoose = require('mongoose');

const countrySchema = new mongoose.Schema({
  name: { type: String, required: true, index: true},
  date: { type: Date, required: true, index: true, get: d => d.toISOString().split('T')[0] },
  cl: { type: Number, default: 0 },
  cv: { type: Number, default: 0 },
  cost: { type: Number, default: 0 },
  pft: { type: Number, default: 0 },
  rev: { type: Number, default: 0 },
  cpc: { type: Number, default: 0 },
  epc: { type: Number, default: 0 },
  cr: { type: Number, default: 0 },
  roi: { type: Number, default: 0 },
  ts: { type: [Number], required: true, index: true }
  //lastUpdated: { type: Date, default: Date.now }
}, { 
  timestamps: false,  
  versionKey: false, toJSON: { getters: true } });

countrySchema.index({ name: 1, ts:1,date: 1 }, { unique: true });
// Calculate derived metrics before saving
/*countrySchema.pre('save', function(next) {
  this.cpc = this.cost / (this.clicks || 1);
  this.epc = this.profit / (this.clicks || 1);
  this.cr = (this.leads / (this.clicks || 1)) * 100;
  this.roi = ((this.profit - this.cost) / (this.cost || 1)) * 100;
  next();
});*/
countrySchema.pre('save', function(next) {
  if (this.traffic_sources) {
    this.traffic_sources = this.traffic_sources.slice().sort().join(',');
  }
  next();
});
module.exports = mongoose.model('Country', countrySchema);