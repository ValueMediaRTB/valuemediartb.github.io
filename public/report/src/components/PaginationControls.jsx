import React from 'react';

const PaginationControls = ({
  totalItems,
  pageSize,
  currentPage,
  onPageSizeChange,
  onPageChange,
  totals
}) => {
  const totalPages = Math.ceil(totalItems / pageSize);
  
  return (
    <div className="pagination-controls">
      <div className="page-size-selector">
        <span>Items per page:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={200}>200</option>
        </select>
      </div>
      
      <div className="page-navigation">
        <button
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Previous
        </button>
        
        <span>Page {currentPage} of {totalPages}</span>
        
        <button
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
        </button>
      </div>
      
      <div className="totals-display">
        {Object.entries(totals).map(([key, value]) => (
          <div key={key}>
            <strong>{key}:</strong> {value}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PaginationControls;