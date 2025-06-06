// models/Campaign.js
const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  name: { type: String, required: true },
  date: { type: Date, required: true, index: true, get: d=>d.toISOString().split('T')[0] },
  clicks: { type: Number, default: 0 },
  conversions: { type: Number, default: 0 },
  cost: { type: Number, default: 0 },
  profit: { type: Number, default: 0 },
  revenue: { type: Number, default: 0 },
  cpc: { type: Number, default: 0 },
  epc: { type: Number, default: 0 },
  cr: { type: Number, default: 0 },
  traffic_source: { type: Number, index: true },
  zone_id: { type: String, index: true },
  country: { type: String, index: true },
  isp: { type: String, index: true }
}, { timestamps: true,
    toJSON: { getters: true } });

// Add indexes for better query performance
campaignSchema.index({ date: 1, traffic_source: 1 });
campaignSchema.index({ date: 1, zone_id: 1 });
campaignSchema.index({ date: 1, country: 1 });
campaignSchema.index({ date: 1, isp: 1 });
campaignSchema.index({ date: 1 });

// Virtuals for calculated fields
campaignSchema.virtual('roi').get(function() {
  return this.cost > 0 ? ((this.profit - this.cost) / this.cost) * 100 : 0;
});

// Middleware to update calculated fields before save
campaignSchema.pre('save', function(next) {
  this.cpc = this.clicks > 0 ? this.cost / this.clicks : 0;
  this.epc = this.clicks > 0 ? this.profit / this.clicks : 0;
  this.cr = this.clicks > 0 ? (this.conversions / this.clicks) * 100 : 0;
  next();
});

module.exports = mongoose.model('Campaign', campaignSchema);