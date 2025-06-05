export const fetchTableData = async (tabType, dateRange, filters) => {
  const response = await fetch('/reportAPI/campaigns+subids', {
  method: 'POST',
  body: JSON.stringify({
    start_date: '2023-01-01',
    end_date: '2023-01-07',
    filters: {
      primary: 'Campaign A',       // Filter by campaign
      metrics: {
        clicks: { min: 100 },      // Only >100 clicks
        roi: { min: 20 }           // Only ROI > 20%
      }
    }
  })
});
  return await response.json();
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