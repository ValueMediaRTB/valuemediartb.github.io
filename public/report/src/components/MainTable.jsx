import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Table, Pagination, Form, Button } from 'react-bootstrap';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import config from '../config';
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
  filters = [], 
  totals = null, 
  activeTab = '', 
  dateRange = null 
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [manualPageInput, setManualPageInput] = useState('');
  const tableRef = useRef(null);
  const [columnWidths, setColumnWidths] = useState([]);

  // DEBUG: Log totals information
  console.log('MainTable DEBUG - totals:', totals);
  console.log('MainTable DEBUG - totals type:', typeof totals);
  console.log('MainTable DEBUG - has totals data:', !!(totals && typeof totals === 'object' && Object.keys(totals).length > 0));

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

  // Enhanced column width measurement with better timing and reliability
  useEffect(() => {
    const measureColumnWidths = () => {
      if (!tableRef.current || columns.length === 0) return;
      
      // Find all header cells
      const headerCells = tableRef.current.querySelectorAll('thead th');
      if (headerCells.length === 0) return;
      
      // Measure each column width more accurately
      const widths = Array.from(headerCells).map((cell, index) => {
        const rect = cell.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(cell);
        
        // Get the full width including padding and borders
        const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
        const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
        const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0;
        const borderRight = parseFloat(computedStyle.borderRightWidth) || 0;
        
        const totalWidth = rect.width;
        
        console.log(`Column ${index} (${columns[index]?.key}): ${totalWidth}px`);
        return Math.round(totalWidth);
      });
      
      // Only update if we have valid measurements and they've changed
      if (widths.length === columns.length && widths.every(w => w > 0)) {
        setColumnWidths(prevWidths => {
          const hasChanged = prevWidths.length !== widths.length || 
                           prevWidths.some((w, i) => Math.abs(w - widths[i]) > 1);
          
          if (hasChanged) {
            console.log('Column widths updated:', widths);
            return widths;
          }
          return prevWidths;
        });
      }
    };

    // Multiple measurement attempts with different timings to ensure accuracy
    const timeouts = [
      setTimeout(measureColumnWidths, 10),   // Very quick first attempt
      setTimeout(measureColumnWidths, 50),   // Early measurement
      setTimeout(measureColumnWidths, 150),  // After render settles
      setTimeout(measureColumnWidths, 300),  // Fallback measurement
      setTimeout(measureColumnWidths, 600)   // Final fallback
    ];

    // Also measure on window resize
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      const resizeTimeout = setTimeout(measureColumnWidths, 100);
    };
    
    window.addEventListener('resize', handleResize);

    // Cleanup function
    return () => {
      timeouts.forEach(clearTimeout);
      window.removeEventListener('resize', handleResize);
    };
  }, [columns, paginatedData, activeTab, data.length]); // Include activeTab and data.length as dependencies

  // Force re-measurement when tab changes or data structure changes significantly
  useEffect(() => {
    const timer = setTimeout(() => {
      if (tableRef.current && columns.length > 0) {
        const headerCells = tableRef.current.querySelectorAll('thead th');
        if (headerCells.length > 0) {
          const widths = Array.from(headerCells).map(cell => {
            return Math.round(cell.getBoundingClientRect().width);
          });
          setColumnWidths(widths);
          console.log('Force-measured column widths for tab change:', widths);
        }
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [activeTab]);

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

  const exportToXLSX = () => {
    // Generate filename components
    const reportId = config.reportId;
    const tabOrGroupName = activeTab || 'data';
    
    // Format date range
    let timePeriod = '';
    if (dateRange && dateRange.start && dateRange.end) {
      const startDate = format(dateRange.start, 'yyyy-MM-dd');
      const endDate = format(dateRange.end, 'yyyy-MM-dd');
      timePeriod = startDate === endDate ? startDate : `${startDate}_to_${endDate}`;
    } else {
      timePeriod = format(new Date(), 'yyyy-MM-dd');
    }
    
    // Format current filters
    let currentFilters = '';
    if (filters && filters.length > 0) {
      const filterStrings = filters.map(filter => {
        const operator = filter.operator && filter.operator !== '=' ? filter.operator : '';
        const value = String(filter.value).replace(/[^a-zA-Z0-9]/g, ''); // Remove special characters
        return `${filter.type}${operator}${value}`;
      });
      currentFilters = '_' + filterStrings.join('_');
    }
    
    // Construct filename
    const filename = `report_${reportId}_${tabOrGroupName}_${timePeriod}${currentFilters}.xlsx`;
    
    // Prepare data for export
    const exportData = filteredData.map(row => {
      const exportRow = {};
      columns.forEach(col => {
        let value = row[col.key];
        
        // Format values for export (remove currency symbols and percentages for cleaner data)
        if (typeof value === 'number') {
          if (['cost', 'profit', 'revenue', 'cpc', 'epc'].includes(col.key)) {
            exportRow[col.label] = value; // Keep as number for Excel
          } else if (['roi'].includes(col.key)) {
            exportRow[col.label] = value; // Keep as number, Excel can format as percentage
          } else if (['cr'].includes(col.key)) {
            exportRow[col.label] = value;
          } else {
            exportRow[col.label] = value;
          }
        } else {
          exportRow[col.label] = value;
        }
      });
      return exportRow;
    });
    
    // Add totals row if available
    if (totals && typeof totals === 'object' && Object.keys(totals).length > 0) {
      const totalsRow = {};
      columns.forEach(col => {
        if (col.key === 'name' || columns.indexOf(col) === 0) {
          totalsRow[col.label] = 'TOTALS';
        } else if (totals[col.key] !== undefined) {
          totalsRow[col.label] = totals[col.key];
        } else {
          totalsRow[col.label] = '';
        }
      });
      exportData.push(totalsRow);
    }
    
    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // Auto-size columns
    const colWidths = columns.map(col => ({
      wch: Math.max(col.label.length, 15) // Minimum width of 15 characters
    }));
    worksheet['!cols'] = colWidths;
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, activeTab || 'Data');
    
    // Save file
    XLSX.writeFile(workbook, filename);
    config.reportId += 1;
  };

  const formatCellValue = (value, key, precision) => {
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

  const getRoiCellStyle = (value, key) => {
    if (key === 'roi' && typeof value === 'number') {
      if (value < 0) {
        return { backgroundColor: '#ffebee', color: '#c62828' }; // Light red background, dark red text
      } else if (value >= 0 && value < 100) {
        return { backgroundColor: '#fff3e0', color: '#ef6c00' }; // Light orange background, dark orange text
      } else if (value >= 100 && value < 300) {
        return { backgroundColor: '#e8f5e8', color: '#2e7d32' }; // Light green background, dark green text
      } else if (value >= 300) {
        return { backgroundColor: '#c8e6c9', color: '#1b5e20' }; // Medium green background, darker green text
      }
    }
    return {};
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

  // Check if we should render totals
  const shouldRenderTotals = totals && typeof totals === 'object' && Object.keys(totals).length > 0;
  console.log('Should render totals:', shouldRenderTotals);

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
                    <td key={`${row.id || index}-${column.key}`} style={getRoiCellStyle(row[column.key], column.key)}>
                      {formatCellValue(row[column.key], column.key, 2)}
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
          {shouldRenderTotals && (
  <tfoot>
    <tr>
      {columns.map((column, index) => {
        let cellContent = '';

        if (index === 0) {
          cellContent = 'TOTALS';
        } else if (column.key === 'name') {
          cellContent = '';
        } else if (Object.prototype.hasOwnProperty.call(totals, column.key)) {
          cellContent = formatCellValue(totals[column.key], column.key, 2);
        }

        return (
          <td
            key={`totals-${column.key}`}
            style={{
              fontWeight: 'bold',
              backgroundColor: '#e9ecef',
              position: 'sticky',
              bottom: 0, // adjust if your pagination/footer height changes
              zIndex: 3,
              borderTop: '3px solid #dee2e6'
            }}
          >
            {cellContent}
          </td>
        );
      })}
    </tr>
  </tfoot>
)}
        </Table>
      </div>

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
              onClick={exportToXLSX}
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