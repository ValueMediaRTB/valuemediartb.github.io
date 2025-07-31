import React from 'react';
import { Container, Row, Col, Card } from 'react-bootstrap';

const HomePage = ({ onTrackerStatsView, onExternalAPIsView }) => {
  return (
    <div className="homepage-background">
      {/* Animated particles for extra visual interest */}
      <div className="homepage-particles"></div>
      
      <Container fluid className="h-100 d-flex flex-column position-relative">
        <Row className="flex-grow-1">
          <Col className="d-flex flex-column justify-content-center align-items-center">
            
            {/* Main content wrapper without background box */}
            <div className="homepage-content">
              
              {/* Header */}
              <div className="text-center mb-5">
                <div className="d-flex align-items-center justify-content-center mb-4">
                  <div style={{
                    width: '60px',
                    height: '60px',
                    marginRight: '16px',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    borderRadius: '16px',
                    boxShadow: '0 8px 25px rgba(102, 126, 234, 0.4)',
                    animation: 'float 6s ease-in-out infinite'
                  }}>
                    {/* Small indicator dot */}
                    <div style={{
                      position: 'absolute',
                      top: '12px',
                      right: '8px',
                      width: '7px',
                      height: '7px',
                      background: '#26de81',
                      borderRadius: '50%',
                      boxShadow: '0 0 8px rgba(38, 222, 129, 0.8)',
                      animation: 'pulse 2s infinite'
                    }}></div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'end',
                      gap: '4px',
                      height: '30px'
                    }}>
                      <div style={{ width: '5px', height: '12px', background: 'rgba(255, 255, 255, 0.9)', borderRadius: '3px' }}></div>
                      <div style={{ width: '5px', height: '20px', background: 'rgba(255, 255, 255, 0.9)', borderRadius: '3px' }}></div>
                      <div style={{ width: '5px', height: '26px', background: 'rgba(255, 255, 255, 0.9)', borderRadius: '3px' }}></div>
                      <div style={{ width: '5px', height: '18px', background: 'rgba(255, 255, 255, 0.9)', borderRadius: '3px' }}></div>
                      <div style={{ width: '5px', height: '22px', background: 'rgba(255, 255, 255, 0.9)', borderRadius: '3px' }}></div>
                    </div>
                  </div>
                  
                  <div>
                    <h1 style={{ 
                      fontWeight: '300', 
                      color: '#ffffffff', 
                      fontSize: '3.5rem',
                      marginBottom: '0.5rem',
                      textShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      letterSpacing: '-0.02em'
                    }}>
                      Welcome to
                    </h1>
                    <h1 style={{
                      fontWeight: '700',
                      fontSize: '3.5rem',
                      margin: 0,
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      letterSpacing: '-0.02em'
                    }}>
                      <span style={{
                        color: 'white',
                        background: 'none',
                        WebkitBackgroundClip: 'initial',
                        WebkitTextFillColor: 'white',
                        backgroundClip: 'initial'
                      }}>Traffic</span><span style={{ marginLeft: '8px' }}>Tools</span>
                    </h1>
                  </div>
                </div>
              </div>

              {/* Navigation Buttons */}
              <div className="d-flex flex-wrap justify-content-center gap-4 mt-5">
                <Card 
                  className="modern-card shadow-lg" 
                  style={{ 
                    width: '220px', 
                    cursor: 'pointer', 
                    overflow: 'hidden',
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)'
                  }} 
                  onClick={onTrackerStatsView}
                >
                  <Card.Body className="text-center p-4 position-relative">
                    <div className="card-icon" style={{
                      width: '56px',
                      height: '56px',
                      margin: '0 auto 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      borderRadius: '16px',
                      color: 'white',
                      fontSize: '28px',
                      transition: 'all 0.3s ease',
                      position: 'relative',
                      zIndex: 2,
                      boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)'
                    }}>
                      📊
                    </div>
                    <h5 className="card-title mb-2 position-relative" style={{ zIndex: 2, fontWeight: '600', color: '#2c3e50' }}>Reporting</h5>
                    <p className="card-text text-muted position-relative" style={{ zIndex: 2, fontSize: '0.9rem' }}>View traffic analytics and reports</p>
                    
                    {/* Animated background gradient */}
                    <div className="card-gradient-bg" style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'linear-gradient(135deg, #667eea15 0%, #764ba220 100%)',
                      opacity: 0,
                      transition: 'opacity 0.3s ease',
                      zIndex: 1
                    }}></div>
                  </Card.Body>
                </Card>

                <Card 
                  className="modern-card shadow-lg" 
                  style={{ 
                    width: '220px', 
                    cursor: 'pointer', 
                    overflow: 'hidden',
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)'
                  }}
                >
                  <Card.Body className="text-center p-4 position-relative">
                    <div className="card-icon" style={{
                      width: '56px',
                      height: '56px',
                      margin: '0 auto 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
                      borderRadius: '16px',
                      color: 'white',
                      fontSize: '28px',
                      transition: 'all 0.3s ease',
                      position: 'relative',
                      zIndex: 2,
                      boxShadow: '0 4px 15px rgba(40, 167, 69, 0.3)'
                    }}>
                      🎯
                    </div>
                    <h5 className="card-title mb-2 position-relative" style={{ zIndex: 2, fontWeight: '600', color: '#2c3e50' }}>Campaigns</h5>
                    <p className="card-text text-muted position-relative" style={{ zIndex: 2, fontSize: '0.9rem' }}>Manage your campaigns</p>
                    
                    {/* Animated background gradient */}
                    <div className="card-gradient-bg" style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'linear-gradient(135deg, #28a74515 0%, #20c99720 100%)',
                      opacity: 0,
                      transition: 'opacity 0.3s ease',
                      zIndex: 1
                    }}></div>
                  </Card.Body>
                </Card>

                <Card 
                  className="modern-card shadow-lg" 
                  style={{ 
                    width: '220px', 
                    cursor: 'pointer', 
                    overflow: 'hidden',
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)'
                  }} 
                  onClick={onExternalAPIsView}
                >
                  <Card.Body className="text-center p-4 position-relative">
                    <div className="card-icon" style={{
                      width: '56px',
                      height: '56px',
                      margin: '0 auto 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'linear-gradient(135deg, #fd7e14 0%, #e83e8c 100%)',
                      borderRadius: '16px',
                      color: 'white',
                      fontSize: '28px',
                      transition: 'all 0.3s ease',
                      position: 'relative',
                      zIndex: 2,
                      boxShadow: '0 4px 15px rgba(253, 126, 20, 0.3)'
                    }}>
                      🔗
                    </div>
                    <h5 className="card-title mb-2 position-relative" style={{ zIndex: 2, fontWeight: '600', color: '#2c3e50' }}>External APIs</h5>
                    <p className="card-text text-muted position-relative" style={{ zIndex: 2, fontSize: '0.9rem' }}>Integrate with external services</p>
                    
                    {/* Animated background gradient */}
                    <div className="card-gradient-bg" style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'linear-gradient(135deg, #fd7e1415 0%, #e83e8c20 100%)',
                      opacity: 0,
                      transition: 'opacity 0.3s ease',
                      zIndex: 1
                    }}></div>
                  </Card.Body>
                </Card>
              </div>
              
            </div>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default HomePage;