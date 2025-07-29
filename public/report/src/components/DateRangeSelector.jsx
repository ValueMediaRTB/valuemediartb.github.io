import React, { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import { Button, Form, Dropdown } from 'react-bootstrap';
import 'react-datepicker/dist/react-datepicker.css';

// Mandatory filter options that should always be available
const mandatoryFilterOptions = [
  { key: 'traffic_source', label: 'Traffic Source' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'conversions', label: 'Conversions' },
  { key: 'cost', label: 'Cost' },
  { key: 'profit', label: 'Profit' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'cpc', label: 'CPC' },
  { key: 'epc', label: 'EPC' },
  { key: 'cr', label: 'CR' },
  { key: 'roi', label: 'ROI' }
];

const numericFilters = [
  'clicks',
  'conversions',
  'cost',
  'profit',
  'revenue',
  'cpc',
  'epc',
  'cr',
  'roi'
];

const DateRangeSelector = ({ onDateChange, onFilterApply, currentDateRange, availableColumns = [], disabled = false }) => {
  const getDefaultLast7Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    return [start, end];
  };

  const [dateRange, setDateRange] = useState(getDefaultLast7Days());
  const [selectedFilters, setSelectedFilters] = useState([]);
  const [filterValues, setFilterValues] = useState({});
  const [filterOperators, setFilterOperators] = useState({});
  const [dateWarning, setDateWarning] = useState('');

  const [startDate, endDate] = dateRange;

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
    const newFilterOperators = { ...filterOperators };
    delete newFilterValues[filterToRemove];
    delete newFilterOperators[filterToRemove];
    setFilterValues(newFilterValues);
    setFilterOperators(newFilterOperators);
  };

  const handleFilterValueChange = (filter, value) => {
    setFilterValues({ ...filterValues, [filter]: value });
  };

  const datesAreEqual = (date1, date2) => {
    if (!date1 && !date2) return true;
    if (!date1 || !date2) return false;
    return date1.getTime() === date2.getTime();
  };

  const getFilterOptions = () => {
    const mandatoryKeys = mandatoryFilterOptions.map(filter => filter.key);
    const uniqueColumns = availableColumns
      .filter(col => !mandatoryKeys.includes(col.key))
      .map(col => ({
        key: col.key,
        label: col.label || col.key.charAt(0).toUpperCase() + col.key.slice(1).replace(/_/g, ' ')
      }));

    return [...mandatoryFilterOptions, ...uniqueColumns];
  };

  const filterOptions = getFilterOptions();

  const handleApplyAll = () => {
    if (dateWarning) return;

    let hasDateChanged = false;

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
    <div className="bg-light px-3 pb-2">
      <div className="d-flex align-items-end gap-2 flex-wrap">
        {/* Date Picker */}
        <div style={{ minWidth: '250px', display: 'grid' }}>
          <div className="form-label" style={{ fontSize: '0.9rem', marginBottom: '2px', marginTop: '4px' }}>
            Date
          </div>
          <DatePicker
            selectsRange
            startDate={startDate}
            maxDate={new Date()}
            endDate={endDate}
            onChange={(update) => {
              if (!update || (Array.isArray(update) && update.every(date => date === null))) {
                setDateRange(getDefaultLast7Days());
                setDateWarning('');
                return;
              }

              const [start, end] = update;

              if (start && end) {
                const diffInDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                const today = new Date();
                const fourMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 4, today.getDate());
                if (diffInDays > 60) {
                  setDateRange(getDefaultLast7Days());
                  setDateWarning('Please select a range of 60 days or less.');
                  return;
                }
                if(start < fourMonthsAgo){
                  setDateRange(getDefaultLast7Days());
                  setDateWarning('Start date cannot be earlier than 4 months ago.');
                  return;
                }
              }
              setDateRange(update);
              setDateWarning('');
            }}
            className="form-control"
            placeholderText="Select date range"
            disabled={disabled}
          />
          {dateWarning && (
            <div style={{ color: 'red', fontSize: '0.85rem', marginTop: '4px' }}>
              {dateWarning}
            </div>
          )}
        </div>

        {/* Apply Button */}
        <Button variant="primary" onClick={handleApplyAll} disabled={!!dateWarning || disabled}>
          Apply
        </Button>

        {/* Add Filter Dropdown */}
        <Dropdown>
          <Dropdown.Toggle variant="outline-secondary" disabled={disabled}>
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

        {/* Filter Input Fields */}
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
                    {numericFilters.includes(filter) && (
                      <Form.Select
                        value={filterOperators[filter] || '='}
                        onChange={(e) => handleOperatorChange(filter, e.target.value)}
                        style={{ maxWidth: '60px', marginRight: '4px' }}
                        disabled={disabled}
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
                      disabled={disabled}
                    />

                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => handleRemoveFilter(filter)}
                      style={{ marginLeft: '4px', padding: '0px 6px', fontSize: '1.3rem', lineHeight: '1.3' }}
                      disabled={disabled}
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