import React from 'react';

const filterOptions = [
  'Traffic Source',
  'Campaign',
  'Clicks',
  'Conversions',
  'Cost',
  'Profit',
  'Revenue',
  'CPC',
  'EPC',
  'CR'
];

const FilterMenu = ({
  onFilterSelect,
  activeFilter,
  filterValue,
  onFilterValueChange,
  onApplyFilter
}) => {
  return (
    <div className="filter-menu">
      <div className="filter-options">
        {filterOptions.map(option => (
          <button
            key={option}
            onClick={() => onFilterSelect(option)}
            className={activeFilter === option ? 'active' : ''}
          >
            {option}
          </button>
        ))}
      </div>
      
      {activeFilter && (
        <div className="filter-input-row">
          <input
            type="text"
            value={filterValue}
            onChange={(e) => onFilterValueChange(e.target.value)}
            placeholder={`Filter by ${activeFilter}`}
          />
          <button onClick={onApplyFilter}>Apply</button>
        </div>
      )}
    </div>
  );
};

export default FilterMenu;