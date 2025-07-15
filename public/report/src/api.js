export const fetchTableData = async (tabType, dateRange, filters) => {
  try {
    // Format dates to YYYY-MM-DD
    const formatDate = (date) => {
      if (!date) return '';
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    console.log("Frontend filters:", filters);

    // Initial request (page 1)
    const response = await fetch(`http://localhost:3000/reportAPI/${tabType.toLowerCase()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        start_date: formatDate(dateRange.start),
        end_date: formatDate(dateRange.end),
        filters: filters || {},
        page: 1 // Explicitly request page 1
      })
    });

    if (!response.ok) {
      // Better error handling for memory-related errors
      if (response.status === 503) {
        throw new Error('Server is under heavy load. Please try again in a few minutes or use smaller date ranges.');
      } else if (response.status === 413) {
        throw new Error('Dataset too large. Please use smaller date ranges or more specific filters.');
      }
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    const firstPageResult = await response.json();
    console.log(firstPageResult.totals);
    // Handle backend warnings about truncated data
    if (firstPageResult.pagination_info?.warning) {
      console.warn('Backend warning:', firstPageResult.pagination_info.warning);
      console.log('Suggestion:', firstPageResult.pagination_info.suggestion);
    }
    
    // Log memory info if available
    if (firstPageResult.pagination_info?.memory_info) {
      console.log(`Memory usage: ${firstPageResult.pagination_info.memory_info.session_size_mb}MB (session), ${firstPageResult.pagination_info.memory_info.total_memory_mb}MB (total)`);
    }
    
    // Check if data is paginated
    if (!firstPageResult.pagination_info?.is_paginated) {
      // Not paginated - return as is
      return firstPageResult;
    }

    console.log(`Data is paginated: ${firstPageResult.pagination_info.total_pages} pages total`);
    console.log(`Session ID: ${firstPageResult.pagination_info.session_id}`);

    // Initialize combined result with first page
    let combinedData = [...firstPageResult.data];
    const sessionId = firstPageResult.pagination_info.session_id;
    const totalPages = firstPageResult.pagination_info.total_pages;
    const totals = firstPageResult.totals;

    // Check if session creation failed (fallback response)
    if (!sessionId) {
      console.warn('No session ID received - backend may have used fallback due to memory limits');
      if (firstPageResult.pagination_info?.warning) {
        console.warn('Backend fallback warning:', firstPageResult.pagination_info.warning);
      }
      return firstPageResult; // Return the fallback data
    }

    // Fetch remaining pages with enhanced error handling
    for (let page = 2; page <= totalPages; page++) {
      console.log(`Fetching page ${page} of ${totalPages}...`);
      
      try {
        const pageResponse = await fetch(`http://localhost:3000/reportAPI/${tabType.toLowerCase()}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            start_date: formatDate(dateRange.start),
            end_date: formatDate(dateRange.end),
            filters: filters || {},
            page: page,
            session_id: sessionId // Use the session ID from first request
          })
        });

        if (!pageResponse.ok) {
          // Better error handling for individual page failures
          if (pageResponse.status === 404) {
            console.warn(`Session expired while fetching page ${page}. Stopping pagination.`);
            break;
          } else if (pageResponse.status === 503) {
            console.warn(`Server overloaded while fetching page ${page}. Stopping pagination.`);
            break;
          }
          console.warn(`Failed to fetch page ${page}: ${pageResponse.status}`);
          break; // Stop fetching if a page fails
        }

        const pageResult = await pageResponse.json();
        
        // Validate page result structure
        if (!pageResult.data || !Array.isArray(pageResult.data)) {
          console.warn(`Invalid data structure received for page ${page}`);
          break;
        }
        
        // Combine data
        combinedData = [...combinedData, ...pageResult.data];
        console.log(`Page ${page} fetched: ${pageResult.data.length} records`);
        
        //  Show progress and memory info
        if (pageResult.pagination_info?.session_progress) {
          console.log(`Progress: ${pageResult.pagination_info.session_progress}`);
        }
        
        if (pageResult.pagination_info?.memory_info) {
          console.log(`Memory: ${pageResult.pagination_info.memory_info.total_memory_mb}MB total, ${pageResult.pagination_info.memory_info.active_sessions} sessions`);
        }
        
        // Check if session was completed on backend
        if (pageResult.pagination_info?.is_session_complete) {
          console.log(`Session completed after page ${page}`);
        }
        
      } catch (pageError) {
        console.error(`Error fetching page ${page}:`, pageError);
        // Continue with partial data rather than failing completely
        console.log(`Continuing with ${combinedData.length} records from ${page - 1} pages`);
        break;
      }
    }

    // Return combined result in the same format as non-paginated responses
    const finalResult = {
      data: combinedData,
      totals: totals,
      page: 1,
      total_pages: 1,
      page_size: combinedData.length,
      total_records: combinedData.length,
      pagination_info: {
        is_paginated: false, // Mark as not paginated since we've combined everything
        current_page: 1,
        total_pages: 1,
        has_next_page: false,
        has_previous_page: false,
        session_id: sessionId,
        original_total_pages: totalPages,
        is_combined_result: true
      }
    };

    console.log(`Successfully fetched all ${totalPages} pages. Total records: ${combinedData.length}`);
    
    return finalResult;

  } catch (error) {
    console.error("Error fetching table data:", error);
    throw error;
  }
};

// Alternative version with progress callback and better error handling
export const fetchTableDataWithProgress = async (tabType, dateRange, filters, onProgress = null) => {
  try {
    const formatDate = (date) => {
      if (!date) return '';
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Initial request
    const response = await fetch(`http://localhost:3000/reportAPI/${tabType.toLowerCase()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        start_date: formatDate(dateRange.start),
        end_date: formatDate(dateRange.end),
        filters: filters || {},
        page: 1
      })
    });

    if (!response.ok) {
      // Specific error messages for different status codes
      let errorMessage = `API request failed with status ${response.status}`;
      if (response.status === 503) {
        errorMessage = 'Server is under heavy load. Please try again in a few minutes or use smaller date ranges.';
      } else if (response.status === 413) {
        errorMessage = 'Dataset too large. Please use smaller date ranges or more specific filters.';
      }
      throw new Error(errorMessage);
    }
    
    const firstPageResult = await response.json();
    
    //  Enhanced progress reporting with memory info
    if (onProgress) {
      onProgress({
        currentPage: 1,
        totalPages: firstPageResult.pagination_info?.total_pages || 1,
        recordsLoaded: firstPageResult.data?.length || 0,
        totalRecords: firstPageResult.pagination_info?.total_records || firstPageResult.data?.length || 0,
        sessionId: firstPageResult.pagination_info?.session_id,
        memoryInfo: firstPageResult.pagination_info?.memory_info,
        warnings: firstPageResult.pagination_info?.warning ? [firstPageResult.pagination_info.warning] : []
      });
    }

    if (!firstPageResult.pagination_info?.is_paginated) {
      return firstPageResult;
    }

    let combinedData = [...firstPageResult.data];
    const sessionId = firstPageResult.pagination_info.session_id;
    const totalPages = firstPageResult.pagination_info.total_pages;
    const totals = firstPageResult.totals;
    let warnings = [];

    // Handle missing session ID (backend fallback)
    if (!sessionId) {
      console.warn('No session ID received - backend used fallback due to memory limits');
      if (onProgress) {
        onProgress({
          currentPage: 1,
          totalPages: 1,
          recordsLoaded: combinedData.length,
          totalRecords: combinedData.length,
          sessionId: null,
          warnings: ['Data was truncated due to memory limits'],
          isComplete: true
        });
      }
      return firstPageResult;
    }

    // Fetch remaining pages
    for (let page = 2; page <= totalPages; page++) {
      try {
        const pageResponse = await fetch(`http://localhost:3000/reportAPI/${tabType.toLowerCase()}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            start_date: formatDate(dateRange.start),
            end_date: formatDate(dateRange.end),
            filters: filters || {},
            page: page,
            session_id: sessionId
          })
        });

        if (!pageResponse.ok) {
          let warningMessage = `Failed to fetch page ${page}: ${pageResponse.status}`;
          if (pageResponse.status === 404) {
            warningMessage = `Session expired while fetching page ${page}`;
          } else if (pageResponse.status === 503) {
            warningMessage = `Server overloaded while fetching page ${page}`;
          }
          
          warnings.push(warningMessage);
          console.warn(warningMessage);
          break;
        }

        const pageResult = await pageResponse.json();
        
        if (!pageResult.data || !Array.isArray(pageResult.data)) {
          warnings.push(`Invalid data received for page ${page}`);
          break;
        }
        
        combinedData = [...combinedData, ...pageResult.data];
        
        // Report progress with memory and warning info
        if (onProgress) {
          onProgress({
            currentPage: page,
            totalPages: totalPages,
            recordsLoaded: combinedData.length,
            totalRecords: firstPageResult.pagination_info.total_records,
            sessionId: sessionId,
            memoryInfo: pageResult.pagination_info?.memory_info,
            sessionProgress: pageResult.pagination_info?.session_progress,
            isSessionComplete: pageResult.pagination_info?.is_session_complete,
            warnings: warnings
          });
        }
        
      } catch (pageError) {
        const errorMessage = `Error fetching page ${page}: ${pageError.message}`;
        warnings.push(errorMessage);
        console.error(errorMessage);
        
        // Report partial completion
        if (onProgress) {
          onProgress({
            currentPage: page - 1,
            totalPages: totalPages,
            recordsLoaded: combinedData.length,
            totalRecords: firstPageResult.pagination_info.total_records,
            sessionId: sessionId,
            warnings: warnings,
            partialComplete: true,
            error: errorMessage
          });
        }
        break;
      }
    }

    // Final progress report
    if (onProgress) {
      onProgress({
        currentPage: totalPages,
        totalPages: totalPages,
        recordsLoaded: combinedData.length,
        totalRecords: combinedData.length,
        sessionId: sessionId,
        warnings: warnings,
        isComplete: true
      });
    }

    return {
      data: combinedData,
      totals: totals,
      page: 1,
      total_pages: 1,
      page_size: combinedData.length,
      total_records: combinedData.length,
      pagination_info: {
        is_paginated: false,
        is_combined_result: true,
        original_total_pages: totalPages,
        session_id: sessionId,
        warnings: warnings.length > 0 ? warnings : undefined
      }
    };

  } catch (error) {
    console.error("Error fetching table data:", error);
    throw error;
  }
};

// Utility function to check server memory status before large requests
export const checkServerMemoryStatus = async () => {
  try {
    const response = await fetch('http://localhost:3000/admin/memory-status');
    if (response.ok) {
      const memoryStatus = await response.json();
      return {
        available: true,
        heapUsagePercent: memoryStatus.node_memory.heap_usage_percent,
        activeSessions: memoryStatus.session_tracking.active_sessions,
        recommendSmallRequest: memoryStatus.node_memory.heap_usage_percent > 70
      };
    }
  } catch (error) {
    console.warn('Could not check server memory status:', error);
  }
  return { available: false };
};

// Enhanced usage example with memory checking
export const fetchTableDataWithMemoryCheck = async (tabType, dateRange, filters, onProgress = null) => {
  // Check server memory before making large requests
  const memoryStatus = await checkServerMemoryStatus();
  
  if (memoryStatus.available && memoryStatus.recommendSmallRequest) {
    console.warn(`Server memory usage is high (${memoryStatus.heapUsagePercent}%). Consider using smaller date ranges.`);
    
    if (onProgress) {
      onProgress({
        currentPage: 0,
        totalPages: 0,
        warnings: [`Server memory usage is high (${memoryStatus.heapUsagePercent}%). This request may be slower or fail.`]
      });
    }
  }
  
  return fetchTableDataWithProgress(tabType, dateRange, filters, onProgress);
};

// Usage example with enhanced progress tracking:
/*
const handleFetchData = async () => {
  setLoading(true);
  setProgress({ current: 0, total: 0, warnings: [] });
  
  try {
    const data = await fetchTableDataWithProgress(
      tabType, 
      dateRange, 
      filters,
      (progressInfo) => {
        setProgress({
          current: progressInfo.currentPage,
          total: progressInfo.totalPages,
          records: progressInfo.recordsLoaded,
          totalRecords: progressInfo.totalRecords,
          memoryMB: progressInfo.memoryInfo?.total_memory_mb,
          warnings: progressInfo.warnings || [],
          sessionProgress: progressInfo.sessionProgress
        });
        
        // Log memory info if available
        if (progressInfo.memoryInfo) {
          console.log(`Memory: ${progressInfo.memoryInfo.session_size_mb}MB session, ${progressInfo.memoryInfo.total_memory_mb}MB total, ${progressInfo.memoryInfo.active_sessions} sessions`);
        }
        
        // Show warnings to user
        if (progressInfo.warnings?.length > 0) {
          console.warn('Warnings:', progressInfo.warnings);
        }
      }
    );
    
    // Handle any warnings in the final result
    if (data.pagination_info?.warnings?.length > 0) {
      console.warn('Final warnings:', data.pagination_info.warnings);
      // Optionally show warnings to user in UI
    }
    
    setTableData(data);
  } catch (error) {
    console.error('Failed to fetch data:', error);
    
    // Show user-friendly error messages
    if (error.message.includes('heavy load')) {
      setError('Server is busy. Please try again in a few minutes.');
    } else if (error.message.includes('too large')) {
      setError('Dataset is too large. Please use smaller date ranges or more filters.');
    } else {
      setError('Failed to load data. Please try again.');
    }
  } finally {
    setLoading(false);
  }
};

// Example with memory checking:
const handleFetchDataWithMemoryCheck = async () => {
  setLoading(true);
  
  try {
    const data = await fetchTableDataWithMemoryCheck(
      tabType, 
      dateRange, 
      filters,
      (progressInfo) => {
        // Handle progress updates including memory warnings
        setProgress(progressInfo);
      }
    );
    
    setTableData(data);
  } catch (error) {
    setError(error.message);
  } finally {
    setLoading(false);
  }
};
*/