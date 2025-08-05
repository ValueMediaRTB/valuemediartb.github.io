// services/sessionManager.js
const redis = require('../config/redis');

class SessionManager {
  constructor() {
    this.PAGINATION_CONFIG = {
      AVERAGE_DOCUMENT_SIZE: 439,
      MAX_RESPONSE_SIZE: 512 * 1024 * 1024, // 512MB
      SAFETY_MARGIN: 0.8,
      MAX_STRING_LENGTH: 450 * 1024 * 1024, // 450MB
      MAX_SESSION_SIZE: 8 * 1024 * 1024 * 1024, // 8GB
      MAX_TOTAL_MEMORY: 10 * 1024 * 1024 * 1024, // 10GB
      MAX_CONCURRENT_SESSIONS: 50, // Increased from 10
      SESSION_TIMEOUT: 1 * 60 * 1000, // 30 minutes
      CLEANUP_AFTER_COMPLETION: 5 * 60 * 1000, // 5 minutes
      MAX_ITEMS_PER_SESSION: 75000000, // 75M items
      MEMORY_CHECK_INTERVAL: 600000, // 10 minutes
      MAX_ITEMS_PER_PAGE: 500000,
      CLEANUP_INTERVAL: 1 * 60 * 1000 // 10 minutes
    };

    // Start cleanup interval
    this.startCleanupInterval();
  }

  async createSession(data, totals, traffic_sources = []) {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const estimatedSize = this.estimateMemoryUsage({ data, totals });
    
    try {
      await redis.connect();
      
      // Check if we can create a new session
      const canCreate = await this.canCreateSession({ data, totals });
      if (!canCreate) {
        console.warn('Cannot create session - memory or concurrency limits reached');
        return null;
      }
      
      const totalPages = this.calculateTotalPages(data, totals);
      
      const sessionData = {
        sessionId,
        data: JSON.stringify(data),
        totals: JSON.stringify(totals),
        traffic_sources: JSON.stringify(traffic_sources),
        totalPages: totalPages.toString(),
        createdAt: Date.now().toString(),
        pagesRetrieved: JSON.stringify([]),
        isComplete: 'false',
        memoryUsage: estimatedSize.toString(),
        itemCount: (Array.isArray(data) ? data.length : 1).toString()
      };

      //// Use a transaction to ensure atomicity
      const multi = redis.client.multi();
      
      // Store session data
      multi.hSet(`session:${sessionId}`, sessionData);
      multi.expire(`session:${sessionId}`, Math.floor(this.PAGINATION_CONFIG.SESSION_TIMEOUT / 1000));
      
      // Add to active sessions with timestamp score
      const timestamp = Date.now();
      console.log(`Adding session ${sessionId} with score:`, timestamp);
      multi.zAdd('sessions:active',[{score:Date.now(),value:sessionId}]);
      
      // Execute transaction
      const results = await multi.exec();
      // Check if all operations succeeded
      if (results.some(result => result === null)) {
        console.error(`Failed to create session ${sessionId} - transaction failed`);
        return null;
      }
      
      // Update memory tracking
      const currentUsage = await this.getTotalMemoryUsage();
      await redis.client.set('memory:totalUsage', currentUsage + estimatedSize);

      console.log(`Created session ${sessionId} - ${Math.round(estimatedSize / 1024 / 1024)}MB, ${sessionData.itemCount} items, ${totalPages} pages`);
      console.log(`ACTIVE SESSIONS:`,await this.getActiveSessionCount());
      return sessionId;
    } catch (error) {
        console.error('Error creating session:', error);
        // Clean up any partial state
        try {
            await redis.client.del(`session:${sessionId}`);
            await redis.client.zRem('sessions:active', sessionId);
        } catch (cleanupError) {
            console.error('Cleanup after failed session creation failed:', cleanupError);
        }
        return null;
    }
  }

  async getSession(sessionId) {
    try {
      await redis.connect();
      const session = await redis.client.hGetAll(`session:${sessionId}`);
      
      if (!session || !session.sessionId) return null;
      
      return {
        ...session,
        data: JSON.parse(session.data),
        totals: JSON.parse(session.totals),
        traffic_sources: JSON.parse(session.traffic_sources || '[]'),
        pagesRetrieved: new Set(JSON.parse(session.pagesRetrieved || '[]')),
        createdAt: parseInt(session.createdAt),
        memoryUsage: parseInt(session.memoryUsage),
        isComplete: session.isComplete === 'true',
        itemCount: parseInt(session.itemCount),
        totalPages: parseInt(session.totalPages)
      };
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  async updateSession(sessionId, updates) {
    try {
      await redis.connect();
      // Check if session exists
      const exists = await redis.client.exists(`session:${sessionId}`);
      if(!exists){
        console.warn(`Cannot update non-existent session: ${sessionId}`);
        return false;
      }
      // Convert updates to Redis-compatible format
      const redisUpdates = {};
      for (const [key, value] of Object.entries(updates)) {
        if (value instanceof Set) {
          redisUpdates[key] = JSON.stringify(Array.from(value));
        } else if (typeof value === 'object') {
          redisUpdates[key] = JSON.stringify(value);
        } else {
          redisUpdates[key] = value.toString();
        }
      }
      
      await redis.client.hSet(`session:${sessionId}`, redisUpdates);
      return true;
    } catch (error) {
      console.error('Error updating session:', error);
      return false;
    }
  }

  async cleanupSession(sessionId) {
    try {
      await redis.connect();
      
      console.log(`Starting cleanup for session ${sessionId}`);
      
      // Get session info before deletion
      const session = await this.getSession(sessionId);
      const memoryToFree = session ? session.memoryUsage : 0;
      
      // Use transaction for atomic cleanup
      const multi = redis.client.multi();
      multi.del(`session:${sessionId}`);
      multi.zRem('sessions:active', sessionId);
      
      const results = await multi.exec();
      
      if (results[0] === 1) { // del returns 1 if key was deleted
        console.log(`✅ Successfully deleted session data for ${sessionId}`);
      } else {
        console.log(`Session data for ${sessionId} was already deleted`);
      }
      
      if (results[1] === 1) { // zRem returns 1 if member was removed
        console.log(`Successfully removed ${sessionId} from active list`);
      } else {
        console.log(`Session ${sessionId} was not in active list`);
      }
      
      // Update memory tracking only if we had session data
      if (memoryToFree > 0) {
        const currentUsage = await this.getTotalMemoryUsage();
        const newUsage = Math.max(0, currentUsage - memoryToFree);
        await redis.client.set('memory:totalUsage', newUsage);
        console.log(`Freed ${Math.round(memoryToFree / 1024 / 1024)}MB from session ${sessionId}`);
      }
      
    } catch (error) {
      console.error(`Error cleaning up session ${sessionId}:`, error);
    }
  }

  async getTotalMemoryUsage() {
    try {
      await redis.connect();
      const usage = await redis.client.get('memory:totalUsage');
      return parseInt(usage) || 0;
    } catch (error) {
      console.error('Error getting total memory usage:', error);
      return 0;
    }
  }

  async getActiveSessionCount() {
    try {
      await redis.connect();
      return await redis.client.zCard('sessions:active');
    } catch (error) {
      console.error('Error getting active session count:', error);
      return 0;
    }
  }

  async cleanupOldSessions() {
  try {
    await redis.connect();
    console.log('Starting cleanup process...');
    
    const now = Date.now();
    const cutoff = now - this.PAGINATION_CONFIG.SESSION_TIMEOUT;
    
    // Get all sessions with scores
    const allSessionsWithScores = await redis.client.zRangeWithScores(
        'sessions:active',
        0, -1,
        { WITHSCORES: true }
      );
    
    if (allSessionsWithScores.length === 0) {
      console.log('No sessions found in active list');
      return 0;
    }
    
    console.log(`Found ${allSessionsWithScores.length} sessions in active list`);
    console.log(`Current time: ${now}, Cutoff time: ${cutoff} (${Math.round(this.PAGINATION_CONFIG.SESSION_TIMEOUT / 60000)} min ago)`);
    
    // Show all sessions with their ages
    for (const item of allSessionsWithScores) {
      const ageMinutes = Math.round((now - item.score) / 60000);
      const isOld = item.score < cutoff;
      console.log(`   Session ${item.value}: created ${ageMinutes} min ago, ${isOld ? 'OLD (will cleanup)' : 'RECENT (will keep)'}`);
    }
    
    // Filter for actually old sessions
    const sessionsToCleanup = allSessionsWithScores.filter(item => item.score < cutoff);
    
    console.log(`Sessions to cleanup: ${sessionsToCleanup.length}`);
    
    if (sessionsToCleanup.length === 0) {
      console.log('No sessions old enough to cleanup');
      return 0;
    }
    
    let successCount = 0;
    let ghostCount = 0;
    let failCount = 0;
    
    for (const sessionItem of sessionsToCleanup) {
      const sessionId = sessionItem.value;
      
      try {
        // Check if session data actually exists
        const exists = await redis.client.exists(`session:${sessionId}`);
        console.log(`   Processing session ${sessionId}: exists=${exists}`);
        
        if (exists) {
          // Real session - full cleanup
          await this.cleanupSession(sessionId);
          successCount++;
          console.log(`   Cleaned real session ${sessionId}`);
        } else {
          // Ghost session - just remove from active list
          const removed = await redis.client.zRem('sessions:active', sessionId);
          if (removed === 1) {
            ghostCount++;
            console.log(`   Removed ghost session ${sessionId}`);
          } else {
            console.log(`   Failed to remove ghost session ${sessionId}`);
            failCount++;
          }
        }
      } catch (sessionError) {
        failCount++;
        console.error(`Failed to cleanup session ${sessionId}:`, sessionError);
      }
    }
    
    console.log(`Cleanup complete: ${successCount} real sessions cleaned, ${ghostCount} ghost sessions removed, ${failCount} failed`);
    
    return sessionsToCleanup.length;
  } catch (error) {
    console.error('Cleanup process failed completely:', error);
    return 0;
  }
  }

  async getActiveSessionsInfo() {
    try {
      await redis.connect();
      const sessionIds = await redis.client.zRange('sessions:active', 0, -1);
      const sessions = [];
      
      for (const id of sessionIds) {
        const session = await this.getSession(id);
        if (session) {
          sessions.push({
            session_id: session.sessionId,
            size_mb: Math.round(session.memoryUsage / 1024 / 1024),
            size_gb: Math.round(session.memoryUsage / 1024 / 1024 / 1024 * 100) / 100,
            items: session.itemCount,
            pages: session.totalPages,
            retrieved: session.pagesRetrieved.size,
            complete: session.isComplete,
            age_minutes: Math.round((Date.now() - session.createdAt) / 60000)
          });
        }
      }
      
      return sessions;
    } catch (error) {
      console.error('Error getting active sessions info:', error);
      return [];
    }
  }
  /**
   * Manual cleanup function to fix current ghost sessions
   */
  async cleanupGhostSessions() {
    try {
      await redis.connect();
      
      console.log('Starting ghost session cleanup...');
      
      // Get ALL sessions from active list
      const allActiveSessions = await redis.client.zRange('sessions:active', 0, -1);
      console.log(`Found ${allActiveSessions.length} sessions in active list`);
      
      let ghostCount = 0;
      let realCount = 0;
      
      for (const sessionId of allActiveSessions) {
        const exists = await redis.client.exists(`session:${sessionId}`);
        if (!exists) {
          // Ghost session - remove from active list
          const removed = await redis.client.zRem('sessions:active', sessionId);
          if (removed === 1) {
            ghostCount++;
            console.log(` Removed ghost session: ${sessionId}`);
          }
        } else {
          realCount++;
        }
      }
      
      // Recalculate total memory based on real sessions
      let totalRealMemory = 0;
      const realSessions = await redis.client.zRange('sessions:active', 0, -1);
      
      for (const sessionId of realSessions) {
        const session = await this.getSession(sessionId);
        if (session) {
          totalRealMemory += session.memoryUsage;
        }
      }
      
      await redis.client.set('memory:totalUsage', totalRealMemory);
      
      console.log(`   Ghost cleanup complete:`);
      console.log(`   Ghost sessions removed: ${ghostCount}`);
      console.log(`   Real sessions remaining: ${realCount}`);
      console.log(`   Memory usage reset to: ${Math.round(totalRealMemory / 1024 / 1024)}MB`);
      
      return { ghostCount, realCount, totalMemory: totalRealMemory };
    } catch (error) {
      console.error('Ghost cleanup failed:', error);
      throw error;
    }
  }
  async cleanupAllSessions() {
  try {
    await redis.connect();
    console.log('🗑️ Starting FORCE cleanup of ALL sessions...');
    
    const allSessions = await redis.client.zRange('sessions:active', 0, -1);
    
    if (allSessions.length === 0) {
      console.log('No sessions to force cleanup');
      return 0;
    }
    
    console.log(`Force cleaning ${allSessions.length} sessions...`);
    
    let successCount = 0;
    let ghostCount = 0;
    let failCount = 0;
    
    for (const sessionId of allSessions) {
      try {
        const exists = await redis.client.exists(`session:${sessionId}`);
        
        if (exists) {
          await this.cleanupSession(sessionId);
          successCount++;
          console.log(`   ✅ Force cleaned real session ${sessionId}`);
        } else {
          const removed = await redis.client.zRem('sessions:active', sessionId);
          if (removed === 1) {
            ghostCount++;
            console.log(`   👻 Removed ghost session ${sessionId}`);
          } else {
            failCount++;
          }
        }
      } catch (sessionError) {
        failCount++;
        console.error(`Failed to force cleanup session ${sessionId}:`, sessionError);
      }
    }
    
    // Reset memory tracking
    await redis.client.set('memory:totalUsage', 0);
    
    console.log(`🗑️ Force cleanup complete: ${successCount} real sessions, ${ghostCount} ghost sessions, ${failCount} failed`);
    
    return allSessions.length;
  } catch (error) {
    console.error('Force cleanup failed:', error);
    return 0;
  }
  }
  startCleanupInterval() {
    setInterval(() => {
      this.cleanupOldSessions();
    }, this.PAGINATION_CONFIG.CLEANUP_INTERVAL);

    console.log('🔄 Session cleanup interval started');
  }

  /**
   * Get actual Node.js memory usage
   * @returns {Object} - Memory usage statistics
   */
  getActualMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
      externalMB: Math.round(usage.external / 1024 / 1024)
    };
  }

  /**
   * Enhanced memory estimation with string length awareness
   * @param {*} data - Data to estimate
   * @returns {number} - Estimated bytes
   */
  estimateMemoryUsage(data) {
    if (!data) return 100;
    
    try {
      if (Array.isArray(data)) {
        if (data.length === 0) return 100;
        
        // For very large arrays, be more conservative
        const sampleSize = Math.min(100, data.length);
        let totalSampleSize = 0;
        let maxItemSize = 0;
        
        for (let i = 0; i < sampleSize; i++) {
          const index = Math.floor((i / sampleSize) * data.length);
          try {
            const itemStr = JSON.stringify(data[index]);
            const itemSize = itemStr.length;
            totalSampleSize += itemSize;
            maxItemSize = Math.max(maxItemSize, itemSize);
          } catch (error) {
            totalSampleSize += 2000;
            maxItemSize = Math.max(maxItemSize, 2000);
          }
        }
        
        const averageItemSize = totalSampleSize / sampleSize;
        
        // For large datasets, use the larger of average or max size for safety
        const effectiveItemSize = data.length > 100000 ? 
          Math.max(averageItemSize * 1.5, maxItemSize) : 
          averageItemSize;
        
        const estimatedSize = effectiveItemSize * data.length;
        
        // Check against string length limit
        if (estimatedSize > this.PAGINATION_CONFIG.MAX_STRING_LENGTH) {
          console.warn(`Estimated JSON size (${Math.round(estimatedSize / 1024 / 1024)}MB) exceeds string limit`);
        }
        
        return Math.round(estimatedSize * 3.5); // Object overhead
      }
      
      const jsonStr = JSON.stringify(data);
      return jsonStr.length * 3;
      
    } catch (error) {
      console.warn('Memory estimation failed:', error.message);
      if (Array.isArray(data)) {
        return data.length * 5000;
      }
      return 50 * 1024 * 1024;
    }
  }

  /**
   * Check if data is too large before processing
   * @param {*} data - Data to check
   * @returns {boolean} - True if data should be rejected
   */
  isDataTooLargeForProcessing(data) {
    if (Array.isArray(data)) {
      // Much higher limit on number of items
      if (data.length > this.PAGINATION_CONFIG.MAX_ITEMS_PER_SESSION) {
        console.warn(`Dataset too large: ${data.length} items (limit: ${this.PAGINATION_CONFIG.MAX_ITEMS_PER_SESSION})`);
        return true;
      }
    }
    
    // Check estimated memory against 8GB session limit
    const estimatedSize = this.estimateMemoryUsage(data);
    if (estimatedSize > this.PAGINATION_CONFIG.MAX_SESSION_SIZE) {
      console.warn(`Estimated dataset too large: ${Math.round(estimatedSize / 1024 / 1024 / 1024)}GB (limit: ${Math.round(this.PAGINATION_CONFIG.MAX_SESSION_SIZE / 1024 / 1024 / 1024)}GB)`);
      return true;
    }
    
    return false;
  }

  /**
   * Check if we can create a new session within memory limits
   * @param {*} data - Data for the new session
   * @returns {boolean} - True if session can be created
   */
  async canCreateSession(data) {
    const estimatedSize = this.estimateMemoryUsage(data);
    
    // Check individual session size limit (8GB)
    if (estimatedSize > this.PAGINATION_CONFIG.MAX_SESSION_SIZE) {
      console.warn(`Session data too large: ${Math.round(estimatedSize / 1024 / 1024 / 1024)}GB (limit: ${Math.round(this.PAGINATION_CONFIG.MAX_SESSION_SIZE / 1024 / 1024 / 1024)}GB)`);
      return false;
    }
    
    // Check total memory limit (10GB)
    const totalMemoryUsage = await this.getTotalMemoryUsage();
    if (totalMemoryUsage + estimatedSize > this.PAGINATION_CONFIG.MAX_TOTAL_MEMORY) {
      console.warn(`Total memory limit would be exceeded: ${Math.round((totalMemoryUsage + estimatedSize) / 1024 / 1024 / 1024)}GB (limit: ${Math.round(this.PAGINATION_CONFIG.MAX_TOTAL_MEMORY / 1024 / 1024 / 1024)}GB)`);
      
      // Try to free up space by cleaning up old sessions
      const cleaned = await this.cleanupOldSessions();
      if (cleaned > 0) {
        console.log(`Freed up space by cleaning ${cleaned} sessions, retrying...`);
        const newTotal = await this.getTotalMemoryUsage();
        return newTotal + estimatedSize <= this.PAGINATION_CONFIG.MAX_TOTAL_MEMORY;
      }
      return false;
    }
    
    // Check concurrent session limit
    const activeCount = await this.getActiveSessionCount();
    if (activeCount >= this.PAGINATION_CONFIG.MAX_CONCURRENT_SESSIONS) {
      console.warn(`Too many concurrent sessions: ${activeCount} (limit: ${this.PAGINATION_CONFIG.MAX_CONCURRENT_SESSIONS})`);
      
      // Try to clean up old sessions
      const cleaned = await this.cleanupOldSessions();
      if (cleaned > 0) {
        const newCount = await this.getActiveSessionCount();
        return newCount < this.PAGINATION_CONFIG.MAX_CONCURRENT_SESSIONS;
      }
      return false;
    }
    
    return true;
  }

  /**
   * Estimate the size of data without full JSON.stringify
   * @param {Array} data - Array of data to estimate
   * @returns {number} - Estimated size in bytes
   */
  estimateDataSize(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return 0;
    }
    
    // For very large arrays, sample more intelligently
    const sampleSize = Math.min(100, Math.max(10, Math.floor(data.length / 10000)));
    let totalSampleSize = 0;
    let successfulSamples = 0;
    
    for (let i = 0; i < sampleSize; i++) {
      const index = Math.floor((i / sampleSize) * data.length);
      try {
        const itemStr = JSON.stringify(data[index]);
        totalSampleSize += itemStr.length + 10; // Add comma and spacing overhead
        successfulSamples++;
      } catch (error) {
        // If stringify fails on sample, use conservative estimate
        totalSampleSize += 2000;
        successfulSamples++;
      }
    }
    
    if (successfulSamples === 0) {
      // Fallback if all samples failed
      return data.length * 2000;
    }
    
    const averageItemSize = totalSampleSize / successfulSamples;
    const totalEstimate = averageItemSize * data.length;
    
    // Add overhead for array structure
    const arrayOverhead = data.length * 2; // Commas and newlines
    
    return totalEstimate + arrayOverhead + 100; // Plus brackets and padding
  }

  /**
   * Check if response data is too large and needs pagination
   * @param {Object} reportData - Report data with data and totals
   * @returns {boolean} - True if data is too large
   */
  isResponseTooLarge(reportData) {
    try {
      const { data, totals } = reportData;
      
      // Check item count first
      if (Array.isArray(data)) {
        // Force pagination for large item counts
        if (data.length > this.PAGINATION_CONFIG.MAX_ITEMS_PER_PAGE) {
          console.log(`Dataset has ${data.length} items, exceeds max items per page (${this.PAGINATION_CONFIG.MAX_ITEMS_PER_PAGE})`);
          return true;
        }
      }
      
      // Estimate string size
      const estimatedDataSize = this.estimateDataSize(data);
      const totalsSize = totals ? JSON.stringify(totals).length : 0;
      const overhead = 10000;
      const totalEstimatedSize = estimatedDataSize + totalsSize + overhead;
      
      console.log(`Estimated response size: ${Math.round(totalEstimatedSize / 1024 / 1024)}MB`);
      
      // Check against both response size limit AND string length limit
      const maxAllowedSize = Math.min(
        this.PAGINATION_CONFIG.MAX_RESPONSE_SIZE * this.PAGINATION_CONFIG.SAFETY_MARGIN,
        this.PAGINATION_CONFIG.MAX_STRING_LENGTH
      );
      
      return totalEstimatedSize > maxAllowedSize;
    } catch (error) {
      console.error('Error checking response size:', error.message);
      const { data } = reportData || {};
      return Array.isArray(data) && data.length > 10000;
    }
  }

  /**
   * Calculate total pages needed
   * @param {Array} data - Array of data to paginate
   * @param {Object} totals - Totals object to include in each response
   * @returns {number} - Total number of pages needed
   */
  calculateTotalPages(data, totals) {
    if (!Array.isArray(data) || data.length === 0) {
      return 1;
    }

    // Force multiple pages for very large datasets
    if (data.length > this.PAGINATION_CONFIG.MAX_ITEMS_PER_PAGE) {
      const minPages = Math.ceil(data.length / this.PAGINATION_CONFIG.MAX_ITEMS_PER_PAGE);
      console.log(`Large dataset (${data.length} items) requires at least ${minPages} pages`);
      
      // Now calculate based on size constraints
      return Math.max(minPages, this.calculatePagesBasedOnSize(data, totals));
    }

    return this.calculatePagesBasedOnSize(data, totals);
  }

  /**
   * Calculate pages based on size constraints
   */
  calculatePagesBasedOnSize(data, totals) {
    // Base overhead
    let baseOverhead = 10000;
    try {
      baseOverhead = JSON.stringify({ 
        totals, 
        page: 1, 
        total_pages: 1,
        pagination_info: {} 
      }).length;
    } catch (error) {
      console.warn('Could not calculate base overhead');
    }
    
    // Use the smaller of response size limit or string length limit
    const maxAllowedSize = Math.min(
      this.PAGINATION_CONFIG.MAX_RESPONSE_SIZE * this.PAGINATION_CONFIG.SAFETY_MARGIN,
      this.PAGINATION_CONFIG.MAX_STRING_LENGTH
    );
    
    const maxPageSize = maxAllowedSize - baseOverhead;
    
    // Enhanced sampling for better accuracy
    const sampleSize = Math.min(100, data.length);
    let totalSampleSize = 0;
    let maxItemSize = 0;
    
    for (let i = 0; i < sampleSize; i++) {
      const index = Math.floor((i / sampleSize) * data.length);
      try {
        const itemStr = JSON.stringify(data[index]);
        const itemSize = itemStr.length + 10; // Add overhead for array formatting
        totalSampleSize += itemSize;
        maxItemSize = Math.max(maxItemSize, itemSize);
      } catch (error) {
        totalSampleSize += 1000;
        maxItemSize = Math.max(maxItemSize, 1000);
      }
    }
    
    const averageItemSize = totalSampleSize / sampleSize;
    
    // For large datasets, be conservative
    const effectiveItemSize = data.length > 100000 ? 
      Math.max(averageItemSize * 1.2, maxItemSize) : 
      averageItemSize;
    
    // Calculate items per page with hard limit
    const calculatedItemsPerPage = Math.floor(maxPageSize / effectiveItemSize);
    const itemsPerPage = Math.min(
      Math.max(1, calculatedItemsPerPage),
      this.PAGINATION_CONFIG.MAX_ITEMS_PER_PAGE
    );
    
    const calculatedPages = Math.ceil(data.length / itemsPerPage);
    
    console.log(`Dataset: ${data.length} items`);
    console.log(`Average item size: ${Math.round(averageItemSize)} bytes`);
    console.log(`Max item size: ${Math.round(maxItemSize)} bytes`);
    console.log(`Effective item size: ${Math.round(effectiveItemSize)} bytes`);
    console.log(`Max page size: ${Math.round(maxPageSize / 1024 / 1024)}MB`);
    console.log(`Items per page: ${itemsPerPage} (max: ${this.PAGINATION_CONFIG.MAX_ITEMS_PER_PAGE})`);
    console.log(`Total pages: ${calculatedPages}`);
    
    return calculatedPages;
  }

  /**
   * Get a specific page of data
   * @param {Array} data - Array of data to paginate
   * @param {Object} totals - Totals object
   * @param {number} pageNumber - Page number (1-based)
   * @param {number} totalPages - Total number of pages
   * @returns {Object} - Page data object
   */
  getDataPage(data, totals, pageNumber, totalPages) {
    if (!Array.isArray(data) || data.length === 0) {
      return {
        data: [],
        totals,
        page: 1,
        total_pages: 1,
        page_size: 0,
        total_records: 0
      };
    }
    
    // Calculate items per page
    const itemsPerPage = Math.ceil(data.length / totalPages);
    const startIndex = (pageNumber - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, data.length);
    const pageData = data.slice(startIndex, endIndex);
    
    console.log(`Returning page ${pageNumber}: items ${startIndex}-${endIndex-1} (${pageData.length} items)`);
    
    return {
      data: pageData,
      totals,
      page: pageNumber,
      total_pages: totalPages,
      page_size: pageData.length,
      total_records: data.length
    };
  }
}

module.exports = new SessionManager();