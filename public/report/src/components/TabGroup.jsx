import React, { useState, useEffect, useMemo } from 'react';
import { Tab, Nav, Button, Modal, Form } from 'react-bootstrap';
import MainTable from './MainTable';
import { fetchTableData, clearSortedFilteredCache } from '../api';

const DEFAULT_TAB_OPTIONS = ['Campaigns', 'Zones', 'SubIDs', 'Countries', 'ISPs'];

const TabGroup = ({ dateRange, activeTab, setActiveTab, filters, onColumnsUpdate, onLoadingChange }) => {
  const [pageSize, setPageSize] = useState(50);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [customGroups, setCustomGroups] = useState(() => {
    const savedGroups = sessionStorage.getItem('customGroups');
    return savedGroups ? JSON.parse(savedGroups) : [];
  });
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [serverPageData, setServerPageData] = useState([]);
  const [serverTotals, setServerTotals] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [serverPaginationInfo, setServerPaginationInfo] = useState({
    currentServerPage: 1,
    totalServerPages: 1,
    totalRecords: 0,
    isPaginated: false,
    sessionId: null
  });
  const [newGroup, setNewGroup] = useState({
    option1: 'None',
    option2: 'None'
  });

  // Save custom groups to sessionStorage whenever they change
  useEffect(() => {
    sessionStorage.setItem('customGroups', JSON.stringify(customGroups));
  }, [customGroups]);

  // Notify parent component about loading state
  useEffect(() => {
    if (onLoadingChange) {
      onLoadingChange(isLoading);
    }
  }, [isLoading, onLoadingChange]);

  const handleDeleteGroup = (groupName, e) => {
    e.stopPropagation();
    const updatedGroups = customGroups.filter(g => g.name !== groupName);
    setCustomGroups(updatedGroups);
    
    if (activeTab === groupName) {
      setActiveTab(null);
    }
  };

  // Fetch a specific server page
  const fetchServerPage = async (serverPageNumber) => {
    if (!activeTab || !dateRange.start || !dateRange.end || isLoading) return;
    
    setIsLoading(true);
    try {
      console.log(`Fetching server page ${serverPageNumber} for ${activeTab}`);
      
      const response = await fetchTableData(
        activeTab,
        dateRange,
        filters,
        sortConfig,
        serverPageNumber
      );
      
      let data = response.data || [];
      const totals = response.totals || null;
      
      // Handle custom groups
      if (customGroups.some(group => group.name === activeTab)) {
        const group = customGroups.find(g => g.name === activeTab);
        data = data.map(item => ({
          [group.options[0].toLowerCase()]: item.pv || "",
          [group.options[1].toLowerCase()]: item.sv || "",
          ...item
        }));
      }
      
      // Only update if we're still on the same tab
      if (activeTab === activeTab) {
        setServerPageData(data);
        setServerTotals(totals);
        setServerPaginationInfo({
          currentServerPage: response.currentServerPage || serverPageNumber,
          totalServerPages: response.totalServerPages || 1,
          totalRecords: response.totalRecords || data.length,
          isPaginated: response.isPaginated || false,
          sessionId: response.sessionId || null
        });
      }
      
      console.log(`Loaded server page ${serverPageNumber}: ${data.length} records`);
      
    } catch (error) {
      console.error("Error fetching server page:", error);
      setServerPageData([]);
      setServerTotals(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load when tab changes
  useEffect(() => {
    if (activeTab && dateRange.start && dateRange.end) {
      // Always start with server page 1 when tab changes
      clearSortedFilteredCache(activeTab, dateRange);
      fetchServerPage(1);
    }
  }, [activeTab, dateRange, filters, sortConfig]);

  const allTabs = [...DEFAULT_TAB_OPTIONS, ...customGroups.map(g => g.name)];

  const handleTabSelect = (tab) => {
    if (dateRange.start && dateRange.end && !isLoading) {
      
      setActiveTab(tab);
      setSortConfig({ key: null, direction: 'asc' });
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
    const newDirection = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    clearSortedFilteredCache(activeTab,dateRange);
    setSortConfig({ key, direction: newDirection });
  };

  // Handle server page request from MainTable
  const handleServerPageRequest = (serverPageNumber) => {
    console.log(`MainTable requested server page ${serverPageNumber}`);
    fetchServerPage(serverPageNumber);
  };

  // Dynamic columns based on active tab
  const columns = useMemo(() => {
    const customGroup = customGroups.find(group => group.name === activeTab);
    const columnLabelMap = {
      'cl': 'Clicks',
      'cv': 'Conversions', 
      'rev': 'Revenue',
      'pft': 'Profit',
      'cpc': 'CPC',
      'epc': 'EPC',
      'cr': 'CR',
      'roi': 'ROI'
    };
    
    if (serverPageData.length > 0) {
      const firstRow = serverPageData[0];
      let headers = Object.keys(firstRow).map(key => {
        const label = columnLabelMap[key] || 
                     key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
        
        return {
          key,
          label,
          sortable: true,
          numeric: typeof firstRow[key] === 'number'
        };
      });
      
      headers = headers.filter(header => header.key !== 'date');
      if (customGroup) {
        headers = headers.filter(header => 
          header.key !== 'pt' && 
          header.key !== 'st' && 
          header.key !== 'pv' && 
          header.key !== 'sv'
        );
      }
      
      if (onColumnsUpdate) {
        onColumnsUpdate(headers);
      }
      
      return headers;
    }

    return [
      { key: 'id', label: 'ID', sortable: true },
      { key: 'name', label: 'Name', sortable: true }
    ];
  }, [activeTab, customGroups, serverPageData]);

  useEffect(() => {
    if (onColumnsUpdate && columns.length > 0) {
      onColumnsUpdate(columns);
    }
  }, [columns, onColumnsUpdate]);

  return (
    <div className="px-3" style={{ position: 'relative' }}>
      <div className="d-flex align-items-center">
        <Nav variant="tabs" activeKey={activeTab || DEFAULT_TAB_OPTIONS[0]}>
          {DEFAULT_TAB_OPTIONS.map(tab => (
            <Nav.Item key={tab}>
              <Nav.Link 
                eventKey={tab}
                onClick={() => handleTabSelect(tab)}
                disabled={!dateRange.start || !dateRange.end || isLoading}
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
                disabled={!dateRange.start || !dateRange.end || isLoading}
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
                  disabled={!dateRange.start || !dateRange.end || isLoading}
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
          disabled={!dateRange.start || !dateRange.end || isLoading}
          className="ms-1 mt-1"
          style={{ whiteSpace: 'nowrap' }}
        >
          Create Group
        </Button>
      </div>

      {activeTab && (
        <div className="mt-1" style={{ position: 'relative' }}>
          <MainTable
            serverPageData={serverPageData}
            columns={columns}
            sortConfig={sortConfig}
            onSort={handleSort}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            isLoading={isLoading}
            totals={serverTotals}
            filters={filters}
            activeTab={activeTab}
            dateRange={dateRange}
            serverPaginationInfo={serverPaginationInfo}
            onServerPageRequest={handleServerPageRequest}
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