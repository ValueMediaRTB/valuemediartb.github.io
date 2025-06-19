import React, { useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import NavigationBar from './components/NavigationBar';
import DateRangeSelector from './components/DateRangeSelector';
import TabGroup from './components/TabGroup';
import 'react-datepicker/dist/react-datepicker.css';

function App() {
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [activeTab, setActiveTab] = useState(null);
  const [filters, setFilters] = useState([]);

  const handleDateChange = (dates) => {
    setDateRange(dates);
    setActiveTab(null); // Reset active tab when dates change
  };

  const handleFilterApply = (newFilters) => {
    setFilters(newFilters);
    // You might want to refetch data here when filters change
  };

  return (
    <div className="app-container d-flex flex-column vh-100">
      <NavigationBar />
      <div className="flex-grow-1">
        <DateRangeSelector 
          onDateChange={handleDateChange} 
          onFilterApply={handleFilterApply}
        />
        <TabGroup
          dateRange={dateRange}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          filters={filters}
        />
      </div>
    </div>
  );
}
export default App;