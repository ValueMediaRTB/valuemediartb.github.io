import React, { useState, useEffect, useMemo } from 'react';
import { Tab, Nav, Button, Modal, Form } from 'react-bootstrap';
import MainTable from './MainTable';
import { fetchTableData } from '../api';

const DEFAULT_TAB_OPTIONS = ['Campaigns', 'Zones', 'Sub IDs', 'Countries', 'ISPs'];

const TabGroup = ({ dateRange, activeTab, setActiveTab, filters }) => {
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [customGroups, setCustomGroups] = useState([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [tableData, setTableData] = useState([]); // replace with real data
  const [isLoading, setIsLoading] = useState(false);
  const [newGroup, setNewGroup] = useState({
    name: '',
    option1: 'None',
    option2: 'None',
    option3: 'None'
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!activeTab || !dateRange.start || !dateRange.end) return;
      
      setIsLoading(true);
      try {
        const data = await fetchTableData(activeTab, dateRange, filters);
        setTableData(data);
      } catch (error) {
        console.error("Error fetching data:", error);
        setTableData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [activeTab, dateRange, filters]);

  const allTabs = [...DEFAULT_TAB_OPTIONS, ...customGroups.map(g => g.name)];

  const handleTabSelect = (tab) => {
    if (dateRange.start && dateRange.end) {
      setActiveTab(tab);
      setCurrentPage(1);
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
    if (!newGroup.name.trim()) return;
    
    const groupOptions = [
      newGroup.option1,
      newGroup.option2,
      newGroup.option3
    ].filter(opt => opt !== 'None');

    if (groupOptions.length === 0) return;

    setCustomGroups([...customGroups, {
      name: newGroup.name,
      options: groupOptions
    }]);
    setActiveTab(newGroup.name);
    setShowGroupModal(false);
    setNewGroup({
      name: '',
      option1: 'None',
      option2: 'None',
      option3: 'None'
    });
  };

  const getAvailableOptions = (currentSelection, excludeSelections) => {
    const usedOptions = excludeSelections.filter(opt => opt !== 'None' && opt !== currentSelection);
    return ['None', ...DEFAULT_TAB_OPTIONS.filter(opt => !usedOptions.includes(opt))];
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
    setCurrentPage(1);
  };

  const columns = [
    { key: 'id', label: 'ID', sortable: true },
    { key: 'name', label: 'Name', sortable: true },
    { key: 'clicks', label: 'Clicks', sortable: true, numeric: true },
    { key: 'conversions', label: 'Conversions', sortable: true, numeric: true },
    { key: 'cost', label: 'Cost', sortable: true, numeric: true },
    { key: 'profit', label: 'Profit', sortable: true, numeric: true },
    { key: 'revenue', label: 'Revenue', sortable: true, numeric: true },
    { key: 'cpc', label: 'CPC', sortable: true, numeric: true },
    { key: 'epc', label: 'EPC', sortable: true, numeric: true },
    { key: 'cr', label: 'CR', sortable: true, numeric: true }
  ];

  return (
    <div className="px-3">
      <div className="d-flex align-items-center">
        <Nav variant="tabs" activeKey={activeTab || DEFAULT_TAB_OPTIONS[0]}>
          {DEFAULT_TAB_OPTIONS.map(tab => (
            <Nav.Item key={tab}>
              <Nav.Link 
                eventKey={tab}
                onClick={() => handleTabSelect(tab)}
                disabled={!dateRange.start || !dateRange.end}
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
              >
                {group.name}
              </Nav.Link>
            </Nav.Item>
          ))}
        </Nav>
        
        <Button 
          variant="outline-primary" 
          onClick={handleCreateGroup}
          disabled={!dateRange.start || !dateRange.end}
          className="ms-2"
          style={{ whiteSpace: 'nowrap' }}
        >
          Create Group
        </Button>
      </div>

      {activeTab && (
        <div className="mt-1">
          <MainTable
            data={tableData}
            columns={columns}
            sortConfig={sortConfig}
            onSort={handleSort}
            initialPageSize={pageSize}
            isLoading={isLoading}
          />
        </div>
      )}

      {/* Create Group Modal */}
      <Modal show={showGroupModal} onHide={() => setShowGroupModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Create New Group</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Group Name</Form.Label>
              <Form.Control
                type="text"
                name="name"
                value={newGroup.name}
                onChange={handleGroupInputChange}
                placeholder="Enter group name"
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>First Option</Form.Label>
              <Form.Select
                name="option1"
                value={newGroup.option1}
                onChange={handleGroupInputChange}
              >
                {getAvailableOptions(
                  newGroup.option1,
                  [newGroup.option2, newGroup.option3]
                ).map(option => (
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
                disabled={newGroup.option1 === 'None'}
              >
                {getAvailableOptions(
                  newGroup.option2,
                  [newGroup.option1, newGroup.option3]
                ).map(option => (
                  <option key={`option2-${option}`} value={option}>
                    {option}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Third Option</Form.Label>
              <Form.Select
                name="option3"
                value={newGroup.option3}
                onChange={handleGroupInputChange}
                disabled={newGroup.option2 === 'None'}
              >
                {getAvailableOptions(
                  newGroup.option3,
                  [newGroup.option1, newGroup.option2]
                ).map(option => (
                  <option key={`option3-${option}`} value={option}>
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
            disabled={!newGroup.name.trim()}
          >
            Create
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default TabGroup;