const mongoose = require('mongoose');

const aggregationSchema = new mongoose.Schema({
  pt: { type: String, required: true },
  pv: { type: String, required: true },
  st: { type: String, required: true },
  sv: { type: String, required: true },
  date: { type: Date, required: true, get: d => d.toISOString().split('T')[0] },
  zone: { type: Number, sparse: true },
  exadsCamp: { type: Number, sparse: true },
  campName: { type: String, sparse: true },
  cl: { type: Number, default: 0 },
  cv: { type: Number, default: 0 },
  cost: { type: Number, default: 0 },
  pft: { type: Number, default: 0 },
  rev: { type: Number, default: 0 },
  cpc: { type: Number, default: 0 },
  epc: { type: Number, default: 0 },
  cr: { type: Number, default: 0 },
  roi: { type: Number, default: 0 },
  ts: { type: [Number], required: true },
  _uk: { type: String, required: true, unique: true } // Make it required and unique
}, {  
  timestamps: false,  
  versionKey: false,
  collection: 'aggregations', // Explicit collection name
  // Add read preference for better performance
  read: 'secondaryPreferred',
  // Optimize for large documents
  bufferCommands: false,
  autoCreate: false // Don't auto-create in production
});

// Pre-save hook to set unique key
aggregationSchema.pre('save', function(next) {
  this._uk = `${this.pt}|${this.pv}|${this.st}|${this.sv}|${this.date.toISOString()}|${this.ts.sort().join(',')}|${this.zone || 'null'}|${this.exadsCamp || 'null'}`;
  next();
});

// OPTIMIZED INDEXES FOR MILLIONS OF RECORDS

// 1. Primary unique index on _uk (already defined in schema)
// This is automatically created due to unique: true

// 2. Main query index - optimized order for selectivity
aggregationSchema.index({ 
  date: -1,  // Most selective, descending for recent dates
  pt: 1, 
  st: 1,
  ts: 1 
}, { 
  background: true,
  name: 'main_query_idx'
});

// 3. Alternative query patterns
aggregationSchema.index({ 
  pt: 1,
  st: 1,
  date: 1
}, { 
  background: true,
  name: 'type_date_idx'
});

// 4. Traffic source specific queries
aggregationSchema.index({ 
  ts: 1,
  date: 1
}, { 
  background: true,
  name: 'ts_date_idx'
});

// 5. Sparse indexes for optional fields
aggregationSchema.index({ 
  zone: 1,
  date: 1
}, { 
  sparse: true, 
  background: true,
  name: 'zone_date_idx',
  partialFilterExpression: { zone: { $exists: true, $ne: null } }
});

aggregationSchema.index({ 
  exadsCamp: 1,
  date: 1
}, { 
  sparse: true, 
  background: true,
  name: 'exads_date_idx',
  partialFilterExpression: { exadsCamp: { $exists: true, $ne: null } }
});


// Add query helpers for common patterns
aggregationSchema.statics.findByDateRange = function(startDate, endDate, filters = {}) {
  const query = {
    date: { $gte: new Date(startDate), $lte: new Date(endDate) },
    ...filters
  };
  
  return this.find(query)
    .hint('main_query_idx') // Force index usage
    .lean()
    .allowDiskUse(true); // Allow disk usage for large results
};

// Optimize for bulk operations
aggregationSchema.statics.bulkUpsert = async function(records) {
  const operations = records.map(record => {
    const dateObj = new Date(record.date);
    const ts = record.ts.sort();
    
    const uniqueKey = [
      record.pt,
      record.pv,
      record.st,
      record.sv,
      dateObj.toISOString(),
      ts.join(','),
      record.zone || 'null',
      record.exadsCamp || 'null'
    ].join('|');
    
    return {
      updateOne: {
        filter: { _uk: uniqueKey },
        update: { 
          $set: {
            ...record,
            date: dateObj,
            ts: ts,
            _uk: uniqueKey
          }
        },
        upsert: true
      }
    };
  });
  
  return this.bulkWrite(operations, {
    ordered: false,
    w: 1,
    j: false
  });
};

module.exports = mongoose.model('Aggregation', aggregationSchema);