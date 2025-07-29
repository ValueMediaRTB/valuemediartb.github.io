const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // Performance optimizations
      maxPoolSize: 100, // Increase connection pool size
      minPoolSize: 10,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      // Write concern for better performance
      writeConcern: {
        w: 1, // Acknowledge from primary only
        j: false, // Don't wait for journal sync
        wtimeout: 5000
      },
      // Compression for network efficiency
      compressors: ['snappy', 'zlib'],
      // Direct connection for faster writes
      directConnection: false,
      retryWrites: true,
      retryReads: true
    });
    
    // Enable MongoDB query optimization
    mongoose.set('autoIndex', false); // Don't auto-create indexes in production
    mongoose.set('strictQuery', false);
    
    console.log('MongoDB Connected with optimized settings...');
    return true;
  } catch (err) {
    console.error('MongoDB Connection Error:', err);
    return false;
  }
};

module.exports = connectDB;