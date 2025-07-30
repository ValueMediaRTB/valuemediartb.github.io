export const fetchTableData = async (tabType, dateRange, filters, sortConfig = null, page = 1) => {
  try {
    // Format dates to YYYY-MM-DD
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

    // Initialize cache if not exists
    if (!window._serverPageCache) {
      window._serverPageCache = {};
    }

    // Create cache key
    //const sortKey = sortConfig && sortConfig.key ? `_sort_${sortConfig.key}_${sortConfig.direction}` : '';
    const filterTs = filters.find(f=>f.type == 'traffic_sources')
    const cacheKey = `${tabType}_${formatDate(dateRange.start)}_${formatDate(dateRange.end)}_`+ (filterTs ? filterTs.value.split(",").map(Number).sort((a,b)=>a-b).join(",") : "");
    console.log("CACHE KEY:",cacheKey);
    // Initialize cache for this query if not exists
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
    console.log("CACHE SESSION ID (before fetch):",cache.sessionId);

    const hasMeaningfulSort = sortConfig && sortConfig.key && sortConfig.key !== null;
    const hasNonEmptyFilters = filters && filters.length > 0 && filters.some(f => f.value && f.value.trim() !== '');
    const hasSortOrFilter = hasMeaningfulSort || hasNonEmptyFilters;

    // Check if sort/filter changed
    const sortConfigChanged = JSON.stringify(sortConfig) !== JSON.stringify(cache.lastSortConfig);
    const filtersChanged = JSON.stringify(filters) !== JSON.stringify(cache.lastFilters);
      console.log("Cached SORT CONFIG AND FILTERS",cache.lastSortConfig,cache.lastFilters);
    
    if ((sortConfigChanged || filtersChanged) && hasSortOrFilter) {
      // Clear cache if sort/filter changed
      clearSortedFilteredCache(tabType,dateRange,filterTs);
      const updatedCache = window._serverPageCache[cacheKey];
      console.log("SORT OR FILTERS CHANGED");
      updatedCache["lastSortConfig"] = sortConfig;
      updatedCache["lastFilters"] = filters;
    }
    console.log("Cached sort and filters AFTER check if changed",window._serverPageCache[cacheKey].lastSortConfig,window._serverPageCache[cacheKey].lastFilters);

    // Check if we already have this server page
    const useOriginalData = !hasSortOrFilter;
    const dataSource = useOriginalData ? cache.loadedServerPages : cache.sortedFilteredData;
    const sessionIdKey = 'sessionId';
    const totalsKey = useOriginalData ? 'totals' : 'sortedFilteredTotals';
    const totalRecordsKey = useOriginalData ? 'totalRecords' : 'sortedFilteredTotalRecords';
    const totalServerPagesKey = useOriginalData ? 'totalServerPages' : 'sortedFilteredTotalServerPages';

      console.log("CACHE",cache);
    // Check if we already have this server page in the appropriate data source
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

    // Determine which endpoint to use
    let endpoint, body;
    

    if (hasSortOrFilter) {
      endpoint = `http://localhost:3000/reportAPI/${tabType.toLowerCase()}/sortAndFilter`;
      body = {
        start_date: formatDate(dateRange.start),
        end_date: formatDate(dateRange.end),
        filters: filters || [],
        sort_config: sortConfig,
        session_id: cache[sessionIdKey],
        page: page
      };
    } else {
      endpoint = `http://localhost:3000/reportAPI/${tabType.toLowerCase()}`;
      body = {
        start_date: formatDate(dateRange.start),
        end_date: formatDate(dateRange.end),
        filters: filters || [],
        page: page,
        session_id: cache[sessionIdKey]
      };
    }

    console.log(`Fetching server page ${page} from ${endpoint}`);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
    
    // Handle pagination info
    if (result.pagination_info) {
      cache.isPaginated = result.pagination_info.is_paginated || false;
      cache[sessionIdKey] = result.pagination_info.session_id || null;
      cache[totalServerPagesKey] = result.pagination_info.total_pages || 1;
      cache[totalRecordsKey] = result.pagination_info.total_records || result.data.length;
      console.log("CACHE SESSION ID (pagination_info):",cache[sessionIdKey]);
      
      console.log(`Server pagination info:`, {
        isPaginated: cache.isPaginated,
        sessionId: cache[sessionIdKey],
        totalServerPages: cache[totalServerPagesKey],
        totalRecords: cache[totalRecordsKey]
      });
    }
    
    // Store server page data
    if (result.data) {
      //dataSource.set(page,result.data);
      if(useOriginalData){
        cache.loadedServerPages.set(page, result.data);
      }
      cache[totalsKey] = result.totals || cache[totalsKey];
    }
    
    // For sortAndFilter endpoint, handle different response structure
    if (hasSortOrFilter && result.pages) {
      const pageData = result.pages.data || [];
      //dataSource.set(page,pageData);
      cache.sortedFilteredData.set(page,pageData);
      cache[totalsKey] = result.totals || cache[totalsKey];
      cache[totalRecordsKey] = result.total_records || cache[totalRecordsKey];
      cache[totalServerPagesKey] = result.total_pages || cache[totalServerPagesKey];
      cache[sessionIdKey] = result.session_id;
      console.log("CACHE SESSION ID (root):",cache[sessionIdKey]);
      return {
        data: pageData,
        totals: cache[totalsKey],
        currentServerPage: page,
        totalServerPages: cache[totalServerPagesKey],
        totalRecords: cache[totalRecordsKey],
        isPaginated: true,
        sessionId: cache[sessionIdKey]
      };
    }
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

// Clear cache for a specific query
export const clearTableCache = (tabType, dateRange, filters, sortConfig) => {
  if (!window._serverPageCache) return;
  
  const formatDate = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const sortKey = sortConfig && sortConfig.key ? `_sort_${sortConfig.key}_${sortConfig.direction}` : '';
  const cacheKey = `${tabType}_${formatDate(dateRange.start)}_${formatDate(dateRange.end)}`;
  
  if (window._serverPageCache[cacheKey]) {
    delete window._serverPageCache[cacheKey];
    console.log(`Cleared cache for ${cacheKey}`);
  }
};
// Clear only sorted/filtered data while keeping original data
export const clearSortedFilteredCache = (tabType, dateRange,traffic_sources) => {
  if (!window._serverPageCache) return;
  const formatDate = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const baseCacheKey = `${tabType}_${formatDate(dateRange.start)}_${formatDate(dateRange.end)}_`+ (traffic_sources ? traffic_sources.value.split(",").map(Number).sort((a,b)=>a-b).join(",") : "");
  if (window._serverPageCache[baseCacheKey]) {
    const cache = window._serverPageCache[baseCacheKey];
    cache.sortedFilteredData.clear();
    cache.sortedFilteredSessionId = null;
    cache.sortedFilteredTotals = null;
    cache.sortedFilteredTotalRecords = 0;
    cache.sortedFilteredTotalServerPages = 0;
    //cache.lastSortConfig = null;
    //cache.lastFilters = null;
    console.log(`Cleared sorted/filtered cache for ${baseCacheKey}`);
  }
};
// Clear all caches
export const clearAllTableCaches = () => {
  window._serverPageCache = {};
  console.log('Cleared all table caches');
};