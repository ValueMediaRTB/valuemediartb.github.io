// utils/mongoMonitor.js
const mongoose = require('mongoose');

class MongoPerformanceMonitor {
  constructor() {
    this.metrics = {
      queries: [],
      slowQueries: [],
      errors: [],
      connectionStats: {}
    };
    this.slowQueryThreshold = 1000; // 1 second
  }

  // Wrap mongoose queries to track performance
  wrapModel(Model) {
    const originalFind = Model.find;
    const originalAggregate = Model.aggregate;
    const originalBulkWrite = Model.bulkWrite;
    const monitor = this;

    // Wrap find
    Model.find = function(...args) {
      const startTime = Date.now();
      const query = originalFind.apply(this, args);
      
      // Track query execution
      const originalExec = query.exec;
      query.exec = async function() {
        try {
          const result = await originalExec.apply(this, arguments);
          const duration = Date.now() - startTime;
          
          monitor.recordQuery({
            operation: 'find',
            collection: Model.collection.name,
            duration,
            resultCount: Array.isArray(result) ? result.length : 1
          });
          
          return result;
        } catch (error) {
          monitor.recordError(error, 'find', Model.collection.name);
          throw error;
        }
      };
      
      return query;
    };

    // Similar wrapping for aggregate and bulkWrite...
    return Model;
  }

  recordQuery(queryInfo) {
    this.metrics.queries.push({
      ...queryInfo,
      timestamp: new Date()
    });

    // Track slow queries
    if (queryInfo.duration > this.slowQueryThreshold) {
      this.metrics.slowQueries.push({
        ...queryInfo,
        timestamp: new Date()
      });
      console.warn(`Slow query detected: ${queryInfo.operation} on ${queryInfo.collection} took ${queryInfo.duration}ms`);
    }

    // Keep only last 1000 queries
    if (this.metrics.queries.length > 1000) {
      this.metrics.queries.shift();
    }
  }

  recordError(error, operation, collection) {
    this.metrics.errors.push({
      error: error.message,
      operation,
      collection,
      timestamp: new Date()
    });

    // Keep only last 100 errors
    if (this.metrics.errors.length > 100) {
      this.metrics.errors.shift();
    }
  }

  async getConnectionStats() {
    const db = mongoose.connection.db;
    if (!db) return null;

    try {
      const serverStatus = await db.admin().serverStatus();
      
      return {
        connections: {
          current: serverStatus.connections.current,
          available: serverStatus.connections.available,
          totalCreated: serverStatus.connections.totalCreated
        },
        opcounters: serverStatus.opcounters,
        mem: serverStatus.mem,
        uptime: serverStatus.uptime
      };
    } catch (error) {
      console.error('Failed to get server stats:', error);
      return null;
    }
  }

  async getCollectionStats(collectionName) {
    const db = mongoose.connection.db;
    if (!db) return null;

    try {
      const stats = await db.collection(collectionName).stats();
      
      return {
        count: stats.count,
        size: stats.size,
        avgObjSize: stats.avgObjSize,
        storageSize: stats.storageSize,
        totalIndexSize: stats.totalIndexSize,
        indexSizes: stats.indexSizes
      };
    } catch (error) {
      console.error('Failed to get collection stats:', error);
      return null;
    }
  }

  getPerformanceReport() {
    const totalQueries = this.metrics.queries.length;
    const avgDuration = totalQueries > 0
      ? this.metrics.queries.reduce((sum, q) => sum + q.duration, 0) / totalQueries
      : 0;

    return {
      summary: {
        totalQueries,
        slowQueries: this.metrics.slowQueries.length,
        errors: this.metrics.errors.length,
        avgQueryDuration: Math.round(avgDuration)
      },
      slowQueries: this.metrics.slowQueries.slice(-10), // Last 10 slow queries
      recentErrors: this.metrics.errors.slice(-10), // Last 10 errors
      queryDistribution: this.getQueryDistribution()
    };
  }

  getQueryDistribution() {
    const distribution = {};
    
    this.metrics.queries.forEach(query => {
      const key = `${query.operation}:${query.collection}`;
      if (!distribution[key]) {
        distribution[key] = {
          count: 0,
          totalDuration: 0,
          avgDuration: 0
        };
      }
      distribution[key].count++;
      distribution[key].totalDuration += query.duration;
    });

    // Calculate averages
    Object.keys(distribution).forEach(key => {
      const stat = distribution[key];
      stat.avgDuration = Math.round(stat.totalDuration / stat.count);
    });

    return distribution;
  }

  // Express middleware for monitoring endpoint
  middleware() {
    return async (req, res) => {
      const report = this.getPerformanceReport();
      const connectionStats = await this.getConnectionStats();
      
      res.json({
        performance: report,
        connection: connectionStats,
        timestamp: new Date()
      });
    };
  }
}

// Create singleton instance
const mongoMonitor = new MongoPerformanceMonitor();

module.exports = mongoMonitor;