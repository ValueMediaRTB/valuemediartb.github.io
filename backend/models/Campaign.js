// models/Campaign.js
const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  campId: { type: Number, required: true , index: true},
  name: { type: String, required: true },
  exadsCamp: {type:Number},
  date: { type: Date, required: true, index: true, get: d=>d.toISOString().split('T')[0] },
  cl: { type: Number, default: 0 },
  cv: { type: Number, default: 0 },
  cost: { type: Number, default: 0 },
  pft: { type: Number, default: 0 },
  rev: { type: Number, default: 0 },
  cpc: { type: Number, default: 0 },
  epc: { type: Number, default: 0 },
  cr: { type: Number, default: 0 },
  roi: { type: Number, default: 0 },
  ts: { type: [Number], required: true }
  //zone_id: { type: String, index: true },
  //country: { type: String, index: true },
  //isp: { type: String, index: true }
}, { 
  timestamps: false,  
  versionKey: false, 
    toJSON: { getters: true } });

// Add indexes for better query performance
campaignSchema.index({ campId: 1,date: 1  });
campaignSchema.index({ exadsCamp: 1,date: 1  });
campaignSchema.index({ campId: 1,exadsCampId:1,ts:1,date: 1  }, { unique: true });
campaignSchema.index({ ts: 1, date: 1 });

// Middleware to update calculated fields before save
/*
campaignSchema.pre('save', function(next) {
  if (this.ts) {
    this.ts = this.ts.slice().sort().join(',');
  }
  next();
});*/

module.exports = mongoose.model('Campaign', campaignSchema);