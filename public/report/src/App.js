import React, { useState, useCallback } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import NavigationBar from './components/NavigationBar';
import DateRangeSelector from './components/DateRangeSelector';
import TabGroup from './components/TabGroup';
import 'react-datepicker/dist/react-datepicker.css';

function App() {
  // Initialize with default last 7 days
  const getDefaultLast7Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    return { start, end };
  };

  const [dateRange, setDateRange] = useState(getDefaultLast7Days());
  const [activeTab, setActiveTab] = useState(null);
  const [filters, setFilters] = useState([]);
  const [availableColumns, setAvailableColumns] = useState([]);

  const handleColumnsUpdate = useCallback((columns) => {
    setAvailableColumns(columns);
  }, []);

  const handleDateChange = useCallback((dates, hasDateChanged = true) => {
    setDateRange(dates);
    // Only reset active tab if dates actually changed
    if (hasDateChanged) {
      setActiveTab(null);
    }
  }, []);

  const handleFilterApply = useCallback((newFilters) => {
    setFilters(newFilters);
    // You might want to refetch data here when filters change
  }, []);

  return (
    <div className="app-container d-flex flex-column vh-100">
      <NavigationBar currentDateRange={dateRange}/>
      <div className="flex-grow-1">
        <DateRangeSelector 
          onDateChange={handleDateChange} 
          onFilterApply={handleFilterApply}
          currentDateRange={dateRange}
          availableColumns={availableColumns}
        />
        <TabGroup
          dateRange={dateRange}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          filters={filters}
          onColumnsUpdate={handleColumnsUpdate}
        />
      </div>
    </div>
  );
}
export default App;