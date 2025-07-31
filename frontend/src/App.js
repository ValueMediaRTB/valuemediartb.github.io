import React, { useState,useEffect,useRef, useCallback } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import NavigationBar from './components/NavigationBar';
import DateRangeSelector from './components/DateRangeSelector';
import TabGroup from './components/TabGroup';
import BudgetChecker from './components/BudgetChecker';
import Login from './components/Login';
import HomePage from './components/HomePage';
import ExternalAPIsPage from './components/ExternalAPIsPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import 'react-datepicker/dist/react-datepicker.css';

function AppContent({setResetAllFn}) {
  const { isAuthenticated, loading } = useAuth();
  
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
  const [currentView, setCurrentView] = useState('home'); // 'home', 'external_apis', 'tracker', or 'budget'
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);

  const resetAll = ()=>{
    setActiveTab(null);
    setDateRange(null);
    setFilters(null);
    setAvailableColumns(null);
  };
  useEffect(() => {
    setResetAllFn(() => resetAll);
  }, [setResetAllFn]);

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
    setCurrentView(currentView === 'budget' ? 'home' : 'budget');
  }, [currentView]);

  const handleTrackerStatsView = useCallback(() => {
    setCurrentView('tracker');
  }, []);

  const handleHomeView = useCallback(() => {
    setCurrentView('home');
  }, []);

  const handleExternalAPIsView = useCallback(() => {
    setCurrentView('external_apis');
  }, []);

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <Login />;
  }

  // Show main app if authenticated
  return (
    <div className="app-container d-flex flex-column vh-100">
      {currentView !== 'home' && currentView !== 'external_apis' && (
        <NavigationBar 
          currentDateRange={dateRange}
          onBudgetCheckerToggle={handleBudgetCheckerToggle}
          onTrackerStatsView={handleTrackerStatsView}
          onHomeView={handleHomeView}
          currentView={currentView}
        />
      )}
      <div className={`flex-grow-1 ${isGlobalLoading ? 'loading-overlay' : ''}`}>
        {currentView === 'home' ? (
          <HomePage 
            onTrackerStatsView={handleTrackerStatsView}
            onExternalAPIsView={handleExternalAPIsView}
          />
        ) : currentView === 'external_apis' ? (
          <ExternalAPIsPage 
            onHomeView={handleHomeView}
          />
        ) : currentView === 'tracker' ? (
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

function App() {
  const resetAllRef = useRef(()=>{});
  const setResetAllCallback = useCallback((setterFn)=>{
    resetAllRef.current = setterFn;
  },[]);
  return (
    <AuthProvider setResetAllCallback={resetAllRef}>
      <AppContent setResetAllFn={setResetAllCallback}/>
    </AuthProvider>
  );
}

export default App;