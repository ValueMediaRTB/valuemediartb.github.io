const mongoose = require('mongoose');

const aggregationSchema = new mongoose.Schema({
  primary_type: { type: String, required: true, index: true }, // e.g., 'campaign'
  primary_value: { type: String, required: true, index: true }, // e.g., 'Campaign 1'
  secondary_type: { type: String, required: true, index: true }, // e.g., 'subid'
  secondary_value: { type: String, required: true, index: true }, // e.g., '12345'
  date: { type: Date, required: true, index: true, get: d => d.toISOString().split('T')[0] },
  metrics: {
    clicks: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    cost: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    cpc: { type: Number, default: 0 },
    epc: { type: Number, default: 0 },
    cr: { type: Number, default: 0 },
    roi: { type: Number, default: 0 }
  }
}, { 
  timestamps: true,
  toJSON: { getters: true, virtuals: true }
});

// Compound indexes for all query patterns
aggregationSchema.index({ 
  date: 1, 
  primary_type: 1, 
  primary_value: 1,
  secondary_type: 1,
  secondary_value: 1 
});

aggregationSchema.index({ 
  date: 1,
  primary_type: 1,
  secondary_type: 1 
});

// Virtual for easy access to combined key
aggregationSchema.virtual('composite_key').get(function() {
  return `${this.primary_type}_${this.secondary_type}`;
});

// Pre-save hook for calculated fields
aggregationSchema.pre('save', function(next) {
  const m = this.metrics;
  this.calculated.cpc = m.clicks > 0 ? m.cost / m.clicks : 0;
  this.calculated.epc = m.clicks > 0 ? m.profit / m.clicks : 0;
  this.calculated.cr = m.clicks > 0 ? (m.conversions / m.clicks) * 100 : 0;
  this.calculated.roi = m.cost > 0 ? ((m.profit - m.cost) / m.cost) * 100 : 0;
  next();
});

module.exports = mongoose.model('Aggregation', aggregationSchema);