import React, { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import { Button, Form, Dropdown } from 'react-bootstrap';
import 'react-datepicker/dist/react-datepicker.css';

const defaultFilterOptions = [
  'Traffic Source',
  'Clicks', 
  'Conversions',
  'Cost',
  'Profit',
  'CPC',
  'EPC', 
  'CR',
  'ROI'
];

const numericFilters = [
  'Clicks',
  'Conversions',
  'Cost',
  'Profit',
  'Revenue',
  'CPC',
  'EPC',
  'CR',
  'ROI'
];

const DateRangeSelector = ({ onDateChange, onFilterApply, currentDateRange, availableColumns = [] }) => {
  // Calculate default last 7 days interval here:
  const getDefaultLast7Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6); // last 7 days includes today + 6 previous days
    return [start, end];
  };

  // Set default state to last 7 days
  const [dateRange, setDateRange] = useState(getDefaultLast7Days());
  const [selectedFilters, setSelectedFilters] = useState([]);
  const [filterValues, setFilterValues] = useState({});
  const [startDate, endDate] = dateRange;

  const [filterOperators, setFilterOperators] = useState({});

  const handleOperatorChange = (filter, operator) => {
    setFilterOperators({ ...filterOperators, [filter]: operator });
  };

  const handleAddFilter = (filterKey, filterLabel) => {
    if (!selectedFilters.includes(filterKey)) {
      setSelectedFilters([...selectedFilters, filterKey]);
      setFilterValues({ ...filterValues, [filterKey]: '' });
    }
  };

  const handleRemoveFilter = (filterToRemove) => {
    setSelectedFilters(selectedFilters.filter(f => f !== filterToRemove));
    const newFilterValues = { ...filterValues };
    delete newFilterValues[filterToRemove];
    setFilterValues(newFilterValues);
  };

  const handleFilterValueChange = (filter, value) => {
    setFilterValues({ ...filterValues, [filter]: value });
  };

  // Helper function to compare dates
  const datesAreEqual = (date1, date2) => {
    if (!date1 && !date2) return true;
    if (!date1 || !date2) return false;
    return date1.getTime() === date2.getTime();
  };

  // Generate filter options based on available columns
  const getFilterOptions = () => {
    // Convert default filter names to keys for comparison
    const defaultFilterKeys = defaultFilterOptions.map(filter => 
      filter.toLowerCase().replace(/\s+/g, '_')
    );

    // Get tab-specific columns that aren't in the default list
    const tabSpecificColumns = availableColumns
      .filter(col => !defaultFilterKeys.includes(col.key))
      .map(col => ({
        key: col.key,
        label: col.label || col.key.charAt(0).toUpperCase() + col.key.slice(1).replace(/_/g, ' ')
      }));

    // Create default options with proper keys
    const defaultOptions = defaultFilterOptions.map(filter => ({
      key: filter.toLowerCase().replace(/\s+/g, '_'),
      label: filter
    }));

    return [...defaultOptions, ...tabSpecificColumns];
  };

  const filterOptions = getFilterOptions();

  const handleApplyAll = () => {
    let hasDateChanged = false;

    // Check if dates have actually changed
    if (startDate && endDate) {
      const currentStart = currentDateRange?.start;
      const currentEnd = currentDateRange?.end;
      
      hasDateChanged = !datesAreEqual(startDate, currentStart) || 
                      !datesAreEqual(endDate, currentEnd);
      
      onDateChange({ start: startDate, end: endDate }, hasDateChanged);
    }

    const activeFilters = selectedFilters
      .map(filter => ({
        type: filter,
        value: filterValues[filter],
        operator: filterOperators[filter] || '='
      }))
      .filter(f => f.value && f.value.trim() !== '');

    onFilterApply(activeFilters);
  };

  return (
    <div className="bg-light px-3 pb-2 mb-2">
      <div className="d-flex align-items-end gap-2 flex-wrap">
        {/* Date Picker with slightly increased width */}
        <div style={{ minWidth: '250px', display: 'grid' }}>
          <div class={"form-label"} style={{ fontSize: '0.9rem', marginBottom: '2px', marginTop: '4px' }}>
            {"Date"}
          </div>
          <DatePicker
            selectsRange
            startDate={startDate}
            endDate={endDate}
            onChange={(update) => {
              // If cleared (update is null or [null, null]), reset to default last 7 days
              if (
                !update || 
                (Array.isArray(update) && update.every(date => date === null))
              ) {
                setDateRange(getDefaultLast7Days());
              } else {
                setDateRange(update);
              }
            }}
            className="form-control"
            placeholderText="Select date range"
          />
        </div>

        {/* Apply Button */}
        <Button variant="primary" onClick={handleApplyAll}>
          Apply
        </Button>

        {/* Add Filter Button (placed outside scroll container) */}
        <Dropdown>
          <Dropdown.Toggle variant="outline-secondary">
            Add Filter
          </Dropdown.Toggle>
          <Dropdown.Menu>
            {filterOptions.map(option => (
              <Dropdown.Item
                key={option.key}
                onClick={() => handleAddFilter(option.key, option.label)}
                disabled={selectedFilters.includes(option.key)}
              >
                {option.label}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>

        {/* Scrollable Filter Inputs */}
        <div
          style={{
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            display: 'flex',
            transform: 'rotateX(180deg)',
            flex: 1
          }}
        >
          {selectedFilters.map(filter => {
            const filterOption = filterOptions.find(opt => opt.key === filter);
            const filterLabel = filterOption ? filterOption.label : filter;
            
            return (
              <div
                key={filter}
                style={{
                  minWidth: filter === 'traffic_source' ? '300px' : '260px',
                  maxWidth: filter === 'traffic_source' ? '300px' : '260px',
                  transform: 'rotateX(180deg)',
                  marginRight: '8px',
                  flex: '0 0 auto'
                }}
              >
                <Form.Group className="mb-0">
                  <Form.Label style={{ fontSize: '0.9rem', marginBottom: '2px' }}>
                    {filterLabel}
                  </Form.Label>
                  <div className="d-flex align-items-center">
                    {numericFilters.includes(filterLabel) && (
                      <Form.Select
                        value={filterOperators[filter] || '='}
                        onChange={(e) => handleOperatorChange(filter, e.target.value)}
                        style={{ maxWidth: '60px', marginRight: '4px' }}
                      >
                        <option value="<">&lt;</option>
                        <option value="=">=</option>
                        <option value=">">&gt;</option>
                      </Form.Select>
                    )}

                    <Form.Control
                      type="text"
                      value={filterValues[filter] || ''}
                      onChange={(e) => handleFilterValueChange(filter, e.target.value)}
                      placeholder={
                        filter === 'traffic_source'
                          ? 'Enter values separated by ,'
                          : `Filter by ${filterLabel}`
                      }
                    />

                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => handleRemoveFilter(filter)}
                      style={{ marginLeft: '4px', padding: '0px 6px', fontSize: '1.3rem', lineHeight: '1.3' }}
                    >
                      ×
                    </Button>
                  </div>
                </Form.Group>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DateRangeSelector;