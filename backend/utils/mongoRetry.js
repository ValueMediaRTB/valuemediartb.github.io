// utils/mongoRetry.js
const mongoose = require('mongoose');

class MongoRetryHelper {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.backoffMultiplier = options.backoffMultiplier || 2;
  }

  async withRetry(operation, context = '') {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Check connection before operation
        if (mongoose.connection.readyState !== 1) {
          console.warn(`MongoDB disconnected, attempting to reconnect... (${context})`);
          await this.waitForConnection();
        }
        
        // Execute the operation
        return await operation();
        
      } catch (error) {
        lastError = error;
        
        // Check if it's a retryable error
        if (!this.isRetryableError(error) || attempt === this.maxRetries) {
          throw error;
        }
        
        // Log retry attempt
        console.warn(`MongoDB operation failed (${context}), attempt ${attempt}/${this.maxRetries}:`, error.message);
        
        // Wait before retry with exponential backoff
        const delay = this.retryDelay * Math.pow(this.backoffMultiplier, attempt - 1);
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  isRetryableError(error) {
    // MongoDB retryable error codes
    const retryableCodes = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'NetworkError',
      'MongoNetworkError',
      'MongoServerSelectionError'
    ];
    
    // Check error code
    if (error.code && retryableCodes.includes(error.code)) {
      return true;
    }
    
    // Check error name
    if (error.name && retryableCodes.includes(error.name)) {
      return true;
    }
    
    // Check for specific MongoDB errors
    if (error.message) {
      const retryableMessages = [
        'topology was destroyed',
        'socket hang up',
        'ECONNRESET',
        'connection timed out',
        'no primary found'
      ];
      
      return retryableMessages.some(msg => error.message.includes(msg));
    }
    
    return false;
  }

  async waitForConnection(timeout = 30000) {
    const startTime = Date.now();
    
    while (mongoose.connection.readyState !== 1) {
      if (Date.now() - startTime > timeout) {
        throw new Error('MongoDB connection timeout');
      }
      
      // Try to connect if disconnected
      if (mongoose.connection.readyState === 0) {
        try {
          await mongoose.connect(process.env.MONGO_URI);
        } catch (error) {
          console.error('Reconnection attempt failed:', error.message);
        }
      }
      
      await this.sleep(1000);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create singleton instance
const mongoRetry = new MongoRetryHelper({
  maxRetries: 3,
  retryDelay: 1000,
  backoffMultiplier: 2
});

// Export wrapper functions
module.exports = {
  withRetry: (operation, context) => mongoRetry.withRetry(operation, context),
  
  // Specific retry wrappers for common operations
  async retryFind(Model, query, options = {}, context = '') {
    return mongoRetry.withRetry(
      () => Model.find(query, null, options).lean(),
      `${Model.modelName}.find - ${context}`
    );
  },
  
  async retryBulkWrite(Model, operations, options = {}, context = '') {
    return mongoRetry.withRetry(
      () => Model.bulkWrite(operations, options),
      `${Model.modelName}.bulkWrite - ${context}`
    );
  },
  
  async retryAggregate(Model, pipeline, options = {}, context = '') {
    return mongoRetry.withRetry(
      () => Model.aggregate(pipeline, options),
      `${Model.modelName}.aggregate - ${context}`
    );
  }
};