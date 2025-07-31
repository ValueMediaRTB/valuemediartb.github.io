import React, { useState } from 'react';
import { Container, Row, Col, Button, Card } from 'react-bootstrap';
import AdPumpPage from './external_apis/AdPumpPage';
import DaisyconPage from './external_apis/DaisyconPage';
import EclicklinkPage from './external_apis/EclicklinkPage'; 
import KwankoPage from './external_apis/KwankoPage';
import PartnerBoostPage from './external_apis/PartnerBoostPage'; 
import TradeTrackerPage from './external_apis/TradeTrackerPage';
import ConvertSocialPage from './external_apis/ConvertSocialPage';

const ExternalAPIsPage = ({ onHomeView }) => {
  const [currentAPI, setCurrentAPI] = useState(null);

  const apis = [
    { id: 'adpump', name: 'Adpump', component: AdPumpPage },
    { id: 'daisycon', name: 'Daisycon', component: DaisyconPage },
    { id: 'eclicklink', name: 'EClickLink', component: EclicklinkPage },
    { id: 'kwanko', name: 'Kwanko', component: KwankoPage },
    { id: 'partnerboost', name: 'PartnerBoost', component: PartnerBoostPage },
    { id: 'tradetracker', name: 'TradeTracker', component: TradeTrackerPage },
    // { id: 'convertsocial', name: 'ConvertSocial', component: ConvertSocialPage }
  ];

  if (currentAPI) {
    const CurrentComponent = apis.find(api => api.id === currentAPI)?.component;
    return CurrentComponent ? (
      <CurrentComponent onBack={() => setCurrentAPI(null)} />
    ) : null;
  }

  return (
    <Container fluid className="h-100 d-flex flex-column p-4">
      {/* Header */}
      <Row className="mb-4">
        <Col>
          <div className="d-flex align-items-center">
            <h3 className="mb-0" style={{ margin: '8px' }}>External APIs</h3>
          </div>
          <div className="mt-2">
            <Button 
              variant="outline-primary" 
              onClick={onHomeView}
              style={{ margin: '8px' }}
            >
              Home
            </Button>
          </div>
        </Col>
      </Row>

      {/* API Grid */}
      <Row>
        <Col>
          <div className="d-flex flex-wrap gap-3">
            {apis.map((api) => (
              <Card 
                key={api.id}
                className="shadow-sm modern-card" 
                style={{ width: '200px', cursor: 'pointer' }}
                onClick={() => setCurrentAPI(api.id)}
              >
                <Card.Body className="text-center p-4">
                  <div style={{
                    width: '48px',
                    height: '48px',
                    margin: '0 auto 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    borderRadius: '12px',
                    color: 'white',
                    fontSize: '24px'
                  }}>
                    🔗
                  </div>
                  <h5 className="card-title mb-0">{api.name}</h5>
                </Card.Body>
              </Card>
            ))}
          </div>
        </Col>
      </Row>
    </Container>
  );
};

export default ExternalAPIsPage;