const mongoose = require('mongoose');

const subIdSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  zone: { type: Number, required: true, index: true},
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
}, { 
  timestamps: false,  
  versionKey: false,  toJSON: { getters: true } });

subIdSchema.index({ zone:1, name: 1, ts:1,  date: 1 }, { unique: true });
subIdSchema.index({ zone:1, name: 1 });
subIdSchema.pre('save', function(next) {
  if (this.traffic_sources) {
    this.traffic_sources = this.traffic_sources.slice().sort().join(',');
  }
  next();
});
module.exports = mongoose.model('SubID', subIdSchema);