import React, { useMemo, useState } from 'react';
import { Table, Pagination, Form } from 'react-bootstrap';

const MainTable = ({ 
  data = [], 
  columns = [], 
  pageSize: initialPageSize = 50,
  onPageSizeChange,
  onPageChange,
  isLoading
}) => {
  // Safe default values in parameters
  
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

    // Sorting logic
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data;
    
    return [...data].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortConfig]);

  // Pagination logic
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedData.slice(startIndex, startIndex + pageSize);
  }, [sortedData, currentPage, pageSize]);

    // Internal pagination handlers
  const handlePageChange = (page) => {
    setCurrentPage(page);
    onPageChange?.(page); // Notify parent if callback provided
  };

  const totalPages = Math.ceil(sortedData.length / pageSize);

  const requestSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
    setCurrentPage(1);
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setCurrentPage(1);
    if (onPageSizeChange) onPageSizeChange(size);
  };

  const formatCellValue = (value, key) => {
    if (typeof value === 'number') {
      if (['cost', 'profit', 'revenue', 'cpc', 'epc'].includes(key)) {
        return `$${value.toFixed(2)}`;
      }
      if (['cr'].includes(key)) {
        return `${value.toFixed(2)}%`;
      }
    }
    return value;
  };

    if (isLoading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
    }
    return (
    <div className="table-container">
      <Table striped bordered hover responsive>
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column.key}>
                <div 
                  className={`d-flex align-items-center ${column.sortable ? 'cursor-pointer' : ''}`}
                  onClick={() => column.sortable && requestSort(column.key)}
                >
                  {column.label}
                  {column.sortable && (
                    <span className="ms-2">
                      {sortConfig.key === column.key ? (
                        sortConfig.direction === 'asc' ? '↑' : '↓'
                      ) : '↕'}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paginatedData.length > 0 ? (
            paginatedData.map((row, index) => (
              <tr key={row.id || index}>
                {columns.map(column => (
                  <td key={`${row.id || index}-${column.key}`}>
                    {formatCellValue(row[column.key], column.key)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="text-center py-4">
                No data available
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <div className="d-flex justify-content-between align-items-center mt-3">
        <Form.Select
          style={{ width: '80px' }}
          value={pageSize}
          onChange={(e) => handlePageSizeChange(Number(e.target.value))}
        >
          {[50, 100, 200].map(size => (
            <option key={size} value={size}>{size}</option>
          ))}
        </Form.Select>

        <Pagination>
          <Pagination.Prev 
            disabled={currentPage === 1} 
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
          />
          {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
            const pageNum = Math.max(1, Math.min(
              totalPages - 4, 
              currentPage - 2
            )) + i;
            return (
              <Pagination.Item
                key={pageNum}
                active={pageNum === currentPage}
                onClick={() => setCurrentPage(pageNum)}
              >
                {pageNum}
              </Pagination.Item>
            );
          })}
          <Pagination.Next 
            disabled={currentPage === totalPages} 
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
          />
        </Pagination>
      </div>
    </div>
  );
};

export default MainTable;