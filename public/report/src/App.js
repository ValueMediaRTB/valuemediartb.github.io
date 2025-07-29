import React, { useState, useCallback } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import NavigationBar from './components/NavigationBar';
import DateRangeSelector from './components/DateRangeSelector';
import TabGroup from './components/TabGroup';
import BudgetChecker from './components/BudgetChecker';
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
  const [currentView, setCurrentView] = useState('tracker'); // 'tracker' or 'budget'
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);

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

  const handleBudgetCheckerToggle = useCallback(() => {
    setCurrentView(currentView === 'budget' ? 'tracker' : 'budget');
  }, [currentView]);

  const handleTrackerStatsView = useCallback(() => {
    setCurrentView('tracker');
  }, []);

  return (
    <div className="app-container d-flex flex-column vh-100">
      <NavigationBar 
        currentDateRange={dateRange}
        onBudgetCheckerToggle={handleBudgetCheckerToggle}
        onTrackerStatsView={handleTrackerStatsView}
        currentView={currentView}
      />
      <div className={`flex-grow-1 ${isGlobalLoading ? 'loading-overlay' : ''}`}>
        {currentView === 'tracker' ? (
          <>
            <DateRangeSelector 
              onDateChange={handleDateChange} 
              onFilterApply={handleFilterApply}
              currentDateRange={dateRange}
              availableColumns={availableColumns}
              disabled={isGlobalLoading}
            />
            <TabGroup
              dateRange={dateRange}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              filters={filters}
              onColumnsUpdate={handleColumnsUpdate}
              onLoadingChange={setIsGlobalLoading}
            />
          </>
        ) : (
          <BudgetChecker onLoadingChange={setIsGlobalLoading} />
        )}
      </div>
    </div>
  );
}

export default App;