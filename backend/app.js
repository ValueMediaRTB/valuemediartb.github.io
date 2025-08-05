require('dotenv').config();
const express = require('express');
const app = express();
const axios = require('axios');
const authController = require('./controllers/authController');
const { authenticate, optionalAuth, requireAdmin } = require('./middleware/auth');
const bcrypt = require('bcrypt');
const PORT = 3000;
const cacheController = require('./controllers/cacheController');
const { 
  checkLoginRateLimit, 
  expressRateLimit, 
  getLoginAttemptStats 
} = require('./middleware/rateLimiter');
const cors = require('cors');
const dataController = require('./controllers/dataController');
const affiliateNetworksController = require('./controllers/affiliateNetworksController');
const fs = require('fs');
const http = require('http');
const jobManager = require('./services/jobManager'); 
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const mongoMonitor = require('./utils/mongoMonitor');
const { withRetry } = require('./utils/mongoRetry');
const path = require('path');
const redis = require('./config/redis');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const sessionManager = require('./services/sessionManager');
const {soap} = require('strong-soap');
const User = require('./models/User');
const xml2js = require('xml2js');
const { castObject } = require('./models/Campaign');
const { subscribe } = require('diagnostics_channel');

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [
      'https://traffictools.site',
      'https://www.traffictools.site'
    ]
  : [
      'http://localhost:3001',
      'http://localhost:' + PORT
    ];
console.log(allowedOrigins);
const cookies = {};
let axiosInstance;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  // Optimize for your use case
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e8 // 100MB for large job updates
});
io.on('connection', socket => {
  console.log(`Client connected: ${socket.id}`);
  
  socket.on('authenticate', async token => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || '7yH05"bif@Xkvh8;d£B?e|xFU]81qnN@');
      socket.userId = decoded.userId;
      socket.join(`user_${decoded.userId}`);
      socket.emit('authenticated', { userId: decoded.userId });
    } catch (error) {
      socket.emit('auth_error', { error: 'Invalid token' });
    }
  });

  socket.on('subscribe_job', async ({ jobId }) => {
    const job = await jobManager.getJob(jobId);
    if (!job) {
      return socket.emit('job_error', { jobId, error: 'Job not found' });
    }
    
    // Verify user owns this job
    if (socket.userId && job.userId !== socket.userId.toString()) {
      return socket.emit('job_error', { jobId, error: 'Unauthorized' });
    }
    
    socket.join(`job_${jobId}`);
    socket.emit('job_subscribed', { jobId, status: job.status, progress: job.progress });
    
    // Send current status
    if (job.status === 'completed') {
      socket.emit('job_complete', { 
        jobId, 
        status: 'completed',
        resultUrl: `/api/job/${jobId}/result` 
      });
    }
  });

  socket.on('unsubscribe_job', ({ jobId }) => {
    socket.leave(`job_${jobId}`);
  });
  
  socket.on('subscribe_session', sessionId => {
    socket.join(`session_${sessionId}`);
  });
  
  socket.on('unsubscribe_session', sessionId => {
    socket.leave(`session_${sessionId}`);
  });
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});
global.io = io;

// Rate limit: more relaxed
const limiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 2, // 2 requests per second
  message: 'Too many requests - please wait',
});
let accessToken;
// In-memory storage for paginated sessions
let totalMemoryUsage = 0;
let lastMemoryCheck = Date.now();

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Start memory monitoring with relaxed frequency
setInterval(checkMemoryUsage, sessionManager.PAGINATION_CONFIG.MEMORY_CHECK_INTERVAL);

// Enhanced cleanup with relaxed criteria
/*
setInterval(() => {
  const now = Date.now();
  const sessionsToCleanup = [];
  
  for (const [sessionId, session] of paginationSessions.entries()) {
    const isExpired = now - session.createdAt > sessionManager.PAGINATION_CONFIG.SESSION_TIMEOUT;
    const isCompletedAndOld = session.isComplete && 
      (now - session.createdAt > sessionManager.PAGINATION_CONFIG.CLEANUP_AFTER_COMPLETION);
    
    if (isExpired || isCompletedAndOld) {
      sessionsToCleanup.push(sessionId);
    }
  }
  
  sessionsToCleanup.forEach(cleanupSession);
  
  if (sessionsToCleanup.length > 0) {
    console.log(`Periodic cleanup: removed ${sessionsToCleanup.length} sessions`);
  }
}, 15 * 60 * 1000); // Check every 15 minutes
*/

/**
 * Safe JSON response sender with automatic chunking
 */
async function sendSafeJsonResponse(data, jobData = {}) {
  const { jobId, socketId } = jobData;
  const socket = socketId ? io.sockets.sockets.get(socketId) : null;
  
  try {
    if (jobId) {
      await jobManager.completeJob(jobId, data, null, socket);
    }
    return true;
  } catch (error) {
    if (error.message.includes('Invalid string length') && socket) {
      try {
        // Send data in chunks via WebSocket
        socket.emit('job_data', { 
          jobId, 
          type: 'metadata', 
          data: { 
            totals: data.totals, 
            pagination_info: data.pagination_info 
          } 
        });
        
        const CHUNK_SIZE = 500;
        if (Array.isArray(data.data)) {
          const chunks = Math.ceil(data.data.length / CHUNK_SIZE);
          for (let i = 0; i < data.data.length; i += CHUNK_SIZE) {
            socket.emit('job_data', { 
              jobId, 
              type: 'chunk', 
              chunkNumber: Math.floor(i / CHUNK_SIZE) + 1, 
              totalChunks: chunks, 
              data: data.data.slice(i, i + CHUNK_SIZE) 
            });
          }
        }
        
        socket.emit('job_complete', { 
          jobId, 
          type: 'complete', 
          status: 'success',
          deliveryMethod: 'websocket_chunks'
        });
        
        await jobManager.completeJob(jobId, { 
          status: 'delivered_via_websocket', 
          chunks, 
          totals: data.totals 
        }, null, socket);
        
        return true;
      } catch (wsError) {
        console.error('WebSocket delivery failed:', wsError);
        if (jobId) {
          await jobManager.completeJob(jobId, null, 'WebSocket delivery failed', socket);
        }
        return false;
      }
    }
    
    if (jobId) {
      await jobManager.completeJob(jobId, null, error.message, socket);
    }
    throw error;
  }
}

/**
 * Fallback response when session creation fails - UPDATED WITH SMALLER LIMIT
 * @param {Response} res - Express response object
 * @param {Array} data - Data array
 * @param {Object} totals - Totals object
 * @param {Number} requestedPage - Requested page number
 */
async function sendLimitedFallbackResponse(data, totals, requestedPage, jobData = {}) {
  const { jobId, userId, socketId } = jobData;
  const socket = socketId ? io.sockets.sockets.get(socketId) : null;
  
  console.log('Using limited fallback response (no session)');
  
  // Much smaller limit for fallback
  const maxItems = 10000;
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
      warning: `Data truncated to ${maxItems} items due to size limits`,
      original_size: Array.isArray(data) ? data.length : 1
    }
  };

  try {
    if (jobId) {
      await jobManager.completeJob(jobId, responseObj, null, socket);
    }
    return true;
  } catch (error) {
    console.error('Fallback response failed:', error);
    if (jobId) {
      await jobManager.completeJob(jobId, null, 'Fallback response failed', socket);
    }
    throw new Error('Data delivery failed at all levels');
  }
}

/**
 * Enhanced sendPaginatedResponse with better error handling
 * @param {Response} res - Express response object
 * @param {Object} reportData - Report data with data and totals
 * @param {Number} requestedPage - Page number requested (1-based)
 * @param {String} sessionId - Optional session ID for continuing pagination
 */
async function sendPaginatedResponse(reportData, requestedPage = 1, traffic_sources = [], sessionId = null, jobData) {
  const { data, totals } = reportData;
  const { jobId, userId, socketId } = jobData || {};
  const socket = socketId ? io.sockets.sockets.get(socketId) : null;
  
  try {
    if (sessionManager.isResponseTooLarge(reportData)) {
      console.log('Response requires pagination...');
      let session;
      
      if (sessionId) {
        session = await sessionManager.getSession(sessionId);
      }
      
      if (!session) {
        sessionId = await sessionManager.createSession(data, totals, traffic_sources);
        if (sessionId) {
          session = await sessionManager.getSession(sessionId);
          console.log(`Created new session ${sessionId} with ${data.length} records`);
        }
        
        if (!session) {
          console.warn('Failed to create session, using fallback');
          return await sendLimitedFallbackResponse(data, totals, requestedPage, jobData);
        }
      }
      
      const pageNumber = Math.max(1, Math.min(requestedPage, session.totalPages));
      const pageData = sessionManager.getDataPage(session.data, session.totals, pageNumber, session.totalPages);
      
      session.pagesRetrieved.add(pageNumber);
      await sessionManager.updateSession(sessionId, {
        pagesRetrieved: JSON.stringify(Array.from(session.pagesRetrieved))
      });
      
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
          pages_retrieved: Array.from(session.pagesRetrieved).sort((a, b) => a - b),
          is_session_complete: session.isComplete
        }
      };
      
      await sendSafeJsonResponse(responseObj, jobData);
      
    } else {
      const responseObj = {
        data,
        totals,
        page: 1,
        total_pages: 1,
        page_size: Array.isArray(data) ? data.length : 1,
        total_records: Array.isArray(data) ? data.length : 1,
        pagination_info: {
          is_paginated: false,
          session_id: sessionId
        }
      };
      
      await sendSafeJsonResponse(responseObj, jobData);
    }
  } catch (error) {
    console.error('Error in sendPaginatedResponse:', error);
    
    if (sessionId) {
      await sessionManager.cleanupSession(sessionId);
    }
    
    if (jobId) {
      await jobManager.completeJob(jobId, null, error.message, socket);
    }
    
    throw error;
  }
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
        if (!filterValue) return true;
        if (!crtValue && filterValue) return false;
        const groupKeys = ["pv","sv","campId","exadsCamp","zone","name"];
        // Handle numeric keys
        if(groupKeys.includes(type) && !isNaN(filterValue)){
          const stringValue = String(crtValue || '');
          return stringValue.startsWith(filterValue);
        }
        // Handle numeric metrics filtering
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
        const stringValue = String(crtValue || '').toLowerCase().trim();
        
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

async function handleSortFilterResponse(session, sortConfig, filters, requestedPage = 1, jobData) {
  const { jobId, userId, socketId } = jobData || {};
  const socket = socketId ? io.sockets.sockets.get(socketId) : null;
  
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
    
    // Calculate new pagination
    const totalPages = sessionManager.calculateTotalPages(processedData, totals);
    const itemsPerPage = Math.ceil(processedData.length / totalPages);
    
    // Return requested page
    const pageNumber = Math.max(1, Math.min(requestedPage, totalPages));
    const resultPage = sessionManager.getDataPage(processedData, totals, pageNumber, totalPages);
    
    const responseObj = {
      ...resultPage,
      pagination_info: {
        is_paginated: true,
        current_page: pageNumber,
        total_pages: totalPages,
        page_size: itemsPerPage,
        total_records: processedData.length,
        session_id: session.sessionId,
        has_next_page: pageNumber < totalPages,
        has_previous_page: pageNumber > 1
      }
    };

    await sendSafeJsonResponse(responseObj, jobData);
    
  } catch (error) {
    console.error('Error in handleSortFilterResponse:', error);
    if (jobId) {
      await jobManager.completeJob(jobId, null, `Sort/filter operation failed: ${error.message}`, socket);
    }
    throw error;
  }
}
async function processReportAPIBackground(jobId, reportType, start_date, end_date, filters, page, sessionId, userId, socketId) {
  let timeoutId;
  const socket = socketId ? io.sockets.sockets.get(socketId) : null;
  
  try {
    console.log(`Processing background job ${jobId} for user ${userId}`);
    
    const currentJob = await jobManager.getJob(jobId);
    if (!currentJob || currentJob.status === 'cancelled') {
      console.log(`Job ${jobId} was cancelled before processing started`);
      return;
    }
    
    await jobManager.updateJob(jobId, {
      status: 'processing',
      progress: 2,
      message: '/reportAPI called...'
    }, socket);
    
    timeoutId = setTimeout(async () => {
      const job = await jobManager.getJob(jobId);
      if (job && (job.status === 'processing' || job.status === 'started')) {
        await jobManager.updateJob(jobId, {
          status: 'timeout',
          progress: 100,
          message: `Job exceeded timeout limit`,
          error: 'Job timed out'
        }, socket);
      }
      console.log(`⏰ Job ${jobId} timed out after ${jobManager.JOB_CONFIG.JOB_TIMEOUT / 60000} minutes`);
    }, jobManager.JOB_CONFIG.JOB_TIMEOUT);

    if (reportType === 'reset_cache') {
      await jobManager.updateJob(jobId, {
        progress: 80,
        message: 'Resetting cache...'
      }, socket);
      await cacheController.clearCache();
      clearTimeout(timeoutId);
      await jobManager.completeJob(jobId, { message: 'Cache cleared successfully' }, null, socket);
      return;
    }
    
    if (!start_date || !end_date) {
      clearTimeout(timeoutId);
      await jobManager.completeJob(jobId, null, 'Start date and end date are required', socket);
      return;
    }
    
    await jobManager.updateJob(jobId, {
      progress: 4,
      message: `Fetching data from external API for ${reportType}`
    }, socket);
    
    // Check memory usage
    const memUsage = sessionManager.getActualMemoryUsage();
    if (memUsage.heapUsed > sessionManager.PAGINATION_CONFIG.MAX_TOTAL_MEMORY) {
      clearTimeout(timeoutId);
      await jobManager.completeJob(jobId, null, 'Server memory usage critically high.', socket);
      return;
    }
    
    let reportData;
    let session;
    let ts;
    
    // Handle traffic source filters
    if (filters && filters.some(f => f.type === 'traffic_source')) {
      const ts_filter = filters.find(f => f.type === 'traffic_source');
      ts = ts_filter.value.split(",").map(s => s.trim()).map(s => parseInt(s, 10)).filter(n => !isNaN(n)).sort((a, b) => a - b);
    } else {
      ts = dataController.binom_traffic_sources;
    }
    
    // Check for existing session
    if (sessionId) {
      session = await sessionManager.getSession(sessionId);
      if (session) {
        console.log(`Found existing session ${sessionId}`);
        
        const sessionMatches = (
          session.traffic_sources && 
          Array.isArray(session.traffic_sources) && 
          Array.isArray(ts) &&
          session.traffic_sources.length === ts.length &&
          session.traffic_sources.every((val, index) => val === ts[index])
        );
        
        if (sessionMatches) {
          reportData = { data: session.data, totals: session.totals };
          console.log(`Using existing session ${sessionId} with ${session.data.length} records`);
        } else {
          console.log(`Session ${sessionId} parameters don't match, creating new session`);
          session = null;
        }
      }
    }
    
    // Generate new report data if no valid session
    if (!session || !reportData) {
      console.log(`Generating new report data for ${reportType}...`);
      
      // Update progress periodically during data fetch
      /*
      const progressInterval = setInterval(async () => {
        const currentJob = await jobManager.getJob(jobId);
        if (currentJob && currentJob.status === 'processing') {
          await jobManager.updateJob(jobId, {
            progress: currentJob.progress,
            message: currentJob.message
          }, socket);
        } else {
          clearInterval(progressInterval);
        }
      }, 5000);
      */
      reportData = await dataController.getReport(
        reportType,
        start_date,
        end_date,
        filters,
        jobId
      );
      
      //clearInterval(progressInterval);
      
      const updatedJob = await jobManager.getJob(jobId);
      if (!updatedJob || updatedJob.status === 'cancelled') {
        clearTimeout(timeoutId);
        console.log(`Job ${jobId} was cancelled during processing`);
        return;
      }
      
      // Create session
      const newSessionId = await sessionManager.createSession(reportData.data, reportData.totals, ts);
      if (newSessionId) {
        session = await sessionManager.getSession(newSessionId);
        console.log(`Created new session ${newSessionId} with ${reportData.data.length} records`);
      }
    }
    
    clearTimeout(timeoutId);
    await jobManager.updateJob(jobId, {
      progress: 95,
      message: 'Report completed successfully! Preparing response...'
    }, socket);
    
    // Send paginated response
    await sendPaginatedResponse(reportData, page, ts, session?.sessionId, {
      jobId,
      userId,
      socketId
    });
    
  } catch (error) {
    console.error('Report API error:', error);
    clearTimeout(timeoutId);
    await jobManager.completeJob(jobId, null, `Report generation failed: ${error.message}`, socket);
  }
}
async function processReportSortFilterAPIBackground(jobId, reportType, start_date, end_date, filters, sort_config, session_id, page, socketId) {
  const socket = socketId ? io.sockets.sockets.get(socketId) : null;
  
  try {
    console.log(`Processing sort/filter background job ${jobId} for socket ${socketId}`);
    
    // Check if job was cancelled
    const currentJob = await jobManager.getJob(jobId);
    if (!currentJob || currentJob.status === 'cancelled') {
      console.log(`Job ${jobId} was cancelled before processing started`);
      return;
    }
    
    await jobManager.updateJob(jobId, {
      status: 'processing',
      progress: 2,
      message: 'Initializing sort/filter operation...'
    }, socket);
    
    let session;

    if (!session_id) {
      await jobManager.updateJob(jobId, {
        progress: 5,
        message: 'No existing session found, generating new report data...'
      }, socket);
      
      console.log("SESSION ID: ", session_id);
      // Generate new data if no session
      const reportData = await dataController.getReport(
        reportType,
        start_date,
        end_date,
        filters,
        jobId,
        socket
      );
      
      const updatedJob = await jobManager.getJob(jobId);
      if (!updatedJob || updatedJob.status === 'cancelled') {
        console.log(`Job ${jobId} was cancelled during data generation`);
        return;
      }
      
      // Create session for sorted/filtered data
      session_id = await sessionManager.createSession(reportData.data, reportData.totals);
      session = await sessionManager.getSession(session_id);
      
      if (!session) {
        await jobManager.completeJob(jobId, null, 'Dataset too large for sort/filter operation', socket);
        return;
      }
      
      await jobManager.updateJob(jobId, {
        progress: 90,
        message: 'Applying sort and filter operations...'
      }, socket);
      
      // Apply sort/filter and return initial pages
      return await handleSortFilterResponse(session, sort_config, filters, page, {
        jobId,
        userId: null, // We don't have userId in this context
        socketId: socketId
      });
    }
    
    await jobManager.updateJob(jobId, {
      progress: 90,
      message: 'Applying sort and filter operations...'
    }, socket);
    
    session = await sessionManager.getSession(session_id);
    
    if (!session) {
      await jobManager.completeJob(jobId, null, 'Session not found or expired', socket);
      return;
    }
    
    return await handleSortFilterResponse(session, sort_config, filters, page, {
      jobId,
      userId: null, // We don't have userId in this context
      socketId: socketId
    });
    
  } catch (error) {
    console.error('Sort/filter error:', error);
    await jobManager.completeJob(jobId, null, `Sort/filter operation failed: ${error.message}`, socket);
  }
}
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

function checkMemoryUsage() {
  const memUsage = sessionManager.getActualMemoryUsage();
  
  // Emit memory stats to connected clients (admin feature)
  if(global.io){
    global.io.emit('memory_stats', {
      heap_used_mb: memUsage.heapUsedMB,
      active_sessions: 0, // Will be updated async
      timestamp: Date.now()
    });
    
    // Get active sessions count asynchronously
    sessionManager.getActiveSessionCount().then(count => {
      global.io.emit('memory_stats', {
        heap_used_mb: memUsage.heapUsedMB,
        active_sessions: count,
        timestamp: Date.now()
      });
    });
  }
  
  return memUsage;
}
function generateJobId() {
  const serverId = process.pid; // Include process ID
  return `job_${Date.now()}_${serverId}_${random}`;
  // Unique even across multiple server instances
};
/*const redis = require('./config/redis');
async function cleanupGhostSessions(){
  try {
    await redis.connect();
    
    console.log('🔍 Starting ghost session cleanup...');
    
    // Get ALL sessions from active list
    const allActiveSessions = await redis.client.zRange('sessions:active', 0, -1);
    console.log(`Found ${allActiveSessions.length} sessions in active list`);
    
    let ghostCount = 0;
    let realCount = 0;
    
    for (const sessionId of allActiveSessions) {
      const exists = await redis.client.exists(`session:${sessionId}`);
      if (exists === 0) {
        // Ghost session - remove from active list
        await redis.client.zRem('sessions:active', sessionId);
        ghostCount++;
        console.log(`🗑️ Removed ghost session: ${sessionId}`);
      } else {
        realCount++;
      }
    }
    
    // Reset memory tracking to match real sessions
    let totalRealMemory = 0;
    const realSessions = await redis.client.zRange('sessions:active', 0, -1);
    for (const sessionId of realSessions) {
      const session = await redis.client.hGetAll(`session:${sessionId}`);
      if (session.memoryUsage) {
        totalRealMemory += parseInt(session.memoryUsage);
      }
    }
    
    await redis.client.set('memory:totalUsage', totalRealMemory);
    
    console.log(`✅ Cleanup complete:`);
    console.log(`   Ghost sessions removed: ${ghostCount}`);
    console.log(`   Real sessions remaining: ${realCount}`);
    console.log(`   Memory usage reset to: ${Math.round(totalRealMemory / 1024 / 1024)}MB`);
    
  } catch (error) {
    console.error('Ghost cleanup failed:', error);
  }
}*/
async function performStartupMaintenance() {
  console.log('Performing startup maintenance...');
  
  try {
    // Test Redis connection
    const redisHealthy = await redis.ping();
    if (!redisHealthy) {
      console.error('Redis connection unhealthy at startup');
      return;
    }
    
    console.log('Redis connection healthy');
    
    // Clean up ghost sessions
    console.log('🔍 Checking for ghost sessions...');
    const ghostCleanupResult = await sessionManager.cleanupGhostSessions();
    
    if (ghostCleanupResult.ghostCount > 0) {
      console.log(`Cleaned ${ghostCleanupResult.ghostCount} ghost sessions at startup`);
    } else {
      console.log('No ghost sessions found');
    }
    
    // Run a general cleanup of old sessions
    console.log('Checking for expired sessions...');
    const expiredCount = await sessionManager.cleanupOldSessions();
    
    if (expiredCount > 0) {
      console.log(`Cleaned ${expiredCount} expired sessions at startup`);
    } else {
      console.log('No expired sessions found');
    }
    
    // Log current state
    const activeCount = await sessionManager.getActiveSessionCount();
    const totalMemory = await sessionManager.getTotalMemoryUsage();
    
    console.log('Session Manager Status:');
    console.log(`   Active sessions: ${activeCount}`);
    console.log(`   Total memory usage: ${Math.round(totalMemory / 1024 / 1024)}MB`);
    console.log(`   Max concurrent sessions: ${sessionManager.PAGINATION_CONFIG.MAX_CONCURRENT_SESSIONS}`);
    console.log(`   Max total memory: ${Math.round(sessionManager.PAGINATION_CONFIG.MAX_TOTAL_MEMORY / 1024 / 1024 / 1024)}GB`);
    
    console.log('Startup maintenance completed');
    
  } catch (error) {
    console.error('Startup maintenance failed:', error);
    // Don't throw - allow server to start even if maintenance fails
  }
}
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  try {
    // Stop accepting new connections
    server.close(() => {
      console.log('HTTP server closed');
    });
    
    // Clean up active sessions (optional - you might want to keep them)
    const activeCount = await sessionManager.getActiveSessionCount();
    if (activeCount > 0) {
      console.log(`Found ${activeCount} active sessions`);
      // Optionally mark sessions as "interrupted" rather than deleting them
      // This allows users to resume if the server restarts quickly
    }
    
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
    
    // Disconnect from Redis
    await redis.disconnect();
    console.log('Redis disconnected');
    
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}
/*async function debugSessionScores() {
  await redis.connect();

  const sessionsWithScores = await redis.client.zRangeWithScores(
    'sessions:active',
    0, -1,
    { WITHSCORES: true }
  );

  console.log('Sessions with scores:',sessionsWithScores);
  for (const { value, score } of sessionsWithScores) {
    console.log(`- ${value}: ${score} (${new Date(score)})`);
  }
}*/

app.use(expressRateLimit);
app.use((req, res, next) => {
  console.log('Received request:', req.method, req.url);
  next();
});
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1); // Trust first proxy only
} else {
  app.set('trust proxy', 'loopback'); // Trust localhost only
}
// Enable CORS for all routes
app.use(cors({ 
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow non-browser requests
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true,
}));

// Public auth routes (no authentication required)
app.post('/auth/login',express.json(), checkLoginRateLimit, authController.login);

// Protected auth routes (authentication required)
app.post('/auth/logout', authenticate, authController.logout);
app.get('/auth/me',express.json(), authenticate, authController.getCurrentUser);
app.post('/auth/refresh', authController.refreshToken);
app.post('/auth/change-password', authenticate, authController.changePassword);

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
app.post('/proxy',authenticate,express.json(), async (req, res) => {
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

app.post('/reportAPI/:reportType', express.json(), authenticate, async (req, res) => {
  try {
    const { reportType } = req.params;
    const { start_date, end_date, filters = [], page = 1, session_id = null, socketId } = req.body;
    
    const canCreate = await jobManager.canUserCreateJob(req.userId);
    if (!canCreate.canCreate) {
      return res.status(429).json({
        error: 'Too many active jobs',
        message: `You have ${canCreate.activeCount} active jobs. Maximum allowed: ${canCreate.maxAllowed}`
      });
    }

    const jobData = await jobManager.createJob(req.userId, 'report', {
      reportType,
      start_date,
      end_date,
      filters,
      page,
      session_id,
      socketId
    });
    
    console.log(`Started /reportAPI background job ${jobData.jobId} for user ${req.userId}: ${reportType}`);
    
    res.json({
      jobId: jobData.jobId,
      status: 'started',
      message: 'Report generation started in background',
      estimatedTime: 'Large datasets may take around 5 minutes per week',
      websocket_channel: `job_${jobData.jobId}`
    });
    
    setImmediate(() => {
      processReportAPIBackground(
        jobData.jobId, 
        reportType, 
        start_date, 
        end_date, 
        filters, 
        page, 
        session_id, 
        req.userId, 
        socketId
      );
    });
    
  } catch (error) {
    console.error('Background /reportAPI job start error:', error);
    res.status(500).json({ 
      error: 'Failed to start background processing',
      message: error.message 
    });
  }
});

app.post('/reportAPI/:reportType/sortAndFilter', express.json(), authenticate, async (req, res) => {
  try {
    const { reportType } = req.params;
    const { start_date, end_date, filters = [], sort_config, session_id, page = 1, socketId } = req.body;
    
    // Check if user can create new job
    const canCreate = await jobManager.canUserCreateJob(req.userId);
    if (!canCreate.canCreate) {
      return res.status(429).json({
        error: 'Too many active jobs',
        message: `You have ${canCreate.activeCount} active jobs. Maximum allowed: ${canCreate.maxAllowed}`
      });
    }
    
    // Create new job for sort/filter operation
    const jobData = await jobManager.createJob(req.userId, 'sort_filter', {
      reportType,
      start_date,
      end_date,
      filters,
      sort_config,
      session_id,
      page,
      socketId
    });
    
    console.log(`Started sort/filter background job ${jobData.jobId} for user ${req.userId}`);
    
    // Send immediate response
    res.json({
      jobId: jobData.jobId,
      status: 'started',
      message: 'Sort/filter operation started in background',
      websocket_channel: `job_${jobData.jobId}`
    });
    
    // Start background processing
    setImmediate(() => {
      processReportSortFilterAPIBackground(
        jobData.jobId,
        reportType,
        start_date,
        end_date,
        filters,
        sort_config,
        session_id,
        page,
        req.userId,
        socketId
      );
    });
  } catch (error) {
    console.error('Sort/filter job start error:', error);
    res.status(500).json({
      error: 'Failed to start sort/filter operation',
      message: error.message
    });
  }
});

app.post('/reportAPI/:reportType/size',express.json(),authenticate,  async (req, res) => {
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
        max_session_size_gb: Math.round(sessionManager.PAGINATION_CONFIG.MAX_SESSION_SIZE / 1024 / 1024 / 1024),
        max_total_storage_gb: Math.round(sessionManager.PAGINATION_CONFIG.MAX_TOTAL_MEMORY / 1024 / 1024 / 1024),
        max_page_size_gb: Math.round(sessionManager.PAGINATION_CONFIG.MAX_RESPONSE_SIZE / 1024 / 1024 / 1024)
      }
    });
    
  } catch (error) {
    console.error('Size check error:', error);
    res.status(500).json({ error: 'Failed to check dataset size' });
  }
});

// Add endpoint to check session status
app.post('/reportAPI/:reportType/session-status', express.json(), authenticate, async (req, res) => {
  try {
    const { session_id } = req.body;
    
    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }
    
    const session = await sessionManager.getSession(session_id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }
    
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
app.post('/reportAPI/:reportType/complete-session', express.json(), authenticate, async (req, res) => {
  try {
    const { session_id } = req.body;
    
    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }
    
    const session = await sessionManager.getSession(session_id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }
    
    await sessionManager.updateSession(session_id, { isComplete: true });
    
    console.log(`Session ${session_id} manually marked as complete`);
    
    // Clean up after a delay
    setTimeout(() => sessionManager.cleanupSession(session_id), 60000);
    
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


app.post('/export',express.json(),authenticate,async (req,res) => {
  try {
    let result;
    const { commands } = req.body;
    const offersIndex = commands[0].commandName.toLowerCase().indexOf("offers");
    const isOfferCommand = offersIndex !== -1;
    const affiliateNetworkCacheKey = commands[0].commandName.toLowerCase().substring(0,offersIndex)+"_"+(commands[1] && commands[1].commandName ? commands[1].commandName.toLowerCase() : "");
    result = await cacheController.getAffiliateOffers(affiliateNetworkCacheKey,commands[1].user);
    let filteredResult;
    if(result && (Object.keys(result).length > 0)){
      console.log("Exporting cached data for "+commands[0].commandName);
    }
    switch (commands[0].commandName) {
      case 'adPumpOffers': if(!result) result = await affiliateNetworksController.exportAdPumpOffers(commands,res);filteredResult = affiliateNetworksController.filterAdPumpOffers(commands,result); break;
      case 'daisyconClientID': affiliateNetworksController.exportDaisyconClientID(commands[1].user,res); break;
      case 'daisyconOffers': if(!result)  result = await affiliateNetworksController.exportDaisyconOffers(commands,res); filteredResult = result; break;
      case 'partnerboostOffers':if(!result) result = await affiliateNetworksController.exportPartnerBoostOffers(commands,res);  filteredResult = result; break;
      case 'tradeTrackerOffers': if(!result) result = await affiliateNetworksController.exportTradeTrackerOffers(commands,res); filteredResult = result; break;
      case 'kwankoOffers': if(!result) result = await affiliateNetworksController.exportKwankoOffers(commands,res); filteredResult = result; break;
      case 'eclicklinkOffers': if(!result) result = await affiliateNetworksController.exportEclicklinkOffers(commands,res); filteredResult = affiliateNetworksController.filterEclicklinkOffers(commands,result); break;
      case 'convertSocialOffers': if(!result)  result = await affiliateNetworksController.exportConvertSocialOffers(commands,res); filteredResult = result; break;
      default: throw new Error('Invalid /export operation!');
    }
    if(isOfferCommand && result){
      await cacheController.setAffiliateOffers(affiliateNetworkCacheKey,commands[1].user,result);
    }
    res.status(200).send({result:filteredResult});
  } catch (error) {
    console.log("Error in /export: "+error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/update',express.json(),authenticate,async (req,res) => {
  try{
    const {commands} = req.body;
    switch(commands[0].commandName){
      case 'daisyconUpdate': await affiliateNetworksController.updateDaisycon(commands,res); break;
      case 'tradeTrackerUpdate': await affiliateNetworksController.updateTradeTrackerCampaigns(commands,res);break;
      case 'adPumpSubscribeAll': await affiliateNetworksController.subscribeAllAdPump(commands[1].user,res); break;
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

app.get('/api/job/:jobId', authenticate, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await jobManager.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Verify user owns this job
    if (job.userId !== req.userId.toString()) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    res.json({
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      message: job.message,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    });
    
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ error: 'Failed to get job status' });
  }
});

app.get('/api/job/:jobId/result', authenticate, async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await jobManager.getJobResult(jobId, req.userId);
    
    if (!result.success) {
      return res.status(result.status === 404 ? 404 : 400).json({
        error: result.message
      });
    }
    
    res.json(result.result);
    
  } catch (error) {
    console.error('Get job result error:', error);
    res.status(500).json({ error: 'Failed to get job result' });
  }
});

app.post('/api/job/:jobId/cancel', authenticate, async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await jobManager.cancelJob(jobId, req.userId);
    
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }
    
    res.json({ message: result.message });
    
  } catch (error) {
    console.error('Cancel job error:', error);
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

app.get('/api/jobs', authenticate, async (req, res) => {
  try {
    const jobs = await jobManager.getUserJobs(req.userId);
    res.json({ jobs });
  } catch (error) {
    console.error('Get user jobs error:', error);
    res.status(500).json({ error: 'Failed to get jobs' });
  }
});
// Health check endpoint (unprotected)
app.get('/health', async (req, res) => {
  try {
    const activeSessionCount = await sessionManager.getActiveSessionCount();
    const totalMemoryUsage = await sessionManager.getTotalMemoryUsage();
    
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      message: 'Server is running',
      memory_limits: {
        max_session_size_gb: Math.round(sessionManager.PAGINATION_CONFIG.MAX_SESSION_SIZE / 1024 / 1024 / 1024),
        max_total_storage_gb: Math.round(sessionManager.PAGINATION_CONFIG.MAX_TOTAL_MEMORY / 1024 / 1024 / 1024),
        max_page_size_gb: Math.round(sessionManager.PAGINATION_CONFIG.MAX_RESPONSE_SIZE / 1024 / 1024 / 1024)
      },
      active_sessions: activeSessionCount,
      total_memory_usage: Math.round(totalMemoryUsage / 1024 / 1024) + 'MB'
    });
  } catch (error) {
    console.error('Error in health check:', error);
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      message: 'Server is running (with errors)',
      error: 'Could not fetch session information'
    });
  }
});
app.get('/admin/background-jobs', authenticate, requireAdmin, (req, res) => {
  try {
    const jobs = Array.from(backgroundJobs.values()).map(job => ({
      ...job,
      processingTime: job.completedAt ? (job.completedAt - job.createdAt) : (Date.now() - job.createdAt)
    }));
    
    const stats = {
      total: jobs.length,
      active: jobs.filter(j => j.status === 'processing' || j.status === 'started').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      error: jobs.filter(j => j.status === 'error').length,
      cancelled: jobs.filter(j => j.status === 'cancelled').length
    };
    
    res.json({
      stats,
      jobs: jobs.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50), // Last 50 jobs
      memory_usage: getActualMemoryUsage(),
      pagination_sessions: sessionManager.getActiveSessionCount()
    });
    
  } catch (error) {
    console.error('Admin jobs endpoint error:', error);
    res.status(500).json({ error: 'Failed to retrieve job statistics' });
  }
});
// Memory monitoring endpoint with new limits
app.get('/admin/memory-status', async (req, res) => {
  try {
    const actualMemory = sessionManager.getActualMemoryUsage();
    const totalMemoryUsage = await sessionManager.getTotalMemoryUsage();
    const activeSessionCount = await sessionManager.getActiveSessionCount();
    const activeSessionsInfo = await sessionManager.getActiveSessionsInfo();
    
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
        active_sessions: activeSessionCount,
        max_sessions: sessionManager.PAGINATION_CONFIG.MAX_CONCURRENT_SESSIONS
      },
      limits: {
        max_total_memory_gb: Math.round(sessionManager.PAGINATION_CONFIG.MAX_TOTAL_MEMORY / 1024 / 1024 / 1024),
        max_session_size_gb: Math.round(sessionManager.PAGINATION_CONFIG.MAX_SESSION_SIZE / 1024 / 1024 / 1024),
        max_page_size_gb: Math.round(sessionManager.PAGINATION_CONFIG.MAX_RESPONSE_SIZE / 1024 / 1024 / 1024),
        max_items_per_session: sessionManager.PAGINATION_CONFIG.MAX_ITEMS_PER_SESSION
      },
      sessions: activeSessionsInfo
    };
    
    res.json(memoryStats);
  } catch (error) {
    console.error('Error getting memory status:', error);
    res.status(500).json({ error: 'Failed to get memory status' });
  }
});

// WebSocket endpoint for real-time server stats (admin feature)
app.get('/admin/socket-stats', authenticate, requireAdmin, (req, res) => {
  const socketStats = {
    connected_clients: io.engine.clientsCount,
    total_connections: io.engine.generateId,
    rooms: Array.from(io.sockets.adapter.rooms.keys()),
    namespace: io.name
  };
  
  res.json(socketStats);
});


process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Log but don't exit - let the process manager handle it
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Log but don't exit
});

// Call startup maintenance before starting the server
(async () => {
  try {
    await performStartupMaintenance();
    //await redis.client.del('sessions:active');
    //console.log(await debugSessionScores());
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`WebSocket server ready`);
      console.log(`Memory limits: Session=${Math.round(sessionManager.PAGINATION_CONFIG.MAX_SESSION_SIZE / 1024 / 1024 / 1024)}GB, Total=${Math.round(sessionManager.PAGINATION_CONFIG.MAX_TOTAL_MEMORY / 1024 / 1024 / 1024)}GB`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();