import io from 'socket.io-client';
import config from './config.js';

// Initialize WebSocket connection
let socket = null;
let socketConnected = false;
let connectionPromise = null;
let connectionResolve = null;
let connectionReject = null;

// Initialize socket connection
export const initSocket = (token) => {
  if (socket && socketConnected) return socket;

  // Create new connection promise if none exists
  if (!connectionPromise) {
    connectionPromise = new Promise((resolve, reject) => {
      connectionResolve = resolve;
      connectionReject = reject;
    });
  }

  // Disconnect existing socket if any
  if (socket) {
    socket.disconnect();
  }

  socket = io(config.serverURL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    auth: token ? { token } : null
  });

  socket.on('connect', () => {
    console.log('WebSocket connected');
    socketConnected = true;
    if (connectionResolve) connectionResolve(socket);
  });

  socket.on('connect_error', (err) => {
    console.error('WebSocket connection error:', err);
    if (connectionReject) connectionReject(err);
    resetConnectionPromise();
  });

    socket.on('authenticated', ({ userId }) => {
      console.log('WebSocket authenticated for user:', userId);
    });

    socket.on('auth_error', ({ error }) => {
      console.error('WebSocket auth error:', error);
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      socketConnected = false;
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  
  return socket;
};
export const isSocketConnected = () => {
  return socketConnected && socket !== null;
};
function resetConnectionPromise() {
  connectionPromise = null;
  connectionResolve = null;
  connectionReject = null;
}

export const waitForSocketConnection = async () => {
  if (socketConnected) return true;
  if (!connectionPromise) return false;
  
  try {
    await connectionPromise;
    return true;
  } catch (err) {
    console.error('Error waiting for socket connection:', err);
    return false;
  } finally {
    resetConnectionPromise();
  }
};
// Disconnect socket
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    socketConnected = false;
  }
};

// Job monitoring helper
class JobMonitor {
  constructor() {
    this.activeJobs = new Map();
    this.jobCallbacks = new Map();
    this.eventListeners = {
      job_start: [],
      job_end: []
    };
  }
  on(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].push(callback);
    }
  }
  off(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
    }
  }
  emit(event, ...args) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => callback(...args));
    }
  }

  async startMonitoring(jobId, callbacks = {}) {
    if (!socket || !socketConnected) {
      console.log('Waiting for socket connection...');
      try {
        await new Promise((resolve, reject) => {
          if (socketConnected) {
            resolve();
          } else {
            const timeout = setTimeout(() => {
              reject(new Error('Socket connection timeout'));
            }, 5000); // 5 second timeout

            socket.once('connect', () => {
              clearTimeout(timeout);
              resolve();
            });

            socket.once('error', (err) => {
              clearTimeout(timeout);
              reject(err);
            });
          }
        });
      } catch (err) {
        console.error('Failed to establish socket connection:', err);
        if (callbacks.onError) {
          callbacks.onError({ error: 'Socket connection failed' });
        }
        return;
      }
    }
      // Store callbacks
    this.jobCallbacks.set(jobId, callbacks);
    this.activeJobs.set(jobId, { status: 'monitoring', startTime: Date.now() });
    this.emit('job_start', jobId);
    socket.emit('job_start', jobId);

    // Store callbacks
    this.jobCallbacks.set(jobId, callbacks);
    this.activeJobs.set(jobId, { status: 'monitoring', startTime: Date.now() });

    // Subscribe to job updates
    socket.emit('subscribe_job', { jobId });

    // Set up listeners
    const updateHandler = (data) => {
      if (data.jobId === jobId) {
        this.activeJobs.set(jobId, { ...this.activeJobs.get(jobId), ...data });
        if (callbacks.onUpdate) {
          callbacks.onUpdate(data);
        }
      }
    };

    const completeHandler = (data) => {
      if (data.jobId === jobId) {
        this.activeJobs.set(jobId, { ...this.activeJobs.get(jobId), status: 'completed' });
        if (callbacks.onComplete) {
          callbacks.onComplete(data);
        }
        this.stopMonitoring(jobId);
      }
    };

    const errorHandler = (data) => {
      if (data.jobId === jobId) {
        if (callbacks.onError) {
          callbacks.onError(data);
        }
        this.stopMonitoring(jobId);
      }
    };

    const dataHandler = (data) => {
      if (data.jobId === jobId) {
        if (callbacks.onData) {
          callbacks.onData(data);
        }
      }
    };

    socket.on('job_update', updateHandler);
    socket.on('job_complete', completeHandler);
    socket.on('job_error', errorHandler);
    socket.on('job_data', dataHandler);

    // Store handlers for cleanup
    this.activeJobs.get(jobId).handlers = {
      updateHandler,
      completeHandler,
      errorHandler,
      dataHandler
    };
  }

  stopMonitoring(jobId) {
    const job = this.activeJobs.get(jobId);
    if (job && job.handlers) {
      // Remove listeners
      socket.off('job_update', job.handlers.updateHandler);
      socket.off('job_complete', job.handlers.completeHandler);
      socket.off('job_error', job.handlers.errorHandler);
      socket.off('job_data', job.handlers.dataHandler);
      
      // Unsubscribe
      socket.emit('unsubscribe_job', { jobId });
    }
    
    this.activeJobs.delete(jobId);
    this.jobCallbacks.delete(jobId);
    this.emit('job_end', jobId);
  }

  getJobStatus(jobId) {
    return this.activeJobs.get(jobId);
  }
}

const jobMonitor = new JobMonitor();

// Enhanced fetchTableData with WebSocket support
export const fetchTableData = async (tabType, dateRange, filters, sortConfig = null, page = 1, token = null) => {
  try {
    // Format dates
    const formatDate = (date) => {
      if (!date) return '';
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    console.log("Fetching data:", {
      tabType,
      dateRange,
      filters,
      sortConfig,
      requestedPage: page
    });
    if (!isSocketConnected() && token) {
      await new Promise((resolve)=>{
        initSocket(token);
        if(socketConnected){
          resolve();
        }
        else{
          socket.once('connect',resolve);
          socket.once('error',(err)=>{
            console.error('Socket connection error:',err);
            resolve();
          })
        }
      })
    }
    // Handle budget report (synchronous)
    if (tabType.toLowerCase() === 'budget') {
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${config.serverURL}/reportAPI/budget`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          start_date: formatDate(dateRange.start),
          end_date: formatDate(dateRange.end),
          filters: filters || [],
          sort_config: null,
          session_id: null,
          page: null
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const result = await response.json();
      return {
        data: result.data || [],
        totals: result.totals,
        currentServerPage: 1,
        totalServerPages: 1,
        totalRecords: 1,
        isPaginated: false,
        sessionId: null
      };
    }

    // Initialize cache
    if (!window._serverPageCache) {
      window._serverPageCache = {};
    }

    // Create cache key
    const filterTs = filters.find(f => f.type === 'traffic_sources');
    const cacheKey = `${tabType}_${formatDate(dateRange.start)}_${formatDate(dateRange.end)}_` + 
      (filterTs ? filterTs.value.split(",").map(Number).sort((a, b) => a - b).join(",") : "");

    // Initialize cache for this query
    if (!window._serverPageCache[cacheKey]) {
      window._serverPageCache[cacheKey] = {
        sessionId: null,
        loadedServerPages: new Map(),
        sortedFilteredData: new Map(),
        totals: null,
        totalRecords: 0,
        totalServerPages: 0,
        isPaginated: false,
        lastSortConfig: null,
        lastFilters: null,
        sortedFilteredTotals: null,
        sortedFilteredTotalRecords: 0,
        sortedFilteredTotalServerPages: 0,
      };
    }

    const cache = window._serverPageCache[cacheKey];
    const hasMeaningfulSort = sortConfig && sortConfig.key && sortConfig.key !== null;
    const hasNonEmptyFilters = filters && filters.length > 0 && filters.some(f => f.value && f.value.trim() !== '');
    const hasSortOrFilter = hasMeaningfulSort || hasNonEmptyFilters;

    // Check if sort/filter changed
    const sortConfigChanged = JSON.stringify(sortConfig) !== JSON.stringify(cache.lastSortConfig);
    const filtersChanged = JSON.stringify(filters) !== JSON.stringify(cache.lastFilters);

    if ((sortConfigChanged || filtersChanged) && hasSortOrFilter) {
      clearSortedFilteredCache(tabType, dateRange, filterTs);
      cache.lastSortConfig = sortConfig;
      cache.lastFilters = filters;
    }

    // Check cache
    const useOriginalData = !hasSortOrFilter;
    const dataSource = useOriginalData ? cache.loadedServerPages : cache.sortedFilteredData;
    const sessionIdKey = 'sessionId';
    const totalsKey = useOriginalData ? 'totals' : 'sortedFilteredTotals';
    const totalRecordsKey = useOriginalData ? 'totalRecords' : 'sortedFilteredTotalRecords';
    const totalServerPagesKey = useOriginalData ? 'totalServerPages' : 'sortedFilteredTotalServerPages';

    if (dataSource.has(page)) {
      console.log(`Returning cached ${useOriginalData ? 'original' : 'sorted/filtered'} server page ${page}`);
      const cachedData = dataSource.get(page);
      return {
        data: cachedData,
        totals: cache[totalsKey],
        currentServerPage: page,
        totalServerPages: cache[totalServerPagesKey],
        totalRecords: cache[totalRecordsKey],
        isPaginated: cache.isPaginated,
        sessionId: cache[sessionIdKey]
      };
    }

    // Prepare request
    let endpoint, body;
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Add socket ID if available
    const socketId = socket && socketConnected ? socket.id : null;

    if (hasSortOrFilter) {
      endpoint = `${config.serverURL}/reportAPI/${tabType.toLowerCase()}/sortAndFilter`;
      body = {
        start_date: formatDate(dateRange.start),
        end_date: formatDate(dateRange.end),
        filters: filters || [],
        sort_config: sortConfig,
        session_id: cache[sessionIdKey],
        page: page,
        socketId
      };
    } else {
      endpoint = `${config.serverURL}/reportAPI/${tabType.toLowerCase()}`;
      body = {
        start_date: formatDate(dateRange.start),
        end_date: formatDate(dateRange.end),
        filters: filters || [],
        page: page,
        session_id: cache[sessionIdKey],
        socketId
      };
    }

    console.log(`Fetching server page ${page} from ${endpoint}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      if (response.status === 503) {
        throw new Error('Server is under heavy load. Please try again in a few minutes.');
      } else if (response.status === 413) {
        throw new Error('Dataset too large. Please use smaller date ranges or more specific filters.');
      }
      throw new Error(`API request failed with status ${response.status}`);
    }

    const result = await response.json();

    // Check if it's a background job
    if (result.jobId) {
      console.log(`Background job started: ${result.jobId}`);
      
      // Return a promise that resolves when job completes
      return new Promise((resolve, reject) => {
        let accumulatedData = [];
        let metadata = null;
        
        jobMonitor.startMonitoring(result.jobId, {
          onUpdate: (data) => {
            console.log(`Job ${result.jobId} progress: ${data.progress}% - ${data.message}`);
          },
          onData: (data) => {
            if (data.type === 'metadata') {
              metadata = data.data;
            } else if (data.type === 'chunk') {
              accumulatedData = accumulatedData.concat(data.data);
              console.log(`Received chunk ${data.chunkNumber}/${data.totalChunks}`);
            }
          },
          onComplete: async (data) => {
            console.log(`Job ${result.jobId} completed`);
            
            // If data was delivered via WebSocket chunks
            if (data.deliveryMethod === 'websocket_chunks' && metadata) {
              const fullResult = {
                data: accumulatedData,
                totals: metadata.totals,
                pagination_info: metadata.pagination_info
              };
              
              // Process and cache the result
              processAndCacheResult(fullResult, cache, useOriginalData, page, 
                sessionIdKey, totalsKey, totalRecordsKey, totalServerPagesKey);
              
              resolve({
                data: fullResult.data,
                totals: cache[totalsKey],
                currentServerPage: page,
                totalServerPages: cache[totalServerPagesKey],
                totalRecords: cache[totalRecordsKey],
                isPaginated: cache.isPaginated,
                sessionId: cache[sessionIdKey]
              });
            } else {
              // Fetch result from server
              try {
                const resultResponse = await fetch(`${config.serverURL}/api/job/${result.jobId}/result`, {
                  headers
                });
                
                if (!resultResponse.ok) {
                  throw new Error('Failed to fetch job result');
                }
                
                const jobResult = await resultResponse.json();
                
                // Process and cache the result
                processAndCacheResult(jobResult, cache, useOriginalData, page,
                  sessionIdKey, totalsKey, totalRecordsKey, totalServerPagesKey);
                
                resolve({
                  data: jobResult.data || [],
                  totals: cache[totalsKey],
                  currentServerPage: page,
                  totalServerPages: cache[totalServerPagesKey],
                  totalRecords: cache[totalRecordsKey],
                  isPaginated: cache.isPaginated,
                  sessionId: cache[sessionIdKey]
                });
              } catch (error) {
                reject(error);
              }
            }
          },
          onError: (error) => {
            console.error(`Job ${result.jobId} error:`, error);
            reject(new Error(error.error || 'Background job failed'));
          }
        });
        
        // Optional: Add timeout for job monitoring
        setTimeout(() => {
          jobMonitor.stopMonitoring(result.jobId);
          reject(new Error('Job timeout - taking too long'));
        }, 8*60 * 60 * 1000); // 8 hours timeout
      });
    }

    // Handle synchronous response (backward compatibility)
    processAndCacheResult(result, cache, useOriginalData, page,
      sessionIdKey, totalsKey, totalRecordsKey, totalServerPagesKey);

    return {
      data: result.data || [],
      totals: cache[totalsKey],
      currentServerPage: page,
      totalServerPages: cache[totalServerPagesKey],
      totalRecords: cache[totalRecordsKey],
      isPaginated: cache.isPaginated,
      sessionId: cache[sessionIdKey]
    };

  } catch (error) {
    console.error("Error fetching table data:", error);
    throw error;
  }
};

// Helper function to process and cache results
function processAndCacheResult(result, cache, useOriginalData, page,
  sessionIdKey, totalsKey, totalRecordsKey, totalServerPagesKey) {
  
  // Handle pagination info
  if (result.pagination_info) {
    cache.isPaginated = result.pagination_info.is_paginated || false;
    cache[sessionIdKey] = result.pagination_info.session_id || null;
    cache[totalServerPagesKey] = result.pagination_info.total_pages || 1;
    cache[totalRecordsKey] = result.pagination_info.total_records || result.data.length;
    
    console.log(`Server pagination info:`, {
      isPaginated: cache.isPaginated,
      sessionId: cache[sessionIdKey],
      totalServerPages: cache[totalServerPagesKey],
      totalRecords: cache[totalRecordsKey]
    });
  }
  
  // Store server page data
  if (result.data) {
    if (useOriginalData) {
      cache.loadedServerPages.set(page, result.data);
    } else {
      cache.sortedFilteredData.set(page, result.data);
    }
    cache[totalsKey] = result.totals || cache[totalsKey];
  }
  
  // For sortAndFilter endpoint, handle different response structure
  if (result.pages) {
    const pageData = result.pages.data || [];
    cache.sortedFilteredData.set(page, pageData);
    cache[totalsKey] = result.totals || cache[totalsKey];
    cache[totalRecordsKey] = result.total_records || cache[totalRecordsKey];
    cache[totalServerPagesKey] = result.total_pages || cache[totalServerPagesKey];
    cache[sessionIdKey] = result.session_id;
  }
}

// Clear cache functions
export const clearTableCache = (tabType, dateRange, filters, sortConfig) => {
  if (!window._serverPageCache) return;
  
  const formatDate = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const filterTs = filters?.find(f => f.type === 'traffic_sources');
  const cacheKey = `${tabType}_${formatDate(dateRange.start)}_${formatDate(dateRange.end)}_` + 
    (filterTs ? filterTs.value.split(",").map(Number).sort((a, b) => a - b).join(",") : "");
  
  if (window._serverPageCache[cacheKey]) {
    delete window._serverPageCache[cacheKey];
    console.log(`Cleared cache for ${cacheKey}`);
  }
};

export const clearSortedFilteredCache = (tabType, dateRange, traffic_sources) => {
  if (!window._serverPageCache) return;
  
  const formatDate = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const baseCacheKey = `${tabType}_${formatDate(dateRange.start)}_${formatDate(dateRange.end)}_` + 
    (traffic_sources ? traffic_sources.value.split(",").map(Number).sort((a, b) => a - b).join(",") : "");
  
  if (window._serverPageCache[baseCacheKey]) {
    const cache = window._serverPageCache[baseCacheKey];
    cache.sortedFilteredData.clear();
    cache.sortedFilteredTotals = null;
    cache.sortedFilteredTotalRecords = 0;
    cache.sortedFilteredTotalServerPages = 0;
    console.log(`Cleared sorted/filtered cache for ${baseCacheKey}`);
  }
};

export const clearAllTableCaches = () => {
  window._serverPageCache = {};
  console.log('Cleared all table caches');
};

// Job management functions
export const getJobStatus = async (jobId, token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(`${config.serverURL}/api/job/${jobId}`, {
    headers
  });
  if (!response.ok) {
    throw new Error('Failed to get job status');
  }
  return response.json();
};

export const getJobResult = async (jobId, token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(`${config.serverURL}/api/job/${jobId}/result`, {
    headers
  });
  if (!response.ok) {
    throw new Error('Failed to get job result');
  }
  return response.json();
};

export const cancelJob = async (jobId, token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(`${config.serverURL}/api/job/${jobId}/cancel`, {
    method: 'POST',
    headers
  });
  if (!response.ok) {
    throw new Error('Failed to cancel job');
  }
  return response.json();
};
export const getUserJobs = async (token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${config.serverURL}/api/jobs`, {
    headers
  });
  if (!response.ok) {
    throw new Error('Failed to get user jobs');
  }
  return response.json();
};
// Export job monitor for external use
export { jobMonitor };