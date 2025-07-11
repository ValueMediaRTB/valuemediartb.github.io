import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Table, Pagination, Form, Button } from 'react-bootstrap';
import './MainTable.css';

const MainTable = ({ 
  data = [], 
  columns = [],   
  sortConfig,
  onSort,
  pageSize: initialPageSize = 50,
  onPageSizeChange,
  onPageChange,
  isLoading,
  filters = [], // Add filters prop
  totals = null // Add totals prop
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [manualPageInput, setManualPageInput] = useState('');
  const tableRef = useRef(null);
  const [columnWidths, setColumnWidths] = useState([]);

  // Apply client-side filtering (exclude traffic_source as it's handled server-side)
  const filteredData = useMemo(() => {
    const clientFilters = filters.filter(filter => filter.type !== 'traffic_source');
    
    if (clientFilters.length === 0) return data;
    
    return data.filter(row => {
      return clientFilters.every(filter => {
        const value = row[filter.type];
        const filterValue = filter.value?.toString().toLowerCase().trim();
        const operator = filter.operator || '=';
        
        if (!filterValue) return true; // Skip empty filters
        
        // Handle numeric filtering
        if (typeof value === 'number') {
          const numericFilterValue = parseFloat(filterValue);
          if (isNaN(numericFilterValue)) return true; // Skip invalid numeric filters
          
          switch (operator) {
            case '<':
              return value < numericFilterValue;
            case '>':
              return value > numericFilterValue;
            case '=':
            default:
              return Math.abs(value - numericFilterValue) < 0.000001; // Handle floating point comparison
          }
        }
        
        // Handle string filtering (contains match, case insensitive)
        const stringValue = String(value || '').toLowerCase();
        
        // For traffic_source-like filters that might have comma-separated values
        if (filterValue.includes(',')) {
          const filterValues = filterValue.split(',').map(v => v.trim()).filter(v => v);
          return filterValues.some(fv => stringValue.includes(fv));
        }
        
        return stringValue.includes(filterValue);
      });
    });
  }, [data, filters]);

  const sortedData = useMemo(() => {
    if (!sortConfig?.key) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      const aIsNumber = typeof aValue === 'number';
      const bIsNumber = typeof bValue === 'number';

      if (aIsNumber && bIsNumber) {
        return sortConfig.direction === 'asc'
          ? aValue - bValue
          : bValue - aValue;
      }

      return sortConfig.direction === 'asc'
        ? String(aValue || '').localeCompare(String(bValue || ''))
        : String(bValue || '').localeCompare(String(aValue || ''));
    });
  }, [filteredData, sortConfig]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedData.slice(startIndex, startIndex + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  // Measure column widths from the actual table
  useEffect(() => {
    if (tableRef.current && columns.length > 0) {
      // Use a small delay to ensure the table is fully rendered
      const measureWidths = () => {
        // Double-check that tableRef is still valid
        if (!tableRef.current) return;
        
        const headerCells = tableRef.current.querySelectorAll('thead th');
        if (headerCells.length === 0) return;
        
        const widths = Array.from(headerCells).map(cell => {
          // Get the computed style to account for borders and padding
          const computedStyle = window.getComputedStyle(cell);
          const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0;
          const borderRight = parseFloat(computedStyle.borderRightWidth) || 0;
          // Return the full width including borders
          return cell.offsetWidth;
        });
        setColumnWidths(widths);
      };
      
      const timeoutId = setTimeout(measureWidths, 50);
      
      // Cleanup function to clear timeout if component unmounts
      return () => clearTimeout(timeoutId);
    }
  }, [columns, data, paginatedData]);

  const requestSort = (key) => {
    if (!onSort) return;
    onSort(key);
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setCurrentPage(1);
    onPageSizeChange?.(size);
  };

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      setManualPageInput('');
    }
  };

  const handleManualPageSubmit = (e) => {
    e.preventDefault();
    const page = parseInt(manualPageInput);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      setManualPageInput('');
    }
  };

  const exportToCSV = () => {
    const headers = columns.map(col => col.label).join(',');
    const csvData = filteredData.map(row => 
      columns.map(col => {
        const value = row[col.key];
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    ).join('\n');
    
    const csv = headers + '\n' + csvData;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatCellValue = (value, key,precision) => {
    if (typeof value === 'number') {
      if (['cost', 'profit', 'revenue'].includes(key)) {
        return `$${value.toLocaleString('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision })}`;
      }
      if (['cr'].includes(key)) {
        return value.toLocaleString('en-US', { minimumFractionDigits: 7, maximumFractionDigits: 7 });
      }
      if (['cpc','epc'].includes(key)) {
        return `$${value.toLocaleString('en-US', { minimumFractionDigits: 7, maximumFractionDigits: 7 })}`;
      }
      if (['roi'].includes(key)) {
        return `${value.toFixed(2)}%`;
      }
    }
    return value;
  };

  const generatePaginationItems = () => {
    const items = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) {
        items.push(
          <Pagination.Item
            key={i}
            active={i === currentPage}
            onClick={() => handlePageChange(i)}
          >
            {i}
          </Pagination.Item>
        );
      }
    } else {
      items.push(
        <Pagination.Item
          key={1}
          active={1 === currentPage}
          onClick={() => handlePageChange(1)}
        >
          1
        </Pagination.Item>
      );
      
      if (currentPage > 4) {
        items.push(<Pagination.Ellipsis key="start-ellipsis" />);
      }
      
      const start = Math.max(2, Math.min(currentPage - 1, totalPages - 3));
      const end = Math.min(totalPages - 1, Math.max(currentPage + 1, 4));
      
      for (let i = start; i <= end; i++) {
        items.push(
          <Pagination.Item
            key={i}
            active={i === currentPage}
            onClick={() => handlePageChange(i)}
          >
            {i}
          </Pagination.Item>
        );
      }
      
      if (currentPage < totalPages - 3) {
        items.push(<Pagination.Ellipsis key="end-ellipsis" />);
      }
      
      if (totalPages > 1) {
        items.push(
          <Pagination.Item
            key={totalPages}
            active={totalPages === currentPage}
            onClick={() => handlePageChange(totalPages)}
          >
            {totalPages}
          </Pagination.Item>
        );
      }
    }
    
    return items;
  };

  // Reset to first page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

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
    <div className="table-responsive-container">
      <div className="table-wrapper">
        <Table striped bordered hover ref={tableRef}>
          <thead className="table-header">
            <tr>
              {columns.map(column => (
                <th key={column.key}
                  onClick={() => column.sortable && requestSort(column.key)}>
                  <div 
                    className={`d-flex align-items-center ${column.sortable ? 'cursor-pointer' : ''}`}
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
          <tbody className="table-body-scroll">
            {paginatedData.length > 0 ? (
              paginatedData.map((row, index) => (
                <tr key={row.id || index}>
                  {columns.map(column => (
                    <td key={`${row.id || index}-${column.key}`}>
                      {formatCellValue(row[column.key], column.key,2)}
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
      </div>

      {/* Fixed totals row above pagination - using measured column widths */}
      {totals && columnWidths.length > 0 && (
        <div 
          style={{
            position: 'sticky',
            bottom: '40px',
            zIndex: 99,
            background: 'white',
            borderTop: '3px solid #dee2e6',
            borderBottom: '2px solid #dee2e6',
            display: 'flex',
            height: '36px'
          }}
        >
          {columns.map((column, index) => {
            // Determine what to display in each cell
            let cellContent = '';
            
            if (index === 0) {
              // First column always shows "TOTALS"
              cellContent = 'TOTALS';
            }else if (totals && column.key == 'name')
              cellContent = '';
             else if (totals && Object.prototype.hasOwnProperty.call(totals, column.key)) {
              // Show the total value if it exists for this column
              cellContent = formatCellValue(totals[column.key], column.key,2);
            }
            
            return (
              <div
                key={`totals-${column.key}`}
                style={{
                  width: `${columnWidths[index]}px`,
                  minWidth: `${columnWidths[index]}px`,
                  maxWidth: `${columnWidths[index]}px`,
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.875rem',
                  lineHeight: '1.3',
                  fontWeight: 'bold',
                  backgroundColor: '#e9ecef',
                  border: '1px solid #dee2e6',
                  borderLeft: index === 0 ? '1px solid #dee2e6' : 'none',
                  borderRight: index === columns.length - 1 ? '1px solid #dee2e6' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  boxSizing: 'border-box' // Ensure padding is included in width calculation
                }}
              >
                {cellContent}
              </div>
            );
          })}
        </div>
      )}

      <div className="sticky-pagination-footer">
        <div className="d-flex justify-content-between align-items-center bg-white border-top">
          <div className="d-flex align-items-center gap-2">
            <Form.Select
              style={{ width: '70px' }}
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            >
              {[50, 100, 200].map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </Form.Select>
            
            <Button 
              variant="outline-success" 
              size="sm" 
              onClick={exportToCSV}
              style={{ whiteSpace: 'nowrap' }}
            >
              Export Data
            </Button>
          </div>

          <div className="d-flex align-items-center gap-1">
            <Form onSubmit={handleManualPageSubmit} className="d-flex align-items-center gap-1">
              <span style={{ fontSize: '0.75rem', whiteSpace: 'nowrap', color: '#6c757d' }}>Go to:</span>
              <Form.Control
                type="number"
                min="1"
                max={totalPages}
                value={manualPageInput}
                onChange={(e) => setManualPageInput(e.target.value)}
                placeholder={currentPage.toString()}
                style={{ width: '50px' }}
              />
            </Form>
            
            <Pagination className="mb-0" size="sm">
              <Pagination.Prev 
                disabled={currentPage === 1} 
                onClick={() => handlePageChange(currentPage - 1)} 
              />
              {generatePaginationItems()}
              <Pagination.Next 
                disabled={currentPage === totalPages} 
                onClick={() => handlePageChange(currentPage + 1)} 
              />
            </Pagination>
          </div>
          
          <div style={{ fontSize: '0.75rem', color: '#6c757d', minWidth: '90px', textAlign: 'right' }}>
            {sortedData.length > 0 ? (
              <>
                {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, sortedData.length)} of {sortedData.length}
              </>
            ) : (
              'No data'
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainTable;