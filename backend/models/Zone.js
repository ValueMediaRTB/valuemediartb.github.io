const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  date: { type: Date, required: true, index: true, get: d => d.toISOString().split('T')[0] },
  clicks: { type: Number, default: 0 },
  conversions: { type: Number, default: 0 },
  cost: { type: Number, default: 0 },
  profit: { type: Number, default: 0 },
  revenue: { type: Number, default: 0 },
  cpc: { type: Number, default: 0 },
  epc: { type: Number, default: 0 },
  cr: { type: Number, default: 0 }
}, { timestamps: true, toJSON: { getters: true } });

zoneSchema.index({ name: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Zone', zoneSchema);