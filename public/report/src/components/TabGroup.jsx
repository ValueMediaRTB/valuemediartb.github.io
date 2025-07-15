import React, { useState, useEffect, useMemo } from 'react';
import { Tab, Nav, Button, Modal, Form/*,ProgressBar*/ } from 'react-bootstrap';
import MainTable from './MainTable';
import { fetchTableData } from '../api';

const DEFAULT_TAB_OPTIONS = ['Campaigns', 'Zones', 'SubIDs', 'Countries', 'ISPs'];

const TabGroup = ({ dateRange, activeTab, setActiveTab, filters, onColumnsUpdate }) => {
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc'});
  const [customGroups, setCustomGroups] = useState(() => {
    const savedGroups = sessionStorage.getItem('customGroups');
    return savedGroups ? JSON.parse(savedGroups) : [];
  });
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [tableData, setTableData] = useState([]);
  const [serverTotals, setServerTotals] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [newGroup, setNewGroup] = useState({
    option1: 'None',
    option2: 'None'
  });

  // Calculate totals and averages if not received from server
  /*
  const clientTotals = useMemo(() => {
    if (!tableData.length) return null;
    
    const numericColumns = ['clicks', 'conversions', 'cost', 'profit', 'revenue'];
    const avgColumns = ['cpc', 'epc', 'cr'];
    
    const result = { id: 'Totals', name: 'Totals' };
    
    // Sum numeric columns
    numericColumns.forEach(col => {
      result[col] = tableData.reduce((sum, row) => sum + (row[col] || 0), 0);
    });
    
    // Calculate averages
    avgColumns.forEach(col => {
      const sum = tableData.reduce((sum, row) => sum + (row[col] || 0), 0);
      result[col] = tableData.length ? (sum / tableData.length).toFixed(2) : 0;
    });
    
    return result;
  }, [tableData]);*/

  const totals = serverTotals;

  // Save custom groups to sessionStorage whenever they change
  useEffect(() => {
    sessionStorage.setItem('customGroups', JSON.stringify(customGroups));
  }, [customGroups]);

  const handleDeleteGroup = (groupName, e) => {
    e.stopPropagation();
    const updatedGroups = customGroups.filter(g => g.name !== groupName);
    setCustomGroups(updatedGroups);
    
    if (activeTab === groupName) {
      setActiveTab(null);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!activeTab || !dateRange.start || !dateRange.end || isLoading) return;
      
      setIsLoading(true);
      try {
        setLoadingProgress(20);
        setLoadingMessage('Sending request...');
        const response = await fetchTableData(activeTab, dateRange, filters);
        setLoadingProgress(70);
        setLoadingMessage('Processing data...');
        let data = response.data || response;

        const totals = response.totals || null;
        // Set server totals
        setServerTotals(totals);

        //if a group is selected, display 'primary_value' and 'secondary_value' values in key columns
        if (customGroups.some(group => group.name === activeTab)) {
          const group = customGroups.find(g => g.name === activeTab);
          data = data.map(item => ({
            [group.options[0].toLowerCase()]: item.primary_value || "",
            [group.options[1].toLowerCase()]: item.secondary_value || "",
            ...item
          }));
        }
        setTableData(data);
        setLoadingProgress(90);
        setLoadingMessage(`Loaded ${data.length} records successfully`);
        // Clear loading state after a brief delay to show completion
        setTimeout(() => {
          setLoadingProgress(100);
          setTimeout(() => {
            setIsLoading(false);
            setLoadingProgress(0);
            setLoadingMessage('');
          }, 500);
        }, 200);
      } catch (error) {
        console.error("Error fetching data:", error);
        setTableData([]);
        setServerTotals(null);
        setLoadingMessage('Error loading data')
        setIsLoading(false);
        setLoadingProgress(0);
      }
    };

    fetchData();
  }, [activeTab, dateRange, filters]);

  const allTabs = [...DEFAULT_TAB_OPTIONS, ...customGroups.map(g => g.name)];

  const handleTabSelect = (tab) => {
    if (dateRange.start && dateRange.end && !isLoading) {
      setActiveTab(tab);
      setCurrentPage(1);
      setSortConfig({ key: null, direction: 'asc'});
    }
  };

  const handleCreateGroup = () => {
    setShowGroupModal(true);
  };

  const handleGroupInputChange = (e) => {
    const { name, value } = e.target;
    setNewGroup(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateNewGroup = () => {
    if (newGroup.option1 === 'None' || newGroup.option2 === 'None') {
      alert('Please select both options');
      return;
    }

    const groupName = `${newGroup.option1}_${newGroup.option2}`;
    const groupOptions = [newGroup.option1, newGroup.option2];

    setCustomGroups([...customGroups, {
      name: groupName,
      options: groupOptions
    }]);
    
    setActiveTab(groupName);
    setShowGroupModal(false);
    setNewGroup({
      option1: 'None',
      option2: 'None'
    });
  };

  const getAvailableOptions = (currentSelection, excludeSelection) => {
    const exclude = excludeSelection === 'None' ? [] : [excludeSelection];
    return ['None', ...DEFAULT_TAB_OPTIONS.filter(opt => !exclude.includes(opt))];
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
    setCurrentPage(1);
  };

  // Dynamic columns based on active tab
  const columns = useMemo(() => {
    // Handle custom groups as before
    const customGroup = customGroups.find(group => group.name === activeTab);
    if (tableData.length > 0) {
      // Dynamic columns based on first row of data
      const firstRow = tableData[0];
      let headers = Object.keys(firstRow).map(key => ({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '), // Better label formatting
        sortable: true,
        numeric: typeof firstRow[key] === 'number'
      }));
      headers = headers.filter(header => header.key !== 'date');
      if (customGroup) {
        headers = headers.filter(header => 
          header.key !== 'primary_type' && 
          header.key !== 'secondary_type' && 
          header.key !== 'primary_value' && 
          header.key !== 'secondary_value'
        );
      }
      
      // Update available columns for the DateRangeSelector
      if (onColumnsUpdate) {
        onColumnsUpdate(headers);
      }
      
      return headers;
    }

    // Fallback: show minimal if no data yet
    return [
      { key: 'id', label: 'ID', sortable: true },
      { key: 'name', label: 'Name', sortable: true }
    ];
  }, [activeTab, customGroups, tableData, onColumnsUpdate]);

  return (
    <div className="px-3" style={{ position: 'relative' }}>
      <div className="d-flex align-items-center">
        <Nav variant="tabs" activeKey={activeTab || DEFAULT_TAB_OPTIONS[0]}>
          {DEFAULT_TAB_OPTIONS.map(tab => (
            <Nav.Item key={tab}>
              <Nav.Link 
                eventKey={tab}
                onClick={() => handleTabSelect(tab)}
                disabled={!dateRange.start || !dateRange.end  || isLoading}
              >
                {tab}
              </Nav.Link>
            </Nav.Item>
          ))}
          {customGroups.map(group => (
            <Nav.Item key={group.name}>
              <Nav.Link 
                eventKey={group.name}
                onClick={() => handleTabSelect(group.name)}
                disabled={!dateRange.start || !dateRange.end  || isLoading}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  minHeight: 'auto',
                  paddingTop: '0.5rem',
                  paddingBottom: '0.5rem'
                }}
              >
                <span>{group.name}</span>
                <Button 
                  className="text-danger p-0"
                  onClick={(e) => handleDeleteGroup(group.name, e)}
                  style={{ 
                    fontSize: '1.2rem',
                    lineHeight: '1.2',
                    minWidth: 'auto',
                    height: '20px',
                    transform:'translateY(-2px)',
                    border: 'none',
                    background: 'none'
                  }}
                  disabled={!dateRange.start || !dateRange.end  || isLoading}
                >
                  ×
                </Button>
              </Nav.Link>
            </Nav.Item>
          ))}
        </Nav>
        
        <Button 
          variant="outline-primary" 
          onClick={handleCreateGroup}
          disabled={!dateRange.start || !dateRange.end ||isLoading}
          className="ms-2 mt-1"
          style={{ whiteSpace: 'nowrap' }}
        >
          Create Group
        </Button>
      </div>
      {/* Loading Progress Bar */}
      {/*isLoading && (
        <div className="mt-2 mb-2">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <small className="text-muted">{loadingMessage}</small>
            <small className="text-muted">{loadingProgress.toFixed(0)}%</small>
          </div>
          <ProgressBar 
            now={loadingProgress} 
            variant={loadingProgress < 30 ? "info" : loadingProgress < 70 ? "warning" : "success"}
            style={{ height: '4px' }}
          />
        </div>
      )*/}

      {activeTab && (
        <div className="mt-1" style={{ position: 'relative' }}>
          <MainTable
            data={tableData}
            columns={columns}
            sortConfig={sortConfig}
            onSort={handleSort}
            initialPageSize={pageSize}
            isLoading={isLoading}
            totals={totals}
            filters={filters}
            activeTab={activeTab}
            dateRange={dateRange}
            stickyHeader
            stickyPagination
          />
        </div>
      )}

      <Modal show={showGroupModal} onHide={() => setShowGroupModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Create New Group</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>First Option</Form.Label>
              <Form.Select
                name="option1"
                value={newGroup.option1}
                onChange={handleGroupInputChange}
              >
                {getAvailableOptions(newGroup.option1, newGroup.option2).map(option => (
                  <option key={`option1-${option}`} value={option}>
                    {option}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Second Option</Form.Label>
              <Form.Select
                name="option2"
                value={newGroup.option2}
                onChange={handleGroupInputChange}
              >
                {getAvailableOptions(newGroup.option2, newGroup.option1).map(option => (
                  <option key={`option2-${option}`} value={option}>
                    {option}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowGroupModal(false)}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={handleCreateNewGroup}
            disabled={newGroup.option1 === 'None' || newGroup.option2 === 'None'}
          >
            Create
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default TabGroup;