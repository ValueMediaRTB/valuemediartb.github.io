const axios = require('axios');
const { default: PQueue } = require('p-queue');

//const binomTrafficSources = [437,436,435,434,432,430,421,408,406,404,402,388,381,363,341,313,303,300,286,285,284,282,253];
const binomTrafficSources = [404];
const binomTrafficSourcesParam = binomTrafficSources.map(id => `ids%5B%5D=${id}`).join('&');

const getBinomGroupingsParam = (group) => {
  return (group == 'campaigns') ? "groupings%5B%5D=campaign&groupings%5B%5D=token_2"
    : (group == 'countries') ? "groupings%5B%5D=geoCountry"
    : (group == 'subids') ? "groupings%5B%5D=token_4&groupings%5B%5D=token_3"
    : (group == 'isps') ? "groupings%5B%5D=ispName"
    : (group == 'zones') ? "groupings%5B%5D=token_4"
    : "";
};

/* param. <date>: must have format yyyy-mm-dd */ 
const fetchBinomDataForDateRange = async (reportTypes, date) => {
  const binomGroupingsParams = getBinomGroupingsParam(reportTypes[0]) + 
    (reportTypes.length > 1 ? "&" + getBinomGroupingsParam(reportTypes[1]) : "");
  console.log(binomGroupingsParams);
  const startDateParam = encodeURIComponent(`${date} 00:00:00`);
  const endDateParam = encodeURIComponent(`${date} 23:59:59`);
  const timezoneParam = encodeURIComponent('America/Detroit');
  const baseEndpoint = `https://trafficmediaserver.com/public/api/v1/report/trafficSource?${binomTrafficSourcesParam}&${binomGroupingsParams}&datePreset=custom_time&dateFrom=${startDateParam}&dateTo=${endDateParam}&timezone=${timezoneParam}&sortColumn=clicks&sortType=asc`;

  // Configure headers
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Api-Key': process.env.BINOM_API_KEY  // Use environment variable for security
  };

  const queue = new PQueue({ concurrency: 10 });
  const allData = [];
  let hasMoreData = true;
  let offset = 0;
  const limit = 1000;
  console.log("Retrieving from Binom API...");
  try {
    while (hasMoreData) {
      // Create an array to hold our batch of requests in order
      const batchRequests = [];
      
      // Create batch of 10 requests in order
      for (let i = 0; i < 10; i++) {
        const currentOffset = offset + (i * limit);
        const endpoint = `${baseEndpoint}&limit=${limit}&offset=${currentOffset}`;
        
        // Store both the request and its position/index
        batchRequests.push({
          index: i, // Track original position
          request: queue.add(async () => {
            try {
              const response = await axios.get(endpoint, { headers });
              return {
                data: response.data,
                offset: currentOffset
              };
            } catch (error) {
              console.error(`Error fetching offset ${currentOffset}:`, error);
              return {
                data: [],
                offset: currentOffset
              };
            }
          })
        });
      }

      // Wait for all requests in batch to complete
      const results = await Promise.all(batchRequests.map(r => r.request));
      console.log("Fetch from Binom complete! Offset: "+offset);
      // Sort results by offset to maintain order
      results.sort((a, b) => a.offset - b.offset);
      
      // Process results in correct order
      for (const result of results) {
        allData.push(...result.data.report);
        
        // Check if we've reached the end
        if (result.data.totals.total_count < limit+result.offset) {
          hasMoreData = false;
          break;
        }
      }
      
      // Only continue to next batch if we haven't reached the end
      if (hasMoreData) {
        offset += 10 * limit; // Move offset for next batch
      }
    }
    return allData;
    /*
    return allData.map(item => ({
      ...item,
      date: new Date(item.date)
    }));*/
  } catch (error) {
    console.error('Error in paginated fetching:', error);
    throw error;
  }
};

module.exports = { 
  fetchBinomDataForDateRange
};