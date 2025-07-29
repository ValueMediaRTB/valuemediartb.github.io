import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Table, Pagination, Form, Button, Spinner } from 'react-bootstrap';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import config from '../config';
import './MainTable.css';

const MainTable = ({ 
  serverPageData = [], 
  columns = [],   
  sortConfig,
  onSort,
  pageSize: initialPageSize = 50,
  onPageSizeChange,
  isLoading,
  filters = [], 
  totals = null, 
  activeTab = '', 
  dateRange = null,
  serverPaginationInfo = {},
  onServerPageRequest,
  dataVersion = 0,
  stickyHeader,
  stickyPagination
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [manualPageInput, setManualPageInput] = useState('');
  const [requestedPage, setRequestedPage] = useState(null); // Track the page we're trying to navigate to
  const tableRef = useRef(null);
  const [columnWidths, setColumnWidths] = useState([]);

  const {
    currentServerPage = 1,
    totalServerPages = 1,
    totalRecords = 0,
    isPaginated = false,
    sessionId = null
  } = serverPaginationInfo;

  // Reset to page 1 only when filters or sort changes, not when server page data changes
  useEffect(() => {
    setCurrentPage(1);
    setRequestedPage(null);
  }, [filters, sortConfig]);

  // Calculate total pages based on total records and page size
  const totalPages = useMemo(() => {
    if (!isPaginated) {
      return Math.ceil(serverPageData.length / pageSize) || 1;
    }
    // For paginated data, calculate based on total records
    return Math.ceil(totalRecords / pageSize) || 1;
  }, [isPaginated, totalRecords, serverPageData.length, pageSize]);

  // Calculate which server page contains a specific record
  const getServerPageForRecord = (recordIndex) => {
    if (!isPaginated) return 1;
    
    // Calculate records per server page based on actual data
    const recordsPerServerPage = Math.ceil(totalRecords / totalServerPages);
    return Math.floor(recordIndex / recordsPerServerPage) + 1;
  };

  // When server page changes and we have a requested page, navigate to it
  useEffect(() => {
    if (requestedPage && serverPageData.length > 0) {
      const globalStartIndex = (requestedPage - 1) * pageSize;
      const neededServerPage = getServerPageForRecord(globalStartIndex);
      
      console.log(`Checking if we can navigate to requested page ${requestedPage}. Needed server page: ${neededServerPage}, Current server page: ${currentServerPage}`);
      
      if (neededServerPage === currentServerPage) {
        // We now have the correct server page, update current page
        console.log(`Server page matches! Navigating to page ${requestedPage}`);
        setCurrentPage(requestedPage);
        setRequestedPage(null);
      }
    }
  }, [serverPageData, currentServerPage, requestedPage, pageSize, totalRecords, totalServerPages, isPaginated]);

  // Add a backup effect that triggers on currentServerPage change
  useEffect(() => {
    if (requestedPage && currentServerPage > 0) {
      const globalStartIndex = (requestedPage - 1) * pageSize;
      const neededServerPage = getServerPageForRecord(globalStartIndex);
      
      if (neededServerPage === currentServerPage && serverPageData.length > 0) {
        console.log(`Server page changed to ${currentServerPage}, navigating to requested page ${requestedPage}`);
        setCurrentPage(requestedPage);
        setRequestedPage(null);
      }
    }
  }, [currentServerPage]);

  // Get current page data from server page
  const paginatedData = useMemo(() => {
    if (!isPaginated) {
      // For non-paginated data, simple slice
      const startIndex = (currentPage - 1) * pageSize;
      return serverPageData.slice(startIndex, startIndex + pageSize);
    }

    // For paginated data, calculate if we have the right server page
    const globalStartIndex = (currentPage - 1) * pageSize;
    const neededServerPage = getServerPageForRecord(globalStartIndex);
    
    // If we don't have the right server page, return empty
    if (neededServerPage !== currentServerPage) {
      console.log(`Waiting for server page ${neededServerPage}, current is ${currentServerPage}`);
      return [];
    }
    
    // Calculate the offset within the current server page
    const recordsPerServerPage = Math.ceil(totalRecords / totalServerPages);
    const serverPageStartIndex = (currentServerPage - 1) * recordsPerServerPage;
    const localStartIndex = globalStartIndex - serverPageStartIndex;
    const localEndIndex = Math.min(localStartIndex + pageSize, serverPageData.length);
    
    // Ensure indices are valid
    if (localStartIndex < 0 || localStartIndex >= serverPageData.length) {
      console.warn(`Invalid local indices: start=${localStartIndex}, serverPageData.length=${serverPageData.length}`);
      return [];
    }
    
    return serverPageData.slice(localStartIndex, localEndIndex);
  }, [
    serverPageData, 
    currentPage, 
    pageSize, 
    isPaginated, 
    totalRecords, 
    totalServerPages, 
    currentServerPage
  ]);

  // Enhanced column width measurement
  useEffect(() => {
    const measureColumnWidths = () => {
      if (!tableRef.current || columns.length === 0) return;
      
      const headerCells = tableRef.current.querySelectorAll('thead th');
      if (headerCells.length === 0) return;
      
      const widths = Array.from(headerCells).map((cell) => {
        const rect = cell.getBoundingClientRect();
        return Math.round(rect.width);
      });
      
      if (widths.length === columns.length && widths.every(w => w > 0)) {
        setColumnWidths(widths);
      }
    };

    const timeouts = [
      setTimeout(measureColumnWidths, 10),
      setTimeout(measureColumnWidths, 50),
      setTimeout(measureColumnWidths, 150),
      setTimeout(measureColumnWidths, 300)
    ];

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [columns, paginatedData, activeTab, serverPageData.length]);

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
      console.log(`Changing to page ${page} of ${totalPages}`);
      
      // For paginated data, check if we need a different server page
      if (isPaginated) {
        const globalStartIndex = (page - 1) * pageSize;
        const neededServerPage = getServerPageForRecord(globalStartIndex);
        
        console.log(`Page ${page} needs server page ${neededServerPage}, current server page is ${currentServerPage}`);
        
        if (neededServerPage !== currentServerPage) {
          // We need to fetch a different server page
          console.log(`Requesting server page ${neededServerPage}`);
          setRequestedPage(page);
          
          // Directly request the server page
          if (onServerPageRequest && neededServerPage <= totalServerPages) {
            onServerPageRequest(neededServerPage);
          }
        } else {
          // We have the data, just update the page
          setCurrentPage(page);
        }
      } else {
        // Non-paginated, just update the page
        setCurrentPage(page);
      }
      
      setManualPageInput('');
    }
  };

  const handleManualPageSubmit = (e) => {
    e.preventDefault();
    const page = parseInt(manualPageInput);
    
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      handlePageChange(page);
    } else {
      setManualPageInput('');
      if (!isNaN(page)) {
        alert(`Page must be between 1 and ${totalPages}`);
      }
    }
  };

  const exportToXLSX = async () => {
    const reportId = config.reportId;
    const tabOrGroupName = activeTab || 'data';
    
    let timePeriod = '';
    if (dateRange && dateRange.start && dateRange.end) {
      const startDate = format(dateRange.start, 'yyyy-MM-dd');
      const endDate = format(dateRange.end, 'yyyy-MM-dd');
      timePeriod = startDate === endDate ? startDate : `${startDate}_to_${endDate}`;
    } else {
      timePeriod = format(new Date(), 'yyyy-MM-dd');
    }
    
    let currentFilters = '';
    if (filters && filters.length > 0) {
      const filterStrings = filters.map(filter => {
        const operator = filter.operator && filter.operator !== '=' ? filter.operator : '';
        const value = String(filter.value).replace(/[^a-zA-Z0-9]/g, '');
        return `${filter.type}${operator}${value}`;
      });
      currentFilters = '_' + filterStrings.join('_');
    }
    
    const filename = `report_${reportId}_${tabOrGroupName}_${timePeriod}${currentFilters}.xlsx`;
    
    // Note: This will only export the current server page data
    const exportData = serverPageData.map(row => {
      const exportRow = {};
      columns.forEach(col => {
        let value = row[col.key];
        exportRow[col.label] = value;
      });
      return exportRow;
    });
    
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
    
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    const colWidths = columns.map(col => ({
      wch: Math.max(col.label.length, 15)
    }));
    worksheet['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(workbook, worksheet, activeTab || 'Data');
    XLSX.writeFile(workbook, filename);
    config.reportId += 1;
  };

  const formatCellValue = (value, key, precision) => {
    if (typeof value === 'number') {
      if (['cost', 'profit', 'revenue'].includes(key)) {
        return `${value.toLocaleString('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision })}`;
      }
      if (['cr'].includes(key)) {
        return value.toLocaleString('en-US', { minimumFractionDigits: 7, maximumFractionDigits: 7 });
      }
      if (['cpc','epc'].includes(key)) {
        return `${value.toLocaleString('en-US', { minimumFractionDigits: 7, maximumFractionDigits: 7 })}`;
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
        return { backgroundColor: '#ffebee', color: '#c62828' };
      } else if (value >= 0 && value < 100) {
        return { backgroundColor: '#fff3e0', color: '#ef6c00' };
      } else if (value >= 100 && value < 300) {
        return { backgroundColor: '#e8f5e8', color: '#2e7d32' };
      } else if (value >= 300) {
        return { backgroundColor: '#c8e6c9', color: '#1b5e20' };
      }
    }
    return {};
  };

  const generatePaginationItems = () => {
    const items = [];
    const maxVisible = 5;
    
    if (totalPages <= 0) return items;
    
    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) {
        items.push(
          <Pagination.Item
            key={i}
            active={i === currentPage}
            onClick={() => handlePageChange(i)}
            disabled={isLoading}
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
          disabled={isLoading}
        >
          1
        </Pagination.Item>
      );
      
      if (currentPage > 4) {
        items.push(<Pagination.Ellipsis key="start-ellipsis" disabled={isLoading} />);
      }
      
      const start = Math.max(2, Math.min(currentPage - 1, totalPages - 3));
      const end = Math.min(totalPages - 1, Math.max(currentPage + 1, 4));
      
      for (let i = start; i <= end; i++) {
        items.push(
          <Pagination.Item
            key={i}
            active={i === currentPage}
            onClick={() => handlePageChange(i)}
            disabled={isLoading}
          >
            {i}
          </Pagination.Item>
        );
      }
      
      if (currentPage < totalPages - 3) {
        items.push(<Pagination.Ellipsis key="end-ellipsis" disabled={isLoading} />);
      }
      
      if (totalPages > 1) {
        items.push(
          <Pagination.Item
            key={totalPages}
            active={totalPages === currentPage}
            onClick={() => handlePageChange(totalPages)}
            disabled={isLoading}
          >
            {totalPages}
          </Pagination.Item>
        );
      }
    }
    
    return items;
  };

  // Check if we should render totals
  const shouldRenderTotals = totals && typeof totals === 'object' && Object.keys(totals).length > 0;

  // Calculate display range
  const startRecord = isPaginated 
    ? (currentPage - 1) * pageSize + 1
    : Math.min((currentPage - 1) * pageSize + 1, serverPageData.length);
  
  const endRecord = isPaginated
    ? Math.min(currentPage * pageSize, totalRecords)
    : Math.min(currentPage * pageSize, serverPageData.length);

  // Show loading when we're waiting for a new server page
  const isWaitingForServerPage = requestedPage !== null && paginatedData.length === 0;

  if (isLoading || isWaitingForServerPage) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        {isPaginated && (
          <div className="mt-2">
            {isWaitingForServerPage 
              ? `Loading data for page ${requestedPage}...`
              : `Loading server page ${currentServerPage} of ${totalServerPages}...`
            }
          </div>
        )}
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
                <tr key={row.id || `${currentPage}-${index}`}>
                  {columns.map(column => (
                    <td key={`${row.id || `${currentPage}-${index}`}-${column.key}`} 
                        style={getRoiCellStyle(row[column.key], column.key)}>
                      {formatCellValue(row[column.key], column.key, 2)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="text-center py-4">
                  {isLoading ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" />
                      Loading data...
                    </>
                  ) : (
                    'No data available'
                  )}
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
                        bottom: 0,
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
              disabled={isLoading}
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
              disabled={isLoading}
            >
              Export Data
            </Button>
            
            {isPaginated && (
              <small className="text-muted ms-2">
                Server page {currentServerPage}/{totalServerPages}
                {sessionId && ` (Session: ${sessionId.slice(-8)})`}
              </small>
            )}
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
                disabled={isLoading}
              />
            </Form>
            
            <Pagination className="mb-0" size="sm">
              <Pagination.Prev 
                disabled={currentPage === 1 || isLoading} 
                onClick={() => handlePageChange(currentPage - 1)} 
              />
              {generatePaginationItems()}
              <Pagination.Next 
                disabled={currentPage === totalPages || isLoading} 
                onClick={() => handlePageChange(currentPage + 1)} 
              />
            </Pagination>
          </div>
          
          <div style={{ fontSize: '0.75rem', color: '#6c757d', minWidth: '120px', textAlign: 'right' }}>
            {isPaginated ? (
              <>
                {startRecord}-{endRecord} of {totalRecords}
              </>
            ) : serverPageData.length > 0 ? (
              <>
                {startRecord}-{endRecord} of {serverPageData.length}
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