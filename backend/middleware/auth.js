const jwt = require('jsonwebtoken');
const { verifyAndRefreshToken } = require('../controllers/authController');

// Middleware to protect routes
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const result = verifyAndRefreshToken(token);
    if (!result.valid) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    // Attach user ID to request
    req.userId = result.userId;
    // Send new token in response header for automatic refresh
    res.setHeader('X-New-Token', result.newToken);
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Middleware to check if user is admin
const requireAdmin = async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Authorization check failed' });
  }
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const result = verifyAndRefreshToken(token);
      if (result.valid) {
        req.userId = result.userId;
        res.setHeader('X-New-Token', result.newToken);
      }
    }
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

module.exports = {
  authenticate,
  requireAdmin,
  optionalAuth
};