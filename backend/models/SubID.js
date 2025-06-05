const mongoose = require('mongoose');

const subIdSchema = new mongoose.Schema({
  name: { type: String, required: true },
  date: { type: Date, required: true, index: true, get: d => d.toISOString().split('T')[0] },
  clicks: { type: Number, default: 0 },
  conversions: { type: Number, default: 0 },
  cost: { type: Number, default: 0 },
  profit: { type: Number, default: 0 },
  revenue: { type: Number, default: 0 },
  campaign: { type: String, index: true }
}, { timestamps: true, toJSON: { getters: true } });

module.exports = mongoose.model('SubID', subIdSchema);