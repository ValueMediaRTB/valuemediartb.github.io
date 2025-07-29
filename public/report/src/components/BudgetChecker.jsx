import React, { useState, useEffect } from 'react';
import { Button, Table, Spinner } from 'react-bootstrap';
import {fetchTableData} from '../api.js'

const BudgetChecker = () => {
  const [budgetData, setBudgetData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const formatMoney = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const fetchBudgetData = async () => {
    setIsLoading(true);
    try {
        const {data:apiData,totals:apiTotals} = await fetchTableData("budget",{start:new Date(),end:new Date()},[{type:'suppliers',value:'All'}]);
        /*
      // Replace this with your actual API call
      // const response = await fetch('/api/budget-data');
      // const data = await response.json();
      
      // Mock data for demonstration
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API delay
      
      const mockData = [
        { supplierName: 'Google Ads', remainingBudget: 15420.50 },
        { supplierName: 'Facebook Ads', remainingBudget: 8750.25 },
        { supplierName: 'Microsoft Advertising', remainingBudget: 3200.00 },
        { supplierName: 'Twitter Ads', remainingBudget: -150.75 },
        { supplierName: 'LinkedIn Ads', remainingBudget: 12000.00 },
        { supplierName: 'TikTok Ads', remainingBudget: 5500.30 },
        { supplierName: 'Snapchat Ads', remainingBudget: 2750.80 }
      ];
      */
      setBudgetData(apiData);
    } catch (error) {
      console.error('Error fetching budget data:', error);
      setBudgetData([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBudgetData();
  }, []);

  const getBudgetStyle = (amount) => {
    if (amount < 0) {
      return { color: '#dc3545', fontWeight: '600' }; // Red for negative
    } else if (amount < 1000) {
      return { color: '#fd7e14', fontWeight: '600' }; // Orange for low budget
    } else {
      return { color: '#28a745', fontWeight: '600' }; // Green for good budget
    }
  };

  return (
    <div className="px-3 py-2">
      <div className="d-flex align-items-center mb-2 pb-2 border-bottom">
        <div 
          className="me-2 d-flex align-items-center justify-content-center"
          style={{
            width: '28px',
            height: '28px',
            background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
            borderRadius: '6px',
            color: 'white',
            fontSize: '16px',
            fontWeight: 'bold'
          }}
        >
          $
        </div>
        <h5 className="mb-0" style={{ color: '#495057', fontWeight: '600' }}>
          Budget Checker
        </h5>
      </div>
      
      {/* Button Row */}
      <div className="mb-1 pb-2 border-bottom">
        <Button 
          variant="primary"
          onClick={fetchBudgetData}
          disabled={isLoading}
          className="me-2"
        >
          {isLoading ? (
            <>
              <Spinner
                as="span"
                animation="border"
                size="sm"
                role="status"
                className="me-2"
              />
              Refreshing...
            </>
          ) : (
            <>
              Refresh
            </>
          )}
        </Button>
        {/* Future buttons will be added here */}
      </div>

      {/* Budget Table */}
      <div className="table-wrapper" id="budgetCheckerTable" style={{ 
        maxHeight: 'calc(100vh - 250px)',
        overflowY: 'auto'
      }}>
        <Table striped bordered hover className="mb-0">
          <thead className="table-header">
            <tr>
              <th style={{ 
                position: 'sticky',
                top: 0,
                backgroundColor: 'white',
                zIndex: 10,
                borderBottom: '2px solid #dee2e6'
              }}>
                Supplier Name
              </th>
              <th style={{ 
                position: 'sticky',
                top: 0,
                backgroundColor: 'white',
                zIndex: 10,
                textAlign: 'right',
                borderBottom: '2px solid #dee2e6'
              }}>
                Remaining Budget
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="2" className="text-center py-4">
                  <Spinner animation="border" size="sm" className="me-2" />
                  Loading budget data...
                </td>
              </tr>
            ) : budgetData.length > 0 ? (
              budgetData.map((item, index) => (
                <tr key={index}>
                  <td style={{ fontSize: '0.875rem' }}>
                    {item ? item.supplierName[0].toUpperCase() + item.supplierName.slice(1) : ''}
                  </td>
                  <td style={{ 
                    textAlign: 'right',
                    fontSize: '0.875rem',
                    ...getBudgetStyle(item.budgetRemaining)
                  }}>
                    {formatMoney(item.budgetRemaining)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="2" className="text-center py-4 text-muted">
                  <i className="bi bi-inbox me-2"></i>
                  No budget data available
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>

      {/* Summary Info */}
      {budgetData.length > 0 && !isLoading && (
        <div className="mt-3 p-2 bg-light rounded" style={{ fontSize: '0.875rem' }}>
          <div className="row text-center">
            <div className="col-md-4">
              <div className="fw-bold text-primary mb-1">Total Suppliers</div>
              <div className="fs-5">{budgetData.length}</div>
            </div>
            <div className="col-md-4">
              <div className="fw-bold text-success mb-1">Total Budget</div>
              <div className="fs-5">
                {formatMoney(budgetData.reduce((sum, item) => sum + Number(item.budgetRemaining), 0))}
              </div>
            </div>
            <div className="col-md-4">
              <div className="fw-bold text-warning mb-1">Low Budget Suppliers</div>
              <div className="fs-5">
                {budgetData.filter(item => item.remainingBudget < 1000 && item.remainingBudget >= 0).length}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BudgetChecker;