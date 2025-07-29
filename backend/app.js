require('dotenv').config();
const express = require('express');
const app = express();
const axios = require('axios');
const bcrypt = require('bcrypt');
const PORT = 3000;
const cacheController = require('./controllers/cacheController');
const cors = require('cors');
const dataController = require('./controllers/dataController');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const mongoMonitor = require('./utils/mongoMonitor');
const { withRetry } = require('./utils/mongoRetry');
const path = require('path');
const rateLimit = require('express-rate-limit');
const {soap} = require('strong-soap');
const xml2js = require('xml2js');
const { castObject } = require('./models/Campaign');
const { subscribe } = require('diagnostics_channel');

const allowedOrigins = ['http://localhost:3001', 'https://valuemediartb.github.io'];
const cookies = {};
let axiosInstance;

// UPDATED CONFIGURATION with Node.js string limits
const PAGINATION_CONFIG = {
  AVERAGE_DOCUMENT_SIZE: 439,
  MAX_RESPONSE_SIZE: 512 * 1024 * 1024, // 512MB - safe limit for JSON.stringify
  SAFETY_MARGIN: 0.8, // 80% safety margin
  MAX_STRING_LENGTH: 450 * 1024 * 1024, // 450MB - well below Node's limit
  MAX_SESSION_SIZE: 8 * 1024 * 1024 * 1024, // 8GB per session
  MAX_TOTAL_MEMORY: 10 * 1024 * 1024 * 1024, // 10GB total storage
  MAX_CONCURRENT_SESSIONS: 10,
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  CLEANUP_AFTER_COMPLETION: 5 * 60 * 1000, // 5 minutes after completion
  MAX_ITEMS_PER_SESSION: 75000000, // 75M items
  MEMORY_CHECK_INTERVAL: 600000, // Check memory every 10 minutes
  MAX_ITEMS_PER_PAGE: 500000 // Hard limit on items per page
};

// In-memory storage for paginated sessions
const paginationSessions = new Map();
let totalMemoryUsage = 0;
let lastMemoryCheck = Date.now();

/**
 * Get actual Node.js memory usage
 * @returns {Object} - Memory usage statistics
 */
function getActualMemoryUsage() {
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
function estimateMemoryUsage(data) {
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
      if (estimatedSize > PAGINATION_CONFIG.MAX_STRING_LENGTH) {
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
 * Check if data is too large before processing - RELAXED LIMITS
 * @param {*} data - Data to check
 * @returns {boolean} - True if data should be rejected
 */
function isDataTooLargeForProcessing(data) {
  if (Array.isArray(data)) {
    // Much higher limit on number of items
    if (data.length > PAGINATION_CONFIG.MAX_ITEMS_PER_SESSION) {
      console.warn(`Dataset too large: ${data.length} items (limit: ${PAGINATION_CONFIG.MAX_ITEMS_PER_SESSION})`);
      return true;
    }
  }
  
  // Check estimated memory against 6GB session limit
  const estimatedSize = estimateMemoryUsage(data);
  if (estimatedSize > PAGINATION_CONFIG.MAX_SESSION_SIZE) {
    console.warn(`Estimated dataset too large: ${Math.round(estimatedSize / 1024 / 1024 / 1024)}GB (limit: ${Math.round(PAGINATION_CONFIG.MAX_SESSION_SIZE / 1024 / 1024 / 1024)}GB)`);
    return true;
  }
  
  return false;
}

/**
 * Relaxed memory monitoring - only warn at very high usage
 */
function checkMemoryUsage() {
  const memUsage = getActualMemoryUsage();
  const maxHeap = 12 * 1024 * 1024 * 1024; // Assume 12GB Node.js limit (with --max-old-space-size)
  
  console.log(`Memory usage: ${memUsage.heapUsedMB}MB heap, ${memUsage.externalMB}MB external, Tracked: ${Math.round(totalMemoryUsage / 1024 / 1024)}MB`);
  
  // Warning at 85% of heap limit (much more relaxed)
  if (memUsage.heapUsed > maxHeap * 0.85) {
    console.warn(`⚠️ HIGH MEMORY USAGE: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB (${Math.round(memUsage.heapUsed / maxHeap * 100)}% of limit)`);
    
    // Only cleanup if we're really close to limits
    if (totalMemoryUsage > PAGINATION_CONFIG.MAX_TOTAL_MEMORY * 0.9) {
      cleanupOldestSessions(0, false); // Don't force cleanup
    }
  }
  
  // Critical at 95% (very high threshold)
  if (memUsage.heapUsed > maxHeap * 0.95) {
    console.error(`🚨 CRITICAL MEMORY USAGE: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB - Emergency cleanup!`);
    
    // Emergency cleanup - only remove oldest/completed sessions
    cleanupOldestSessions(0, true);
  }
  
  return memUsage;
}

/**
 * Generate unique session ID
 * @returns {string} - Unique session ID
 */
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if we can create a new session within memory limits - RELAXED
 * @param {*} data - Data for the new session
 * @returns {boolean} - True if session can be created
 */
function canCreateSession(data) {
  const estimatedSize = estimateMemoryUsage(data);
  
  // Check individual session size limit (6GB)
  if (estimatedSize > PAGINATION_CONFIG.MAX_SESSION_SIZE) {
    console.warn(`Session data too large: ${Math.round(estimatedSize / 1024 / 1024 / 1024)}GB (limit: ${Math.round(PAGINATION_CONFIG.MAX_SESSION_SIZE / 1024 / 1024 / 1024)}GB)`);
    return false;
  }
  
  // Check total memory limit (8GB)
  if (totalMemoryUsage + estimatedSize > PAGINATION_CONFIG.MAX_TOTAL_MEMORY) {
    console.warn(`Total memory limit would be exceeded: ${Math.round((totalMemoryUsage + estimatedSize) / 1024 / 1024 / 1024)}GB (limit: ${Math.round(PAGINATION_CONFIG.MAX_TOTAL_MEMORY / 1024 / 1024 / 1024)}GB)`);
    
    // Try to free up space by cleaning up old sessions
    const requiredSpace = (totalMemoryUsage + estimatedSize) - PAGINATION_CONFIG.MAX_TOTAL_MEMORY;
    if (cleanupOldestSessions(requiredSpace, false)) {
      console.log(`Freed up space, retrying session creation...`);
      return totalMemoryUsage + estimatedSize <= PAGINATION_CONFIG.MAX_TOTAL_MEMORY;
    }
    return false;
  }
  
  // Check concurrent session limit (relaxed)
  if (paginationSessions.size >= PAGINATION_CONFIG.MAX_CONCURRENT_SESSIONS) {
    console.warn(`Too many concurrent sessions: ${paginationSessions.size} (limit: ${PAGINATION_CONFIG.MAX_CONCURRENT_SESSIONS})`);
    
    // Try to clean up completed sessions
    cleanupOldestSessions(0, false);
    return paginationSessions.size < PAGINATION_CONFIG.MAX_CONCURRENT_SESSIONS;
  }
  
  return true;
}

/**
 * Enhanced session cleanup
 * @param {string} sessionId - Session to cleanup
 */
function cleanupSession(sessionId) {
  if (paginationSessions.has(sessionId)) {
    const session = paginationSessions.get(sessionId);
    const sessionSize = session.memoryUsage || 0;
    
    paginationSessions.delete(sessionId);
    totalMemoryUsage -= sessionSize;
    
    console.log(`Cleaned up session ${sessionId} (freed ${Math.round(sessionSize / 1024 / 1024)}MB), Total memory: ${Math.round(totalMemoryUsage / 1024 / 1024)}MB`);
  }
}

/**
 * Enhanced cleanup function with more intelligent selection
 * @param {number} requiredSpace - Bytes needed
 * @param {boolean} forceCleanup - Force cleanup regardless of age
 * @returns {boolean} - True if enough space was freed
 */
function cleanupOldestSessions(requiredSpace, forceCleanup = false) {
  if (paginationSessions.size === 0) return false;
  
  const sortedSessions = Array.from(paginationSessions.entries())
    .sort((a, b) => {
      // Prioritize completed sessions, then older sessions
      if (a[1].isComplete !== b[1].isComplete) {
        return b[1].isComplete - a[1].isComplete; // Completed first
      }
      return a[1].createdAt - b[1].createdAt; // Older first
    });
  
  let freedSpace = 0;
  const now = Date.now();
  
  for (const [sessionId, session] of sortedSessions) {
    const sessionAge = now - session.createdAt;
    const shouldCleanup = forceCleanup || 
                         session.isComplete || // Always clean completed sessions first
                         sessionAge > PAGINATION_CONFIG.SESSION_TIMEOUT;
    
    if (shouldCleanup) {
      const sessionSize = session.memoryUsage || estimateMemoryUsage(session.data);
      
      paginationSessions.delete(sessionId);
      totalMemoryUsage -= sessionSize;
      freedSpace += sessionSize;
      
      console.log(`🧹 Cleaned up session ${sessionId} (freed ${Math.round(sessionSize / 1024 / 1024)}MB, age: ${Math.round(sessionAge / 60000)}min, completed: ${session.isComplete})`);
      
      if (!forceCleanup && freedSpace >= requiredSpace) {
        break;
      }
    }
  }
  
  return freedSpace >= requiredSpace;
}

/**
 * Process large data safely with relaxed limits
 */
async function processLargeDataSafely(reportData) {
  const { data, totals } = reportData;
  
  // Pre-check: Is the data too large even with relaxed limits?
  if (isDataTooLargeForProcessing(data)) {
    console.warn('Dataset rejected - exceeds 6GB session limit');
    return null;
  }
  
  try {
    // For very large datasets, just return as-is since we have much higher limits
    if (Array.isArray(data) && data.length > 100000) {
      console.log(`Processing very large dataset: ${data.length} items`);
    }
    
    return { data, totals };
    
  } catch (error) {
    console.error('Error processing large data:', error);
    
    // Check if it was a memory error
    if (error.message.includes('heap') || error.message.includes('memory')) {
      console.error('🚨 MEMORY ERROR during processing - forcing cleanup');
      cleanupOldestSessions(0, true);
    }
    
    throw error;
  }
}

/**
 * Enhanced session creation with relaxed memory protection
 * @param {*} data - Session data
 * @param {*} totals - Session totals
 * @returns {Object|null} - Session object or null if failed
 */
function createSession(data, totals, traffic_sources) {
  console.log(`🔍 Attempting to create session for ${Array.isArray(data) ? data.length : 'non-array'} items`);
  
  // Pre-flight memory check - much more relaxed
  const currentMem = getActualMemoryUsage();
  if (currentMem.heapUsed > PAGINATION_CONFIG.MAX_TOTAL_MEMORY) { // 10GB (very high threshold)
    console.warn('🚨 Memory usage extremely high, rejecting session creation');
    return null;
  }
  
  // Check data size against relaxed limits
  if (isDataTooLargeForProcessing({ data, totals })) {
    return null;
  }
  
  const estimatedSize = estimateMemoryUsage({ data, totals });
  
  // Try to create session within relaxed limits
  if (!canCreateSession({ data, totals })) {
    console.log('💾 Cannot create session within current limits');
    return null;
  }
  
  const sessionId = generateSessionId();
  const totalPages = calculateTotalPages(data, totals);
  
  const session = {
    sessionId: sessionId,
    data: data,
    totals: totals,
    traffic_sources: traffic_sources || [], // FIXED: Always store as array
    totalPages: totalPages,
    createdAt: Date.now(),
    pagesRetrieved: new Set(),
    isComplete: false,
    memoryUsage: estimatedSize,
    itemCount: Array.isArray(data) ? data.length : 1,
    // FIXED: Add request parameters for better matching
    requestParams: {
      start_date: null,
      end_date: null,
      filters: []
    }
  };
  
  paginationSessions.set(sessionId, session);
  totalMemoryUsage += estimatedSize;
  
  const memAfter = getActualMemoryUsage();
  console.log(`✅ Created session ${sessionId}: ${Math.round(estimatedSize / 1024 / 1024)}MB, ${session.itemCount} items`);
  console.log(`📊 Memory: ${memAfter.heapUsedMB}MB heap, Total tracked: ${Math.round(totalMemoryUsage / 1024 / 1024)}MB`);
  
  return session;
}

// Start memory monitoring with relaxed frequency
setInterval(checkMemoryUsage, PAGINATION_CONFIG.MEMORY_CHECK_INTERVAL);

// Enhanced cleanup with relaxed criteria
setInterval(() => {
  const now = Date.now();
  const sessionsToCleanup = [];
  
  for (const [sessionId, session] of paginationSessions.entries()) {
    const isExpired = now - session.createdAt > PAGINATION_CONFIG.SESSION_TIMEOUT;
    const isCompletedAndOld = session.isComplete && 
      (now - session.createdAt > PAGINATION_CONFIG.CLEANUP_AFTER_COMPLETION);
    
    if (isExpired || isCompletedAndOld) {
      sessionsToCleanup.push(sessionId);
    }
  }
  
  sessionsToCleanup.forEach(cleanupSession);
  
  if (sessionsToCleanup.length > 0) {
    console.log(`Periodic cleanup: removed ${sessionsToCleanup.length} sessions`);
  }
}, 15 * 60 * 1000); // Check every 15 minutes

// Rate limit: more relaxed
const limiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 2, // 2 requests per second
  message: 'Too many requests - please wait',
});
let accessToken;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Estimate the size of data without full JSON.stringify - OPTIMIZED FOR LARGE DATA
 * @param {Array} data - Array of data to estimate
 * @returns {number} - Estimated size in bytes
 */
function estimateDataSize(data) {
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
 * Check if response data is too large and needs pagination - UPDATED FOR 512MB PAGES
 * @param {Object} reportData - Report data with data and totals
 * @returns {boolean} - True if data is too large
 */
function isResponseTooLarge(reportData) {
  try {
    const { data, totals } = reportData;
    
    // Check item count first
    if (Array.isArray(data)) {
      // Force pagination for large item counts
      if (data.length > PAGINATION_CONFIG.MAX_ITEMS_PER_PAGE) {
        console.log(`Dataset has ${data.length} items, exceeds max items per page (${PAGINATION_CONFIG.MAX_ITEMS_PER_PAGE})`);
        return true;
      }
    }
    
    // Estimate string size
    const estimatedDataSize = estimateDataSize(data);
    const totalsSize = totals ? JSON.stringify(totals).length : 0;
    const overhead = 10000;
    const totalEstimatedSize = estimatedDataSize + totalsSize + overhead;
    
    console.log(`Estimated response size: ${Math.round(totalEstimatedSize / 1024 / 1024)}MB`);
    
    // Check against both response size limit AND string length limit
    const maxAllowedSize = Math.min(
      PAGINATION_CONFIG.MAX_RESPONSE_SIZE * PAGINATION_CONFIG.SAFETY_MARGIN,
      PAGINATION_CONFIG.MAX_STRING_LENGTH
    );
    
    return totalEstimatedSize > maxAllowedSize;
  } catch (error) {
    console.error('Error checking response size:', error.message);
    const { data } = reportData || {};
    return Array.isArray(data) && data.length > 10000;
  }
}

/**
 * Split data into pages that fit within the 512MB response size limit
 * @param {Array} data - Array of data to paginate
 * @param {Object} totals - Totals object to include in each response
 * @returns {number} - Total number of pages needed
 */
function calculateTotalPages(data, totals) {
  if (!Array.isArray(data) || data.length === 0) {
    return 1;
  }

  // Force multiple pages for very large datasets
  if (data.length > PAGINATION_CONFIG.MAX_ITEMS_PER_PAGE) {
    const minPages = Math.ceil(data.length / PAGINATION_CONFIG.MAX_ITEMS_PER_PAGE);
    console.log(`Large dataset (${data.length} items) requires at least ${minPages} pages`);
    
    // Now calculate based on size constraints
    return Math.max(minPages, calculatePagesBasedOnSize(data, totals));
  }

  return calculatePagesBasedOnSize(data, totals);
}

/**
 * Calculate pages based on size constraints
 */
function calculatePagesBasedOnSize(data, totals) {
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
    PAGINATION_CONFIG.MAX_RESPONSE_SIZE * PAGINATION_CONFIG.SAFETY_MARGIN,
    PAGINATION_CONFIG.MAX_STRING_LENGTH
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
    PAGINATION_CONFIG.MAX_ITEMS_PER_PAGE
  );
  
  const calculatedPages = Math.ceil(data.length / itemsPerPage);
  
  console.log(`Dataset: ${data.length} items`);
  console.log(`Average item size: ${Math.round(averageItemSize)} bytes`);
  console.log(`Max item size: ${Math.round(maxItemSize)} bytes`);
  console.log(`Effective item size: ${Math.round(effectiveItemSize)} bytes`);
  console.log(`Max page size: ${Math.round(maxPageSize / 1024 / 1024)}MB`);
  console.log(`Items per page: ${itemsPerPage} (max: ${PAGINATION_CONFIG.MAX_ITEMS_PER_PAGE})`);
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
function getDataPage(data, totals, pageNumber, totalPages) {
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

/**
 * Safe JSON response sender with automatic chunking
 */
function sendSafeJsonResponse(res, data) {
  try {
    // Try to send normally first
    res.json(data);
  } catch (error) {
    if (error.message.includes('Invalid string length')) {
      console.error('JSON.stringify failed, response too large');
      
      // Send error response with metadata
      res.status(413).json({
        error: 'Response too large',
        message: 'The response data exceeds Node.js string limits',
        data_info: {
          total_items: Array.isArray(data.data) ? data.data.length : 'unknown',
          attempted_size_mb: 'exceeded_limit'
        },
        suggestion: 'Please use pagination or reduce the dataset size'
      });
    } else {
      throw error;
    }
  }
}

/**
 * Fallback response when session creation fails - UPDATED WITH SMALLER LIMIT
 * @param {Response} res - Express response object
 * @param {Array} data - Data array
 * @param {Object} totals - Totals object
 * @param {Number} requestedPage - Requested page number
 */
function sendLimitedFallbackResponse(res, data, totals, requestedPage) {
  console.log('Using limited fallback response (no session)');
  
  // Much smaller limit for fallback to ensure it works
  const maxItems = 10000; // Safe limit
  const limitedData = Array.isArray(data) ? data.slice(0, maxItems) : data;
  
  const responseObj = {
    data: limitedData,
    totals,
    page: 1,
    total_pages: 1,
    page_size: Array.isArray(limitedData) ? limitedData.length : 1,
    total_records: Array.isArray(data) ? data.length : 1,
    pagination_info: {
      is_paginated: false,
      current_page: 1,
      total_pages: 1,
      has_next_page: false,
      has_previous_page: false,
      session_id: null,
      is_session_complete: true,
      warning: `Data truncated to ${maxItems} items due to size limits`,
      original_size: Array.isArray(data) ? data.length : 1,
      suggestion: 'Automatic pagination failed. Please use date filters to reduce dataset size.'
    }
  };
  
  sendSafeJsonResponse(res, responseObj);
}

/**
 * Enhanced sendPaginatedResponse with better error handling
 * @param {Response} res - Express response object
 * @param {Object} reportData - Report data with data and totals
 * @param {Number} requestedPage - Page number requested (1-based)
 * @param {String} sessionId - Optional session ID for continuing pagination
 */
function sendPaginatedResponse(res, reportData, requestedPage = 1, traffic_sources = [], sessionId = null) {
  const { data, totals } = reportData;
  
  try {
    // Always check if pagination is needed
    if (isResponseTooLarge(reportData)) {
      console.log('Response requires pagination...');
      let session;
      
      if (sessionId && paginationSessions.has(sessionId)) {
        session = paginationSessions.get(sessionId);
        console.log(`Continuing session ${sessionId}`);
        
        // FIXED: Verify session still matches
        const sessionValid = session && session.traffic_sources && 
                           Array.isArray(session.traffic_sources) && 
                           Array.isArray(traffic_sources) &&
                           session.traffic_sources.length === traffic_sources.length &&
                           session.traffic_sources.every((val, index) => val === traffic_sources[index]);
        
        if (!sessionValid) {
          console.log(`Session ${sessionId} is invalid or doesn't match current request`);
          session = null;
        }
      }
      
      if (!session) {
        session = createSession(data, totals, traffic_sources);
        
        if (!session) {
          return sendLimitedFallbackResponse(res, data, totals, requestedPage);
        }
        
        sessionId = session.sessionId;
        console.log(`Created new session ${sessionId} for pagination`);
      }
      
      const pageNumber = Math.max(1, Math.min(requestedPage, session.totalPages));
      const pageData = getDataPage(session.data, session.totals, pageNumber, session.totalPages);
      
      session.pagesRetrieved.add(pageNumber);
      
      console.log(`Sending page ${pageNumber} of ${session.totalPages} (${pageData.page_size} records)`);
      // Build response object
      const responseObj = {
        ...pageData,
        pagination_info: {
          is_paginated: true,
          current_page: pageNumber,
          total_pages: session.totalPages,
          page_size: pageData.page_size,
          total_records: Array.isArray(session.data) ? session.data.length : 0,
          has_next_page: pageNumber < session.totalPages,
          has_previous_page: pageNumber > 1,
          session_id: sessionId,
          pages_retrieved: Array.from(session.pagesRetrieved).sort((a,b) => a-b),
          is_session_complete: session.isComplete,
          session_progress: `${session.pagesRetrieved.size}/${session.totalPages}`,
          memory_info: {
            session_size_mb: Math.round(session.memoryUsage / 1024 / 1024),
            total_memory_mb: Math.round(totalMemoryUsage / 1024 / 1024),
            active_sessions: paginationSessions.size
          }
        }
      };
      
      // Use safe send
      sendSafeJsonResponse(res, responseObj);
      
    } else {
      // For smaller datasets, still use safe send
      const responseObj = {
        data,
        totals,
        page: 1,
        total_pages: 1,
        page_size: Array.isArray(data) ? data.length : 1,
        total_records: Array.isArray(data) ? data.length : 1,
        pagination_info: {
          is_paginated: false,
          current_page: 1,
          total_pages: 1,
          has_next_page: false,
          has_previous_page: false,
          session_id: null,
          is_session_complete: true
        }
      };
      
      sendSafeJsonResponse(res, responseObj);
    }
  } catch (error) {
    console.error('Error in sendPaginatedResponse:', error);
    
    if (sessionId) {
      cleanupSession(sessionId);
    }
    
    // Check if it's a string length error
    if (error.message.includes('Invalid string length')) {
      res.status(413).json({
        error: 'Response too large',
        message: 'Data exceeds Node.js processing limits',
        suggestion: 'The system will now use automatic pagination. Please retry your request.'
      });
    } else {
      res.status(500).json({
        error: 'Failed to send response',
        message: error.message
      });
    }
  }
}

async function parseXMLResponse(xmlData) {
  const parser = new xml2js.Parser({
    explicitArray: false,
    ignoreAttrs: false,
    tagNameProcessors: [xml2js.processors.stripPrefix]
  });
  
  try {
    const result = await parser.parseStringPromise(xmlData);
    return result;
  } catch (error) {
    console.error('XML parsing error:', error);
    return null;
  }
}

function getProgramCountryCode(programName){
  let countryCode = '';
  if (programName.includes('.')) {
    countryCode = programName.split('.').pop().trim();
  } else if (programName.includes('(') && programName.includes(')')) {
    const match = programName.match(/\(([^)]+)\)/);
    if (match) {
      countryCode = match[1].trim();
    }
  }
  if(countryCode.startsWith('com'))
    return '';
  return countryCode;
}
function getDaisyconClientID(user){
  const tokens = JSON.parse(process.env.TOKENS);
  const clientID = tokens["DAISYCON"]["USERS"][user]["ID"];
  return clientID;
}
async function getAdPumpOffers(user){
  const tokens = JSON.parse(process.env.TOKENS);
  const api_token = tokens["ADPUMP"]["USERS"][user];
  let page = 1, pageCount = 0;
  let offers = [];
  do{
    let attempts = 0;
    let getOffersResponse;
    do{
      if(attempts > 0)
        await sleep(2000);
      getOffersResponse = await sendRequest({targetUrl:`https://api.adpump.com/ru/apiWmMyOffers/?key=${api_token}&format=json&page=${page}`,headers:{},body:{},method:"GET"});
      attempts ++;
    }while(("error" in getOffersResponse) && (attempts < 5));
    if(("error" in getOffersResponse) && (attempts >= 5)){
      return getOffersResponse;
    }
    const responseJson = JSON.parse(getOffersResponse.data);
    let tempOffers = [];
    pageCount = responseJson.result.pageCount || 1;
    console.log(`Sending AdPump API request to get offers (page ${page}/${pageCount})...`);
    for(let tempOffer of responseJson.result.favouriteOffers){
      let getLinkAttempts = 0, trackingLinks, getLinksResponse;
      do{
        if(getLinkAttempts > 0)
          await sleep(2000);
        console.log(`Sending AdPump API request to get links for offer ${tempOffer.offer.id}...`);
        getLinksResponse = await sendRequest({targetUrl:`https://api.adpump.com/ru/apiWmLinks/?key=${api_token}&format=json&offer=${tempOffer.offer.id}`,headers:{},body:{},method:"GET"});
        getLinkAttempts ++;
      }while(("error" in getOffersResponse) && (getLinkAttempts < 5));
      if(("error" in getOffersResponse) && (getLinkAttempts >= 5)){
        trackingLinks = [];
      }
      trackingLinks = JSON.parse(getLinksResponse.data);
      tempOffers.push({
        "Offer ID":tempOffer.offer.id,
        "Offer name":tempOffer.offer.name,
        "Sources":tempOffer.sources.map(source=>(source.id+":"+source.name)).join(","),
        "Tracking URL":trackingLinks.result?.links[0].url,
        "Clean URL":trackingLinks.result?.links[0].cleanUrl
      });
    }
    //for getting my offers: https://api.adpump.com/ru/apiWmMyOffers/?key=VK5a1GXVXfqv17TG&format=json&page=<pagenr>
    // for subscribing: https://api.adpump.com/ru/apiWmMyOffers/?key=VK5a1GXVXfqv17TG&format=json&act=add&offer=<offer_id>
    offers = [...offers,...tempOffers];
    page += 1;
  }while((page-1) < pageCount);
  return offers;
}
async function authTradeTracker(user){
  const tokens = JSON.parse(process.env.TOKENS);
  const soapEndpoint = tokens["TRADETRACKER"]["WSDL"];
  const auth = {
    customerID: parseInt(tokens["TRADETRACKER"]["USERS"][user]["CUSTOMERID"],10),
    passphrase: tokens["TRADETRACKER"]["USERS"][user]["PASSPHRASE"]
  }
  try {
    // Create axios instance with cookie support
    axiosInstance = axios.create({
      withCredentials: true,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8'
      }
    });
    
    // Step 1: Authenticate and capture cookies
    const authSoapRequest = `<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:tns="https://ws.tradetracker.com/soap/affiliate">
      <soap:Body>
        <tns:authenticate>
          <customerID>${auth.customerID}</customerID>
          <passphrase>${auth.passphrase}</passphrase>
          <sandbox>false</sandbox>
          <locale>en_GB</locale>
          <demo>false</demo>
        </tns:authenticate>
      </soap:Body>
    </soap:Envelope>`;

    console.log(`Authenticating TradeTracker user ${user}...`);
    const authResponse = await axiosInstance.post(soapEndpoint, authSoapRequest, {
      headers: {
        'SOAPAction': 'https://ws.tradetracker.com/soap/affiliate/authenticate'
      }
    });

    // Extract and store cookies from auth response
    if(!cookies["tradetracker"])
      cookies["tradetracker"] = {};
    cookies["tradetracker"][user] = authResponse.headers['set-cookie'];
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function getTradeTrackerOffers(user) {
  const tokens = JSON.parse(process.env.TOKENS);
  const soapEndpoint = tokens["TRADETRACKER"]["WSDL"];
  try{
    //Get affiliate sites
    const getSiteSoapRequest = `<?xml version="1.0" encoding="utf-8"?>
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
                    xmlns:tns="https://ws.tradetracker.com/soap/affiliate">
        <soap:Body>
          <tns:getAffiliateSites>
            <options xsi:nil="true"/>
          </tns:getAffiliateSites>
        </soap:Body>
      </soap:Envelope>`;
    console.log('Getting affiliate sites...');
      const sitesResponse = await axiosInstance.post(soapEndpoint, getSiteSoapRequest, {
        headers: {
          'SOAPAction': 'https://ws.tradetracker.com/soap/affiliate/getAffiliateSites',
          'Cookie': cookies["tradetracker"][user] ? cookies["tradetracker"][user].join('; ') : ''
        }
    });
    const sitesParsedResponse = await parseXMLResponse(sitesResponse.data);
    
    // Extract just the data (remove SOAP envelope)
    const sitesEnvelope = sitesParsedResponse.Envelope || sitesParsedResponse['SOAP-ENV:Envelope'];
    const sitesBody = sitesEnvelope.Body || sitesEnvelope['SOAP-ENV:Body'];
    const sitesResponseData = sitesBody.getAffiliateSiteTypesResponse || sitesBody['ns1:getAffiliateSitesResponse'] || sitesBody.GetAffiliateSitesResponseMessage || sitesBody['tns:getAffiliateSitesResponse'] || sitesBody;
    
    const affiliateSites = [];
    for(let item of sitesResponseData.getAffiliateSitesResponse.affiliateSites.item){
      affiliateSites.push({"ID":item.ID["_"],"name":item.name["_"]});
    }
    
    let getCampaignsSoapRequest,campaignsParsedResponse,campaignsEnvelope,campaignsBody,campaignsResponseData;
    let campaignsAndTrackingLinks = [];
    for(let site of affiliateSites){
      // Add this to parameters if not needed: <options xsi:nil="true"/>
      getCampaignsSoapRequest = `<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
                      xmlns:tns="https://ws.tradetracker.com/soap/affiliate">
          <soap:Body>
            <tns:getCampaigns>
              <affiliateSiteID>${site.ID}</affiliateSiteID>
              <options xsi:nil="true"/>
            </tns:getCampaigns>
          </soap:Body>
        </soap:Envelope>`;
      console.log(`Getting campaigns for affiliate site ${site.ID}...`);
      campaignsResponse = await axiosInstance.post(soapEndpoint, getCampaignsSoapRequest, {
        headers: {
          'SOAPAction': 'https://ws.tradetracker.com/soap/affiliate/getCampaigns',
          'Cookie': cookies["tradetracker"][user] ? cookies["tradetracker"][user].join('; ') : ''
        }
      });
      campaignsParsedResponse = await parseXMLResponse(campaignsResponse.data);
      
      // Extract just the data (remove SOAP envelope)
      campaignsEnvelope = campaignsParsedResponse.Envelope || campaignsParsedResponse['SOAP-ENV:Envelope'];
      campaignsBody = campaignsEnvelope.Body || campaignsEnvelope['SOAP-ENV:Body'];
      campaignsResponseData = campaignsBody.getCampaignsResponse || campaignsBody['ns1:GetCampaignsResponseMessage'] || campaignsBody.GetCampaignsResponseMessage || campaignsBody['tns:getCampaignsResponse'] || campaignsBody;
      console.log(campaignsResponseData.campaigns.item);
      for(const campInfo of campaignsResponseData.campaigns.item){
        campaignsAndTrackingLinks.push({
          "Affiliate site ID":site.ID || "",
          "Affiliate site name":site.name || "",
          "Campaign ID":campInfo.ID["_"] || "",
          "Campaign URL":campInfo.URL["_"] || "",
          "Tracking URL":campInfo.info.trackingURL["_"] || "",
          "Time zone":campInfo.info.timeZone["_"] || ""
        });
      }
    }
    return {result:campaignsAndTrackingLinks};
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    throw error;
  }
}
async function subscribeTradeTrackerOffers(user){
  const tokens = JSON.parse(process.env.TOKENS);
  const soapEndpoint = tokens["TRADETRACKER"]["WSDL"];
  try{
    let subscribeLogs = {};
    //Get affiliate sites
    const getSiteSoapRequest = `<?xml version="1.0" encoding="utf-8"?>
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
                    xmlns:tns="https://ws.tradetracker.com/soap/affiliate">
        <soap:Body>
          <tns:getAffiliateSites>
            <options xsi:nil="true"/>
          </tns:getAffiliateSites>
        </soap:Body>
      </soap:Envelope>`;
    console.log('Getting affiliate sites...');
      const sitesResponse = await axiosInstance.post(soapEndpoint, getSiteSoapRequest, {
        headers: {
          'SOAPAction': 'https://ws.tradetracker.com/soap/affiliate/getAffiliateSites',
          'Cookie': cookies["tradetracker"][user] ? cookies["tradetracker"][user].join('; ') : ''
        }
    });
    const sitesParsedResponse = await parseXMLResponse(sitesResponse.data);
    
    // Extract just the data (remove SOAP envelope)
    const sitesEnvelope = sitesParsedResponse.Envelope || sitesParsedResponse['SOAP-ENV:Envelope'];
    const sitesBody = sitesEnvelope.Body || sitesEnvelope['SOAP-ENV:Body'];
    const sitesResponseData = sitesBody.getAffiliateSiteTypesResponse || sitesBody['ns1:getAffiliateSitesResponse'] || sitesBody.GetAffiliateSitesResponseMessage || sitesBody['tns:getAffiliateSitesResponse'] || sitesBody;
    
    const affiliateSites = [];
    for(let item of sitesResponseData.getAffiliateSitesResponse.affiliateSites.item){
      affiliateSites.push({"ID":item.ID["_"],"name":item.name["_"]});
    }
    
    let getUnsubscribedCampaignsSoapRequest,campaignsParsedResponse,campaignsEnvelope,campaignsBody,campaignsResponseData;
    let campaignsAndTrackingLinks = [];
    for(let site of affiliateSites){
      // Add this to parameters if not needed: <options xsi:nil="true"/>
      getUnsubscribedCampaignsSoapRequest = `<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
                      xmlns:tns="https://ws.tradetracker.com/soap/affiliate">
          <soap:Body>
            <tns:getCampaigns>
              <affiliateSiteID>${site.ID}</affiliateSiteID>
              <options>
                <assignmentStatus>notsignedup</assignmentStatus>
              </options>
            </tns:getCampaigns>
          </soap:Body>
        </soap:Envelope>`;
      console.log(`Getting unsubscribed campaigns for affiliate site ${site.ID}...`);
      campaignsResponse = await axiosInstance.post(soapEndpoint, getUnsubscribedCampaignsSoapRequest, {
        headers: {
          'SOAPAction': 'https://ws.tradetracker.com/soap/affiliate/getCampaigns',
          'Cookie': cookies["tradetracker"][user] ? cookies["tradetracker"][user].join('; ') : ''
        }
      });
      campaignsParsedResponse = await parseXMLResponse(campaignsResponse.data);
      
      // Extract just the data (remove SOAP envelope)
      campaignsEnvelope = campaignsParsedResponse.Envelope || campaignsParsedResponse['SOAP-ENV:Envelope'];
      campaignsBody = campaignsEnvelope.Body || campaignsEnvelope['SOAP-ENV:Body'];
      campaignsResponseData = campaignsBody.getCampaignsResponse || campaignsBody['ns1:GetCampaignsResponseMessage'] || campaignsBody.GetCampaignsResponseMessage || campaignsBody['tns:getCampaignsResponse'] || campaignsBody;
      let subscribeCampaignSoapRequest,subscribeResponse,subscribeParsedResponse,subscribeEnvelope,subscribeBody,subscribeResponseData;
      for(const campInfo of campaignsResponseData.campaigns.item){
        subscribeCampaignSoapRequest = `<?xml version="1.0" encoding="utf-8"?>
          <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
                        xmlns:tns="https://ws.tradetracker.com/soap/affiliate">
            <soap:Body>
              <tns:changeCampaignSubscription>
                <affiliateSiteID>${site.ID}</affiliateSiteID>
                <campaignID>${campInfo.ID["_"]}</campaignID>
                <subscriptionAction>subscribe</subscriptionAction>
              </tns:changeCampaignSubscription>
            </soap:Body>
          </soap:Envelope>`;
        console.log(`Subscribing to campaign ${campInfo.ID["_"]}, site ${site.ID}...`);
        subscribeResponse = await axiosInstance.post(soapEndpoint, subscribeCampaignSoapRequest, {
          headers: {
            'SOAPAction': 'https://ws.tradetracker.com/soap/affiliate/changeCampaignSubscription',
            'Content-Type': 'text/xml; charset=utf-8', 
            'Cookie': cookies["tradetracker"][user] ? cookies["tradetracker"][user].join('; ') : ''
          }
        });
        subscribeParsedResponse = await parseXMLResponse(subscribeResponse.data);
        
        subscribeEnvelope = subscribeParsedResponse.Envelope || subscribeParsedResponse['SOAP-ENV:Envelope'];
        subscribeBody = subscribeEnvelope.Body || subscribeEnvelope['SOAP-ENV:Body'];
        subscribeResponseData = subscribeBody['ns1:ChangeCampaignSubscriptionResponseMessage'] || subscribeBody;
        if(!subscribeLogs[campInfo.ID["_"]])
           subscribeLogs[campInfo.ID["_"]] = [];
        subscribeLogs[campInfo.ID["_"]].push(site.ID);
        /*
        campaignsAndTrackingLinks.push({
          "Affiliate site ID":site.ID || "",
          "Affiliate site name":site.name || "",
          "Campaign ID":campInfo.ID["_"] || "",
          "Campaign URL":campInfo.URL["_"] || "",
          "Tracking URL":campInfo.info.trackingURL["_"] || "",
          "Time zone":campInfo.info.timeZone["_"] || ""
        });*/
      }
    }
    return {result:subscribeLogs};
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    throw error;
  }
}
async function getEclicklinkOffers(commands){
  const tokens = JSON.parse(process.env.TOKENS);
  const api_token = tokens["ECLICKLINK"]["USERS"][commands[1].user];
  let page = 1, pageSize = 2000,total = 0;
  let offers = [];
  do{
    let attempts = 0;
    let getOffersResponse;
    do{
      if(attempts > 0)
        await sleep(2000);
      getOffersResponse = await sendRequest({targetUrl:`http://api.eclicklink.com/cps/affiliate/offers?page=${page}&pageSize=${pageSize}`,headers:{'apiKey':api_token},body:{},method:"GET"});
      attempts ++;
    }while(("error" in getOffersResponse) && (attempts < 5));
    if(("error" in getOffersResponse) && (attempts >= 5)){
      return getOffersResponse;
    }
    const responseJson = JSON.parse(getOffersResponse.data);
    const tempOffers = responseJson.data.records.map(resp => ({
      "Offer ID":resp.offerId,
      "Offer name":resp.offerName,
      "Preview URL":resp.previewUrl,
      "Tracking URL":resp.trackingUrl,
      "Geo":resp.geo || "",
      "Currency":resp.currencyId
    }));
    offers = [...offers,...tempOffers];
    total = responseJson.data.total;
    page += 1;
  }while((page-1)*pageSize < total);
  return offers;
}

async function sendRequest(req){
  try{
    const { targetUrl, body, headers,method } = req;
    let response;
    if(method == 'GET'){
      response = await fetch(targetUrl, {
        method: method,
        headers: headers
      });
    }
    else if(method =="POST"){
      response = await fetch(targetUrl, {
      method: method,
      headers: headers,
      body: JSON.stringify(body)
    });
    }
    let theData = await response?.text();
    console.log(theData.slice(0,100),"...");
    let result = {data:theData,status:response.status}
    return result;
  }
  catch(error){
    console.log("Error in sendRequest: "+error.message)
    return {"error":error.message};
  }
}
async function sendRequestDaisycon(url,headers,method,body){
  let result = []
  let page = 1, pageSize = 1000;
  let temp;
  let theUrl;
  let theBody = body;
  let nrOfAttempts = 1;
  let stopCondition;
  do{
    theUrl = url+ `page=${page}&per_page=${pageSize}`;
    console.log("Sending request: "+method+" "+theUrl);
    const {data,status} = await sendRequest({targetUrl:theUrl,body:theBody,headers:headers,method:method});
    console.log("Received status "+status);
    if(status === 204){
      break;
    }
    else if(status === 200){
      page+=1;
      temp = JSON.parse(data);
      result = result.concat(temp);
      stopCondition = (temp.length == pageSize);
    }
    else if(status === 429){
      console.log("Too many requests, retrying...");
      await sleep(10000);
      nrOfAttempts++;
      stopCondition = (nrOfAttempts < 30);
    }
    else{
      result = {status:status,errorMessage:`Daisycon API returned HTTP ${status} for URL ${theUrl} with data: ${data}`};
      break;
    }
  }
  while(stopCondition);
  return result;
}
async function sendRequestPartnerBoost(url,headers,method,body,usePagination,isAmazonRequest,isAmazonLinkRequest){
  try{
    let result = []
    let page = 1, pageSize = 100;
    let temp;
    let theUrl = url
    let theBody = body;
    let stopCondition;
    do{
      if(usePagination){
        if(isAmazonRequest)
          theBody = {...body,page:page,page_size:pageSize};
        else
          theBody = {...body,page:page,limit:pageSize};
      }
      console.log("Sending request: "+method+" "+theUrl+", body: "+JSON.stringify(theBody));
      const {data,status} = await sendRequest({targetUrl:theUrl,body:theBody,headers:headers,method:method});
      console.log("Received status: "+status);
      if(status === 204){
        break;
      }
      else if(status === 200){
        page = page + 1;
        temp = JSON.parse(data);
        if(isAmazonLinkRequest)
          result = result.concat(temp.data);
        else result = result.concat(temp.data.list);
      }
      else{
        throw new Error(`PartnerBoost API returned HTTP ${status} for URL ${theUrl} with data: ${data}`);
      }
      if(!usePagination)
        break;
      stopCondition = (isAmazonRequest ? data.has_more : (temp.data.total > pageSize*(page-1)));
    }
    while(stopCondition);
    return result;
  }
  catch(err){
    console.log("Error in sendRequestWithPagination(): "+err.message);
  }
}
async function exportDaisyconClientID(user,res){
  let clientID = getDaisyconClientID(user);
  if(clientID)
    res.status(200).send({ID:clientID});
  else res.status(500).send({error:"ID not found"});
}
async function exportAdPumpOffers(commands,res){
  getAdPumpOffers(commands[1].user).then(result => {
    console.log('Success: exporting ad pump offers');
    res.status(200).send(result);
    return result;
  }).catch(error => {
    console.error('Failed to export adpump offers:', error);
    res.status(500).send(error);
    return [];
  });
}
async function exportDaisyconOffers(commands,res){
  let media = [];
  let programs = [];
  tempMedia = await sendRequestDaisycon(commands[1].targetUrl + '?',commands[1].headers,commands[1].method,"");
  if("errorMessage" in tempMedia)
      res.status(tempMedia.status).send({errorMsg:tempMedia.errorMessage});
  tempMedia.forEach(med => media.push(med.id));

  programsOfMedia = {}
  for(const med of media){
    programsOfMedia[med] = [];
    tempProgram = await sendRequestDaisycon(commands[2].targetUrl + `?media_id=${med}&order_direction=asc&`,commands[2].headers,commands[2].method,"");
    if("errorMessage" in tempProgram)
      res.status(tempProgram.status).send({errorMsg:tempProgram.errorMessage});
    for(const aTempProgram of tempProgram){
        programsOfMedia[med].push(aTempProgram.id)
    }
    programs = programs.concat(tempProgram);
  }
  const uniquePrograms = [...new Map(programs.map(prg => [prg.id, prg])).values()];
  
  let jsonRows = [];
  let processedRows = [];
  for(const prg of uniquePrograms) {
    let subscribedMedia = Object.entries(programsOfMedia)
      .filter(([_, arr]) => arr.includes(prg.id))
      .map(([theMedia]) => theMedia);
    if(subscribedMedia.length > 0){
      for(crtMedia of subscribedMedia){
        processedRows.push({
          "Program ID":prg.id,
          "Affiliate program name": prg.name,
          "Affiliate Link": "https:"+prg.url.split("&wi")[0]+`&wi=${crtMedia}&ws=%7Bclickid%7D`,
          "GEO":getProgramCountryCode(prg.name),
          "Currency": prg.currency_code
        });
      }
    }
    else{
      processedRows.push({
        "Program ID":prg.id,
        "Affiliate program name": prg.name,
        "Affiliate Link": "https:"+prg.url.split("&wi")[0]+`&wi=&ws=%7Bclickid%7D`,
        "GEO":getProgramCountryCode(prg.name),
        "Currency": prg.currency_code
      });
    }
  }
  jsonRows.push(...processedRows);
  console.log("Exported to daisyconOffers.csv!");
  res.status(200).send({result:jsonRows});
  return jsonRows;
}
async function exportPartnerBoostOffers(commands,res){
  const tokens = JSON.parse(process.env.TOKENS);
  const user = commands[1]["body"]["user"];
  let access_tokens;
  if(user == 1){
    //get for all users
    access_tokens = Object.entries(tokens["PARTNERBOOST"]).map(([key, value]) => value);
  }
  else{
    access_tokens = [tokens["PARTNERBOOST"]["USERS"][user]];
  }
  let brands = [], products = [], amazonProducts = [], amazonLinks = [];
  for(access_token of access_tokens){
    // Get brands
    let req_body = {token:access_token,relationship:"Joined"}
    let tempBrands = await sendRequestPartnerBoost(commands[1]["targetUrl"],commands[1]["headers"],commands[1]["method"],req_body,true,false,false);
    brands = brands.concat(tempBrands);
    
    if(commands[1].commandName == "getProducts"){ 
      let getProductParams = [];
      let getAmazonProductParams = [];
      let tempProductList = [], tempAmazonLinksPromises = [];
      for(brd of tempBrands){
        // Get products
        getProductParams.push({token:access_token,brand_id:brd.brand_id});
        if(getProductParams.length >= 10){
          let tempProductsPromises = getProductParams.map(
            param => sendRequestPartnerBoost("https://app.partnerboost.com/api.php?mod=datafeed&op=list",commands[1]["headers"],"POST",param,true,false,false));
          let tempProducts = await Promise.all(tempProductsPromises);
          tempProducts = tempProducts.flat(1);
          products = [...products,...tempProducts];
          getProductParams = [];
        }
        // Get Amazon products
        getAmazonProductParams.push({token: access_token,default_filter: 1,brand_id: brd.brand_id});
        if(getAmazonProductParams.length >= 10){
          let tempAmazonProductsPromises = getAmazonProductParams.map(
            param => sendRequestPartnerBoost("https://app.partnerboost.com/api/datafeed/get_fba_products",commands[1]["headers"],"POST",param,true,true,false));
          let tempAmazonProducts = await Promise.all(tempAmazonProductsPromises);
          tempAmazonProducts = tempAmazonProducts.flat(1);
          amazonProducts = [...amazonProducts,...tempAmazonProducts];
          getAmazonProductParams = [];
        }
      }
      if(getProductParams.length > 0){
        let tempProductsPromises = getProductParams.map(
          param => sendRequestPartnerBoost("https://app.partnerboost.com/api.php?mod=datafeed&op=list",commands[1]["headers"],"POST",param,true,false,false));
        let tempProducts = await Promise.all(tempProductsPromises);
        tempProducts = tempProducts.flat(1);
        products = [...products,...tempProducts];
        getProductParams = [];
      }
      if(getAmazonProductParams.length > 0){
        let tempAmazonProductsPromises = getAmazonProductParams.map(
          param => sendRequestPartnerBoost("https://app.partnerboost.com/api/datafeed/get_fba_products",commands[1]["headers"],"POST",param,true,true,false));
        let tempAmazonProducts = await Promise.all(tempAmazonProductsPromises);
        tempAmazonProducts = tempAmazonProducts.flat(1);
        amazonProducts = [...amazonProducts,...tempAmazonProducts];
        getAmazonProductParams = [];
      }
      // Get amazon product links
      for(let amPrd of amazonProducts){
        tempProductList.push(amPrd);
        if(tempProductList.length > 10){
        let bodyLinksParam = tempProductList[0].product_id;
          for(tempProd of tempProductList.slice(start=1))
            bodyLinksParam += ","+tempProd.product_id;
          tempAmazonLinksPromises.push(sendRequestPartnerBoost("https://app.partnerboost.com/api/datafeed/get_fba_products_link",commands[1]["headers"],"POST",
              {token:access_token,product_ids:bodyLinksParam},
              false,false,true));
          tempProductList = [];
        }
        if(tempAmazonLinksPromises.length > 100){
          let tempAmazonLinks = await Promise.all(tempAmazonLinksPromises);
          tempAmazonLinks = tempAmazonLinks.flat(1);
          amazonLinks = [...amazonLinks,...tempAmazonLinks];
          tempAmazonLinksPromises = [];
        }
      }
      if(tempProductList.length > 0){
        let bodyLinksParam = tempProductList[0].product_id;
        for(tempProd of tempProductList.slice(start=1))
          bodyLinksParam += ","+tempProd.product_id;
        tempAmazonLinksPromises.push(sendRequestPartnerBoost("https://app.partnerboost.com/api/datafeed/get_fba_products_link",commands[1]["headers"],"POST",
            {token:access_token,product_ids:bodyLinksParam},
            false,false,true));
        tempProductList = [];
      }
      if(tempAmazonLinksPromises.length > 0){
        let tempAmazonLinks = await Promise.all(tempAmazonLinksPromises);
        tempAmazonLinks = tempAmazonLinks.flat(1);
        amazonLinks = [...amazonLinks,...tempAmazonLinks];
        tempAmazonLinksPromises = [];
      }
    }
  }
  
  let result;
  const brandRows = brands.map(brd => ({
    "Brand ID":brd.brand_id,
    "Brand name":brd.merchant_name,
    "Tracking URL": brd.tracking_url,
    "GEO": brd.country,
    "Currency": brd.currency_name
  }));
  if(commands[1].commandName == "getProducts"){
    const productRows = products.map(prd =>({
      "Brand ID":prd.brand_id,
      "Brand name":prd.brand,
      "Name":prd.name,
      "Tracking URL":prd.tracking_url,
      "Tracking short URL":prd.tracking_url_short,
      "Currency":prd.currency
    }));
    const amazonProductRows = amazonProducts.map(amPrd =>({
      "Brand ID": amPrd.brand_id,
      "Brand name": amPrd.brand_name,
      "Name":amPrd.product_name,
      "Tracking URL": amazonLinks.find(prd => prd.product_id == amPrd.product_id)?.link || "",
      "Tracking short URL":"",
      "Currency": amPrd.currency
    }));
    result = [...productRows,...amazonProductRows];
  }
  else{
    result = brandRows;
  }
  
  console.log("Exported to partnerboostOffers.csv!");
  res.status(200).send({result:result});
  return result;
}
async function exportTradeTrackerOffers(commands,res){
  if(!cookies["tradetracker"])
    authTradeTracker(commands[1].user);
  getTradeTrackerOffers(commands[1].user).then(result => {
    console.log('Success:');
    res.status(200).send(result);
    return result;
  }).catch(error => {
    console.error('Failed:', error);
    res.status(500).send(error);
    return [];
  });
}
async function exportKwankoOffers(commands,res){
  const {data:campaignData,status:campaignStatus} = await sendRequest({targetUrl:'https://api.kwanko.com/publishers/campaigns',body:{},headers:commands[1].headers,method:commands[1].method});
  const {data:adsData,status:adsStatus} = await sendRequest({targetUrl:commands[1].targetUrl,body:{},headers:commands[1].headers,method:commands[1].method});
  if(campaignStatus == 200 && adsStatus == 200){
    const headers = ['Domain URL','Deeplink','Media name','GEO', 'Currency'].join(',');
    let crtGeo;
    let crtCurrency;
    let jsonRows = [];  
    let campaignDataJson = JSON.parse(campaignData);
    let adsDataJson = JSON.parse(adsData);
    for(adData of adsDataJson.ads){
      crtGeo = "";
      crtCurrency = "";
      for(campaign of campaignDataJson.campaigns)
        if(campaign.id == adData.campaign.id){
          for(lang of campaign.languages){
            if(lang.includes("_"))
              crtGeo += lang.split("_")[0] + ", ";
            else if(lang.includes(" "))
              crtGeo += lang.split(" ")[0] + ", ";
            else crtGeo += lang+", ";
          }
          crtGeo = crtGeo.substring(0,crtGeo.length-2);
          crtCurrency = campaign.currency;
        }
      for(link of adData.tracked_material_per_websites){
        jsonRows.push({
          "Domain URL":adData.accepted_domains.join(","),
          "Deeplink":link.urls.click,
          "Media name": link.website_per_language.name,
          "GEO": crtGeo,
          "Currency": crtCurrency
          });
      }
    }
  console.log("Exported to kwankoOffers.csv!");
  res.status(200).send({result:jsonRows});
  return jsonRows;
  }
  else{
    console.log("Export failed!");
    res.status(500).send(campaignStatus+" "+adsStatus);
    return [];
  }
}
async function exportEclicklinkOffers(commands,res){
  const result = await getEclicklinkOffers(commands);
  if("error" in result)
    res.status(400).send({result:result});
  else res.status(200).send({result:result});
  return result;
}
//TODO
async function exportConvertSocialOffers(commands,res){
  const tokens = JSON.parse(process.env.TOKENS);
  const api_token = tokens["CONVERTSOCIAL"]["USERS"][commands[1].user];
  let page = 1, pageSize = 1000,attempts = 0;
  let offers = [];
  // Get social media account ID
  do{
    if(attempts > 0)
      await sleep(2000);
    socialMediaResponse = await sendRequest({targetUrl:`https://api.convertsocial.net/v1/public/website`,headers:commands[1].headers,body:{},method:"GET"});  
    attempts ++;
  } while(("error" in socialMediaResponse) && attempts < 5);
  socialMediaData = socialMediaResponse.data;
  // Get referral links
  for(socialMedia of socialMediaData){

  }
}

async function updateDaisycon(commands,res){
  const publisherID = commands[1].body.publisherID;
  // Get all programs and medias
  let medias = await sendRequestDaisycon(url=`https://services.daisycon.com/publishers/${publisherID}/media?order_direction=asc&`,headers=commands[1].headers,method="GET",body={});
  let programs = await sendRequestDaisycon(url=`https://services.daisycon.com/publishers/${publisherID}/programs?&order_direction=asc&`,headers=commands[1].headers,method="GET",body={});
  if("errorMessage" in medias)
      res.status(medias.status).send({errorMsg:medias.errorMessage});
  if("errorMessage" in programs)
    res.status(programs.status).send({errorMsg:programs.errorMessage});
  // Get all programs subscribed to media and subtract them from all programs
  let programsByMedia = {};
  let updateLogs = [];
  for(med of medias){
    const medPrograms = await sendRequestDaisycon(url=`https://services.daisycon.com/publishers/${publisherID}/programs?media_id=${med.id}&order_direction=asc&`,headers=commands[1].headers,method="GET",body={});
    if(!(("errorMessage" in medPrograms) || ("error" in medPrograms))){
      let medProgramIds = medPrograms.map(medProgram => medProgram.id);
      programsByMedia[med.id]=medProgramIds;
    }
    else programsByMedia[med.id]=[];
  }
  for(let program of programs){
    let isMediaSubscribed = {};
    for(med of medias){
      prgList = programsByMedia[med.id];
      if((prgList?.length == 0) || ((prgList?.length > 0 )&& !(prgList.includes(program.id)))){
        try{
            let subscribeResult = await sendRequestDaisycon(`https://services.daisycon.com/publishers/${publisherID}/programs/${program.id}/subscriptions/${med.id}`,commands[1].headers,"POST",{});
            if(("errorMessage" in subscribeResult) && (subscribeResult.status > 300))
              updateLogs.push("Failed to subscribe program "+program.id+" to media "+med.id+": received status "+subscribeResult.status);
            else updateLogs.push("Program "+program.id+" subscribed to media "+med.id);
            await sleep(1500);
        }
        catch(err){
          console.err(err.message);
        }
      }
    }
    /*
    for(let prByMed of programsByMedia){
      isMediaSubscribed[prByMed.mediaID] = false;
    }
    for(let prByMed of programsByMedia){
      if(prByMed.programs.includes(program.id)){
        isMediaSubscribed[prByMed.mediaID] = true;
      }
    }
    for(let prByMed of programsByMedia){
      if(!isMediaSubscribed[prByMed.mediaID]){
        try{
            let subscribeResult = await sendRequestDaisycon(`https://services.daisycon.com/publishers/${publisherID}/programs/${program.id}/subscriptions/${prByMed.mediaID}`,commands[1].headers,"POST",{});
            if(("errorMessage" in subscribeResult) && (subscribeResult.status > 300))
              updateLogs.push("Failed to subscribe program "+program.id+" to media "+prByMed.mediaID+": received status "+subscribeResult.status);
            else updateLogs.push("Program "+program.id+" subscribed to media "+prByMed.mediaID);
        }
        catch(err){
        }
      }
    }*/
  }
  res.status(200).send({result:updateLogs});
}
async function updateTradeTrackerCampaigns(commands,res){
  if(!cookies["tradetracker"] || !cookies["tradetracker"][commands[1].user])
    await authTradeTracker(commands[1].user);
  if(commands[1].commandName == "subscribeAll"){
    subscribeTradeTrackerOffers(commands[1].user).then(result => {
      console.log('Success:');
      res.status(200).send(result);
      return result;
    }).catch(error => {
      console.error('Failed:', error);
      res.status(500).send(error);
      return [];
    });
  }
}
async function subscribeAllAdPump(user,res){
  const tokens = JSON.parse(process.env.TOKENS);
  const api_token = tokens["ADPUMP"]["USERS"][user];
  let page = 1, pageCount = 0;
  let allSubscribedOffers = [];
  do{
    let attempts = 0;
    let getOffersResponse;
    do{
      if(attempts > 0)
        await sleep(2000);
      getOffersResponse = await sendRequest({targetUrl:`https://api.adpump.com/ru/apiWmOffers/?key=${api_token}&format=json&page=${page}`,headers:{},body:{},method:"GET"});
      attempts ++;
    }while(("error" in getOffersResponse) && (attempts < 5));
    if(("error" in getOffersResponse) && (attempts >= 5)){
      return getOffersResponse;
    }
    const responseJson = JSON.parse(getOffersResponse.data);
    pageCount = responseJson.result.pageCount || 1;
    console.log(`Sending AdPump API request to get offers (page ${page}/${pageCount})...`);
    let subscribedOffers = [];
    for(let tempOffer of responseJson.result.offers){
      let subscribeAttempts = 0,subscribeResponse,subscribeResponseData;
      do{
        if(subscribeAttempts > 0)
          await sleep(2000);
        console.log(`Sending AdPump API request to subscribe for offer ${tempOffer.id}...`);
        subscribeResponse = await sendRequest({targetUrl:`https://api.adpump.com/ru/apiWmMyOffers/?key=${api_token}&format=json&act=add&offer=${tempOffer.id}`,headers:{},body:{},method:"GET"});
        subscribeAttempts ++;
      }while(("error" in getOffersResponse) && (subscribeAttempts < 5));
      if(("error" in getOffersResponse) && (subscribeAttempts >= 5)){
        trackingLinks = [];
      }
      subscribeResponseData = JSON.parse(subscribeResponse.data);
      if(subscribeResponseData.result.request?.status && (subscribeResponseData.result.request?.status?.id == 3)){
        subscribedOffers.push(subscribeResponseData.result.request.offer.id);
      }
    }
    //for getting my offers: https://api.adpump.com/ru/apiWmMyOffers/?key=VK5a1GXVXfqv17TG&format=json&page=<pagenr>
    // for subscribing: https://api.adpump.com/ru/apiWmMyOffers/?key=VK5a1GXVXfqv17TG&format=json&act=add&offer=<offer_id>
    allSubscribedOffers = [...allSubscribedOffers,...subscribedOffers];
    page += 1;
  }while((page-1) < pageCount);
  res.status(200).send({result:allSubscribedOffers});
  return allSubscribedOffers;
}
async function generateAndExportEclicklinkDeeplinks(commands,res){
  const result = await getEclicklinkOffers(commands);
  if("error" in result){
    res.status(400).send({result:result});
    return;
  }
  const reqBody = result.map(offer => ({"offer_id":offer["Offer ID"]}))
}

async function applySortAndFilter(data, sortConfig, filters) {
  let result = [...data];
  
  // Apply filters
  if (filters && filters.length > 0) {
    result = result.filter(row => {
      return filters.every(filter => {
        const type = filter.type;
        const filterValue = filter.value?.toString().toLowerCase().trim();
        const operator = filter.operator || '=';
        let crtValue;
        switch(type){
            case 'clicks': crtValue = row.cl; break;
            case 'conversions': crtValue = row.cv; break;
            case 'profit': crtValue = row.pft; break;
            case 'revenue': crtValue = row.rev; break;
            case 'cpc': crtValue = row.cpc; break;
            case 'epc': crtValue = row.epc; break;
            case 'cr': crtValue = row.cr; break;
            case 'roi': crtValue = row.roi; break;
            default: crtValue = row[type]; break;
        }
        if (!filterValue || !crtValue) return true;
        
        // Handle numeric filtering
        if (!isNaN(filterValue) && !isNaN(parseFloat(filterValue))) {
          const numericFilterValue = parseFloat(filterValue);
          if (isNaN(numericFilterValue)) return true;
          switch (operator) {
            case '<': return crtValue < numericFilterValue;
            case '>': return crtValue > numericFilterValue;
            case '=':
            default: return Math.abs(crtValue - numericFilterValue) < 0.000001;
          }
        }
        
        // Handle string filtering
        const stringValue = String(crtValue || '').toLowerCase();
        
        if (filterValue.includes(',')) {
          const filterValues = filterValue.split(',').map(v => v.trim()).filter(v => v);
          return filterValues.some(fv => stringValue.includes(fv));
        }
        
        return stringValue.includes(filterValue);
      });
    });
  }
  
  // Apply sorting
  if (sortConfig && sortConfig.key) {
    result.sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      const aStr = String(aValue || '');
      const bStr = String(bValue || '');
      return sortConfig.direction === 'asc' 
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });
  }
  
  return result;
}

async function handleSortFilterResponse(res, session, sortConfig, filters, requestedPage = 1) {
  try {
    // Apply sort/filter
    let processedData;
    if(session.currentFilters == filters && session.currentSortConfig == sortConfig){
      processedData = session.sortedFilteredData;
    }
    else {
      processedData = await applySortAndFilter(session.data, sortConfig, filters);
      session.sortedFilteredData = processedData;
      session.currentSortConfig = sortConfig;
      session.currentFilters = filters;
    }
    // Recalculate totals for filtered data
    const totals = await dataController.processDataInChunks(processedData,'getTotals');
    // Update session with processed data
    
    // Calculate new pagination
    const totalPages = calculateTotalPages(processedData,totals);
    const itemsPerPage = Math.ceil(processedData.length / totalPages);
    
    // Return initial pages (1, 2, and last)
    const pageNumber = Math.max(1, Math.min(requestedPage, session.totalPages));
    const resultPage = getDataPage(processedData, totals, pageNumber, session.totalPages);
    
    const responseObj = {
      pages: resultPage,
      totals: totals,
      total_records: processedData.length,
      total_pages: totalPages,
      page_size: itemsPerPage,
      session_id: session.sessionId
    };

    sendSafeJsonResponse(res, responseObj);
    
  } catch (error) {
    console.error('Error in handleSortFilterResponse:', error);
    throw error;
  }
}

// Helper to calculate totals
/*
function calculateTotals(data) {
  if (!Array.isArray(data) || data.length === 0) return {};
  
  const totals = {};
  const numericFields = new Set();
  
  // Identify numeric fields
  if (data.length > 0) {
    Object.keys(data[0]).forEach(key => {
      if (typeof data[0][key] === 'number') {
        numericFields.add(key);
      }
    });
  }
  
  // Calculate totals for numeric fields
  numericFields.forEach(field => {
    totals[field] = data.reduce((sum, row) => sum + (row[field] || 0), 0);
  });
  
  return totals;
}*/

mongoose.connection.once('open', () => {
  // Wrap models for performance monitoring
  const models = require('./models');
  Object.keys(models).forEach(modelName => {
    if (models[modelName].prototype instanceof mongoose.Model) {
      mongoMonitor.wrapModel(models[modelName]);
    }
  });
  console.log('MongoDB performance monitoring enabled');
});

app.use((req, res, next) => {
  console.log('Received request:', req.method, req.url);
  next();
});

// Enable CORS for all routes
app.use(cors({ 
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow non-browser requests
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// Serve static files (like your GitHub Pages HTML)
app.use(express.static(path.join(__dirname, '../public')));

app.get('/admin/mongo-stats', async (req, res) => {
  try {
    const report = mongoMonitor.getPerformanceReport();
    const connectionStats = await mongoMonitor.getConnectionStats();
    
    // Get collection stats for main collections
    const collections = ['aggregations', 'campaigns', 'countries', 'isps', 'subids', 'zones'];
    const collectionStats = {};
    
    for (const collection of collections) {
      const stats = await mongoMonitor.getCollectionStats(collection);
      if (stats) {
        collectionStats[collection] = {
          count: stats.count,
          sizeMB: Math.round(stats.size / 1024 / 1024 * 100) / 100,
          avgDocSize: Math.round(stats.avgObjSize),
          indexSizeMB: Math.round(stats.totalIndexSize / 1024 / 1024 * 100) / 100
        };
      }
    }
    
    res.json({
      performance: report,
      connection: connectionStats,
      collections: collectionStats,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error getting MongoDB stats:', error);
    res.status(500).json({ error: 'Failed to get MongoDB statistics' });
  }
});

// Proxy endpoint
app.post('/proxy',express.json(), async (req, res) => {
  try{
    req.body.headers["accept"]="application/json";
    console.log(req.body);
    const {data,status} = await sendRequest(req.body);
    console.log(data);
    res.status(status).send(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/reportAPI/:reportType', express.json(), async (req, res) => {
  try {
    const { reportType } = req.params;
    const { start_date, end_date, filters = [], page = 1, session_id = null, fetch_pages } = req.body;
    
    // Check memory usage
    const memUsage = checkMemoryUsage();
    if (memUsage.heapUsed > PAGINATION_CONFIG.MAX_TOTAL_MEMORY) {
      return res.status(503).json({
        error: 'Server memory usage critically high',
        message: 'Server is under extreme load. Please try again in a few minutes.',
        suggestion: 'Consider using smaller date ranges if possible'
      });
    }
    
    if(reportType == 'reset_cache'){
      await cacheController.clearCache();
      res.status(200).json({ message: 'Cache cleared successfully' });
      return;
    }
    
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date are required' });
    }
    
    let reportData;
    let session;
    let ts;
    
    // FIXED: Better traffic source handling
    if(filters && filters.some(f => f.type === 'traffic_source')){
      const ts_filter = filters.find(f => f.type === 'traffic_source');
      ts = ts_filter.value.split(",").map(s => s.trim()).map(s => parseInt(s, 10)).filter(n => !isNaN(n)).sort((a,b) => a-b);
    } else {
      ts = dataController.binom_traffic_sources;
    }
    
    // FIXED: Improved session matching
    if (session_id && paginationSessions.has(session_id)) {
      session = paginationSessions.get(session_id);
      console.log(`Found existing session ${session_id}`);
      
      // FIXED: Verify session matches current request parameters
      const sessionMatches = (
        session.traffic_sources && 
        Array.isArray(session.traffic_sources) && 
        Array.isArray(ts) &&
        session.traffic_sources.length === ts.length &&
        session.traffic_sources.every((val, index) => val === ts[index])
      );
      
      if (sessionMatches) {
        reportData = { data: session.data, totals: session.totals };
        console.log(`Using existing session ${session_id} with ${session.data.length} records`);
      } else {
        console.log(`Session ${session_id} parameters don't match, creating new session`);
        session = null;
      }
    }
    
    // Generate new report data if no valid session
    if (!session || !reportData) {
      console.log(`Generating new report data for ${reportType}...`);
      reportData = await dataController.getReport(
        reportType,
        start_date,
        end_date,
        filters
      );
      
      // FIXED: Create session with proper traffic source tracking
      session = createSession(reportData.data, reportData.totals, ts);
      if (!session) {
        return sendLimitedFallbackResponse(res, reportData.data, reportData.totals, page);
      }
      
      console.log(`Created new session ${session.sessionId} with ${reportData.data.length} records`);
    }
    
    // Handle initial page fetch (pages 1, 2, and last)
    if (fetch_pages === 'initial') {
      const totalPages = session.totalPages;
      const itemsPerPage = Math.ceil(session.data.length / totalPages);
      let resultPage;
      
      // Page 1
      if (session.data.length > 0) {
        resultPage = session.data.slice(0, itemsPerPage);
        session.pagesRetrieved.add(1);
      }
      
      console.log(`Returning initial page with ${resultPage?.length || 0} items`);
      
      return res.json({
        data: resultPage || [],
        totals: session.totals,
        pagination_info: {
          is_paginated: totalPages > 1,
          current_page: 1,
          total_pages: totalPages,
          page_size: itemsPerPage,
          total_records: session.data.length,
          has_next_page: totalPages > 1,
          has_previous_page: false,
          session_id: session.sessionId,
          pages_retrieved: Array.from(session.pagesRetrieved),
          is_session_complete: false
        }
      });
    }
    
    // Standard single page response (backward compatibility)
    sendPaginatedResponse(res, reportData, page, ts, session?.sessionId);
    
  } catch (error) {
    console.error('Report API error:', error);
    res.status(500).json({ 
      error: 'Failed to generate report',
      message: error.message
    });
  }
});

app.post('/reportAPI/:reportType/sortAndFilter', express.json(), async (req, res) => {
  try {
    const { reportType } = req.params;
    const { start_date, end_date, filters = [], sort_config, session_id,page } = req.body;
    
    if (!session_id || !paginationSessions.has(session_id)) {
      // Generate new data if no session
      const reportData = await dataController.getReport(
        reportType,
        start_date,
        end_date,
        filters
      );
      // Create session for sorted/filtered data
      const session = createSession(reportData.data, reportData.totals);
      if (!session) {
        return res.status(413).json({ error: 'Dataset too large' });
      }
      
      // Apply sort/filter and return initial pages
      return handleSortFilterResponse(res, session, sort_config, filters,page);
    }
    const session = paginationSessions.get(session_id);
    return handleSortFilterResponse(res, session, sort_config, filters,page);
    
  } catch (error) {
    console.error('Sort/filter error:', error);
    res.status(500).json({ error: 'Failed to sort/filter data' });
  }
});
app.post('/reportAPI/:reportType/size', express.json(), async (req, res) => {
  try {
    const { reportType } = req.params;
    const { start_date, end_date, filters = [] } = req.body;
    
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date are required' });
    }
    
    // Estimate size based on date range and filters
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    
    res.json({
      reportType,
      dateRange: { start_date, end_date, days: daysDiff },
      filters,
      recommendation: daysDiff > 90 ? 'Consider using smaller date ranges for better performance' : 'Date range looks good',
      memory_status: getActualMemoryUsage(),
      limits: {
        max_session_size_gb: Math.round(PAGINATION_CONFIG.MAX_SESSION_SIZE / 1024 / 1024 / 1024),
        max_total_storage_gb: Math.round(PAGINATION_CONFIG.MAX_TOTAL_MEMORY / 1024 / 1024 / 1024),
        max_page_size_gb: Math.round(PAGINATION_CONFIG.MAX_RESPONSE_SIZE / 1024 / 1024 / 1024)
      }
    });
    
  } catch (error) {
    console.error('Size check error:', error);
    res.status(500).json({ error: 'Failed to check dataset size' });
  }
});

// Add endpoint to check session status
app.post('/reportAPI/:reportType/session-status', express.json(), async (req, res) => {
  try {
    const { session_id } = req.body;
    
    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }
    
    if (!paginationSessions.has(session_id)) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }
    
    const session = paginationSessions.get(session_id);
    
    res.json({
      session_id: session_id,
      total_pages: session.totalPages,
      pages_retrieved: Array.from(session.pagesRetrieved).sort((a,b) => a-b),
      is_complete: session.isComplete,
      progress: `${session.pagesRetrieved.size}/${session.totalPages}`,
      remaining_pages: Array.from(
        {length: session.totalPages}, 
        (_, i) => i + 1
      ).filter(page => !session.pagesRetrieved.has(page)),
      created_at: new Date(session.createdAt).toISOString(),
      memory_usage_mb: Math.round(session.memoryUsage / 1024 / 1024),
      memory_usage_gb: Math.round(session.memoryUsage / 1024 / 1024 / 1024 * 100) / 100,
      item_count: session.itemCount
    });
  } catch (error) {
    console.error('Session status error:', error);
    res.status(500).json({ error: 'Failed to get session status' });
  }
});

// Add endpoint to manually complete/cleanup a session
app.post('/reportAPI/:reportType/complete-session', express.json(), async (req, res) => {
  try {
    const { session_id } = req.body;
    
    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }
    
    if (!paginationSessions.has(session_id)) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }
    
    const session = paginationSessions.get(session_id);
    session.isComplete = true;
    
    console.log(`Session ${session_id} manually marked as complete`);
    
    // Clean up after a delay
    setTimeout(() => cleanupSession(session_id), 60000); // 1 minute delay
    
    res.json({ 
      message: 'Session marked as complete',
      session_id: session_id,
      total_pages: session.totalPages,
      pages_retrieved: session.pagesRetrieved.size
    });
  } catch (error) {
    console.error('Complete session error:', error);
    res.status(500).json({ error: 'Failed to complete session' });
  }
});

// Memory monitoring endpoint with new limits
app.get('/admin/memory-status', (req, res) => {
  const actualMemory = getActualMemoryUsage();
  const memoryStats = {
    node_memory: {
      heap_used_mb: actualMemory.heapUsedMB,
      heap_used_gb: Math.round(actualMemory.heapUsed / 1024 / 1024 / 1024 * 100) / 100,
      heap_total_mb: actualMemory.heapTotalMB,
      heap_total_gb: Math.round(actualMemory.heapTotal / 1024 / 1024 / 1024 * 100) / 100,
      external_mb: actualMemory.externalMB,
      heap_usage_percent: Math.round((actualMemory.heapUsed / actualMemory.heapTotal) * 100)
    },
    session_tracking: {
      tracked_memory_mb: Math.round(totalMemoryUsage / 1024 / 1024),
      tracked_memory_gb: Math.round(totalMemoryUsage / 1024 / 1024 / 1024 * 100) / 100,
      active_sessions: paginationSessions.size,
      max_sessions: PAGINATION_CONFIG.MAX_CONCURRENT_SESSIONS
    },
    limits: {
      max_total_memory_gb: Math.round(PAGINATION_CONFIG.MAX_TOTAL_MEMORY / 1024 / 1024 / 1024),
      max_session_size_gb: Math.round(PAGINATION_CONFIG.MAX_SESSION_SIZE / 1024 / 1024 / 1024),
      max_page_size_gb: Math.round(PAGINATION_CONFIG.MAX_RESPONSE_SIZE / 1024 / 1024 / 1024),
      max_items_per_session: PAGINATION_CONFIG.MAX_ITEMS_PER_SESSION
    },
    sessions: Array.from(paginationSessions.entries()).map(([id, session]) => ({
      session_id: id,
      size_mb: Math.round(session.memoryUsage / 1024 / 1024),
      size_gb: Math.round(session.memoryUsage / 1024 / 1024 / 1024 * 100) / 100,
      items: session.itemCount,
      pages: session.totalPages,
      retrieved: session.pagesRetrieved.size,
      complete: session.isComplete,
      age_minutes: Math.round((Date.now() - session.createdAt) / 60000)
    }))
  };
  
  res.json(memoryStats);
});

app.post('/export',express.json(),async (req,res) => {
  try {
    let result;
    const { commands } = req.body;
    const offersIndex = commands[0].commandName.toLowerCase().indexOf("offers");
    const isOfferCommand = offersIndex !== -1;
    console.log(commands[1].user);
    if(isOfferCommand){
      result = await cacheController.getAffiliateOffers(commands[0].commandName.toLowerCase().substring(0,offersIndex),commands[1].user);
      if(result && (Object.keys(result).length > 0)){
        console.log("Exported cached data for "+commands[0].commandName);
        res.status(200).send({result:result});
      }
    }
    if(!result || (Object.keys(result).length == 0)){
      switch (commands[0].commandName) {
        case 'adPumpOffers': result = exportAdPumpOffers(commands,res); break;
        case 'daisyconClientID': exportDaisyconClientID(commands[1].user,res);break;
        case 'daisyconOffers': result = exportDaisyconOffers(commands,res); break;
        case 'partnerboostOffers': result = exportPartnerBoostOffers(commands,res); break;
        case 'tradeTrackerOffers': result = exportTradeTrackerOffers(commands,res); break;
        case 'kwankoOffers': result = exportKwankoOffers(commands,res); break;
        case 'eclicklinkOffers': result = exportEclicklinkOffers(commands,res); break;
        case 'convertSocialOffers': result = exportConvertSocialOffers(commands,res); break;
        default: throw new Error('Invalid /export operation!');
      }
      if(isOfferCommand)
        cacheController.setAffiliateOffers(commands[0].commandName.toLowerCase().substring(0,offersIndex),commands[1].user,await result);
    }
  } catch (error) {
    console.log("Error in /export: "+error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/update',express.json(),async (req,res) => {
  try{
    const {commands} = req.body;
    switch(commands[0].commandName){
      case 'daisyconUpdate': await updateDaisycon(commands,res); break;
      case 'tradeTrackerUpdate': await updateTradeTrackerCampaigns(commands,res);break;
      case 'adPumpSubscribeAll': await subscribeAllAdPump(commands[1].user,res); break;
      default: throw new Error('Invalid /update operation!');
    }
  } catch (error) {
    console.log("Error in /update: "+error.message);
    res.status(500).send({ errorMsg: error.message });
  }
});

// Endpoint to save the token to a file
app.get('/save-token',limiter, (req, res) => {
  const token = req.query.token;
  if (token) {
    const tokenBytes = Buffer.byteLength(token, 'utf8');
    if (tokenBytes > 10240) { // 10 * 1024
      console.warn('Token too large:', tokenBytes, 'bytes');
      return res.status(413).send('Token too large (max 10KB)');
    }
    fs.writeFile('tokens.txt', `${token}\n`, (err) => {
      if (err) {
        console.error('Error saving token:', err);
        return res.status(500).send('Error saving token');
      }
      console.log('Token saved:', token);
      res.send('Token saved successfully!');
    });
  } else {
    res.status(400).send('No token provided');
  }
});

// Error handling middleware for authentication errors
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid token provided'
    });
  } else {
    next(err);
  }
});

// Health check endpoint (unprotected)
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    message: 'Server is running',
    memory_limits: {
      max_session_size_gb: Math.round(PAGINATION_CONFIG.MAX_SESSION_SIZE / 1024 / 1024 / 1024),
      max_total_storage_gb: Math.round(PAGINATION_CONFIG.MAX_TOTAL_MEMORY / 1024 / 1024 / 1024),
      max_page_size_gb: Math.round(PAGINATION_CONFIG.MAX_RESPONSE_SIZE / 1024 / 1024 / 1024)
    }
  });
});

process.on('SIGINT', async () => {
  await mongoose.disconnect();
  console.log('MongoDB disconnected (app termination)');
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Memory limits: Session=${Math.round(PAGINATION_CONFIG.MAX_SESSION_SIZE / 1024 / 1024 / 1024)}GB, Total=${Math.round(PAGINATION_CONFIG.MAX_TOTAL_MEMORY / 1024 / 1024 / 1024)}GB, Page=${Math.round(PAGINATION_CONFIG.MAX_RESPONSE_SIZE / 1024 / 1024 / 1024)}GB`);
});