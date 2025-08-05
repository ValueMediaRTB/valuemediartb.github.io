const axios = require('axios');
const PQueue = require('@esm2cjs/p-queue').default;

// Default traffic sources - keep as const to prevent accidental mutation
const DEFAULT_TRAFFIC_SOURCES = [437,436,435,434,432,430,421,402,388,381,363,341,313,303,284,282];

const getBinomGroupingsParam = (group) => {
  return (group == 'campaigns') ? "groupings%5B%5D=campaign&groupings%5B%5D=token_2"
    : (group == 'countries') ? "groupings%5B%5D=geoCountry"
    : (group == 'subids') ? "groupings%5B%5D=token_4&groupings%5B%5D=token_3"
    : (group == 'isps') ? "groupings%5B%5D=ispName"
    : (group == 'zones') ? "groupings%5B%5D=token_4"
    : "";
};

// Create a dedicated queue per request to avoid interference
const createRequestQueue = () => new PQueue({ concurrency: 10 });

/* param. <date>: must have format yyyy-mm-dd */ 
const fetchBinomDataForDateRange = async (reportTypes, date, filters = {}) => {
  // Create local variables for this request - NO GLOBAL STATE
  const trafficSources = filters.traffic_sources || DEFAULT_TRAFFIC_SOURCES;
  const binomTrafficSourcesParam = 'ids%5B%5D=' + trafficSources.join("&ids%5B%5D=");
  
  let binomGroupingsParams = getBinomGroupingsParam(reportTypes[0]) + 
    (reportTypes.length > 1 ? "&" + getBinomGroupingsParam(reportTypes[1]) : "");
  if((reportTypes[0] == "zones" && reportTypes[1] == "subids") || (reportTypes[0] == "subids" && reportTypes[1] == "zones"))
    binomGroupingsParams = getBinomGroupingsParam('subids');
    
  const startDateParam = encodeURIComponent(`${date} 00:00:00`);
  const endDateParam = encodeURIComponent(`${date} 23:59:59`);
  const timezoneParam = encodeURIComponent('America/Detroit');
  const baseEndpoint = `https://trafficmediaserver.com/public/api/v1/report/trafficSource?${binomTrafficSourcesParam}&${binomGroupingsParams}&datePreset=custom_time&dateFrom=${startDateParam}&dateTo=${endDateParam}&timezone=${timezoneParam}&sortColumn=clicks&sortType=asc`;

  // Create a unique request ID for logging
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`[${requestId}] Starting Binom API request for ${date}, traffic sources: [${trafficSources.join(',')}]`);
  console.log(`[${requestId}] Endpoint: ${baseEndpoint}`);
  
  // Configure headers
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Api-Key': process.env.BINOM_API_KEY
  };

  // Create a dedicated queue for this request
  const queue = createRequestQueue();
  const allData = [];
  let hasMoreData = true;
  let offset = 0;
  const limit = 1000;
  let totalFetched = 0;
  
  try {
    while (hasMoreData) {
      // Create an array to hold our batch of requests with their metadata
      const batchRequests = [];
      const batchStartOffset = offset;
      
      // Create batch of 10 requests
      for (let i = 0; i < 10; i++) {
        const currentOffset = offset + (i * limit);
        const endpoint = `${baseEndpoint}&limit=${limit}&offset=${currentOffset}`;
        
        // Store the request promise along with its offset for tracking
        const requestPromise = queue.add(async () => {
          const requestStart = Date.now();
          try {
            const response = await axios.get(endpoint, { 
              headers,
              timeout: 30000 // 30 second timeout per request
            });
            
            const requestDuration = Date.now() - requestStart;
            const recordCount = response.data?.report?.length || 0;
            
            console.log(`[${requestId}] Offset ${currentOffset}: ${recordCount} records (${requestDuration}ms)`);
            
            return {
              data: response.data,
              offset: currentOffset,
              recordCount: recordCount
            };
          } catch (error) {
            const requestDuration = Date.now() - requestStart;
            const errorMsg = error.response?.status 
              ? `HTTP ${error.response.status}: ${error.message}`
              : error.message;
            console.error(`[${requestId}] Error at offset ${currentOffset} (${requestDuration}ms): ${errorMsg}`);
            return {
              data: { report: [] },
              offset: currentOffset,
              recordCount: 0,
              error: errorMsg
            };
          }
        });
        
        batchRequests.push(requestPromise);
      }

      console.log(`[${requestId}] Processing batch starting at offset ${batchStartOffset}...`);
      
      // Wait for all requests in batch to complete
      const batchStart = Date.now();
      const results = await Promise.all(batchRequests);
      const batchDuration = Date.now() - batchStart;
      
      // Sort results by offset to maintain order (this ensures data integrity)
      results.sort((a, b) => a.offset - b.offset);
      
      console.log(`[${requestId}] Batch completed in ${batchDuration}ms`);
      
      // Process results in correct order
      let shouldContinue = true;
      let batchRecordCount = 0;
      
      for (const result of results) {
        if (result.data.report) {
          allData.push(...result.data.report);
          batchRecordCount += result.recordCount;
          totalFetched += result.recordCount;
        }
        
        // Check if we've reached the end - if any request returns less than limit
        if (result.recordCount < limit) {
          shouldContinue = false;
          hasMoreData = false;
          console.log(`[${requestId}] End of data detected at offset ${result.offset} (got ${result.recordCount}/${limit} records)`);
          break;
        }
      }
      
      console.log(`[${requestId}] Batch processed: ${batchRecordCount} records, Total so far: ${totalFetched}`);
      
      // Only continue to next batch if we haven't reached the end
      if (shouldContinue && hasMoreData) {
        offset += 10 * limit; // Move offset for next batch
      } else {
        hasMoreData = false;
      }
      
      // Add a small delay between batches to be nice to the API
      if (hasMoreData) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`[${requestId}] Binom API fetch completed. Total records: ${totalFetched}`);
    return allData;
    
  } catch (error) {
    console.error(`[${requestId}] Fatal error in paginated fetching:`, error);
    throw error;
  } finally {
    // Clean up the queue
    queue.clear();
  }
};

module.exports = { 
  fetchBinomDataForDateRange
};