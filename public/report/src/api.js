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
    console.log("frontend filters");
    console.log(filters);
    const response = await fetch(`http://localhost:3000/reportAPI/${tabType.toLowerCase()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        start_date: formatDate(dateRange.start),
        end_date: formatDate(dateRange.end),
        filters: filters || {}
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    const result = await response.json();
    // Return the full response object containing both data and totals
    return result;
  } catch (error) {
    console.error("Error fetching table data:", error);
    throw error;
  }
};
/* Old request example
fetch(`http://localhost:3000/reportAPI/${tabType.toLowerCase()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      start_date: dateRange.start,
      end_date: dateRange.end,
      filters
    })
  });
// Request with filters

*/