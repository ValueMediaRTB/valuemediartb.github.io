const mongoose = require('mongoose');

const countrySchema = new mongoose.Schema({
  name: { type: String, required: true, index: true},
  date: { type: Date, required: true, index: true, get: d => d.toISOString().split('T')[0] },
  clicks: { type: Number, default: 0 },
  leads: { type: Number, default: 0 },
  cost: { type: Number, default: 0 },
  profit: { type: Number, default: 0 },
  revenue: { type: Number, default: 0 },
  cpc: { type: Number, default: 0 },
  epc: { type: Number, default: 0 },
  cr: { type: Number, default: 0 },
  roi: { type: Number, default: 0 }
  //lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true, toJSON: { getters: true } });

countrySchema.index({ name: 1, date: 1 }, { unique: true });
// Calculate derived metrics before saving
/*countrySchema.pre('save', function(next) {
  this.cpc = this.cost / (this.clicks || 1);
  this.epc = this.profit / (this.clicks || 1);
  this.cr = (this.leads / (this.clicks || 1)) * 100;
  this.roi = ((this.profit - this.cost) / (this.cost || 1)) * 100;
  next();
});*/

module.exports = mongoose.model('Country', countrySchema);