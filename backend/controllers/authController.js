const dataController = require('./dataController');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { recordFailedAttempt, recordSuccessfulAttempt } = require('../middleware/rateLimiter');

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId, timestamp: Date.now() },
    process.env.JWT_SECRET || '7yH05"bif@Xkvh8;d£B?e|xFU]81qnN@',
    { expiresIn: '24h' }
  );
};

// Verify and refresh token
const verifyAndRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || '7yH05"bif@Xkvh8;d£B?e|xFU]81qnN@');
    
    // Generate new token to extend session
    const newToken = generateToken(decoded.userId);
    
    return {
      valid: true,
      userId: decoded.userId,
      newToken
    };
  } catch (error) {
    return { valid: false };
  }
};

// Enhanced login with spam protection
const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      // Record failed attempt for missing credentials
      const attemptInfo = recordFailedAttempt(req);
      
      return res.status(400).json({ 
        error: 'Please provide username and password',
        attempts: attemptInfo?.attempts,
        lockoutInfo: attemptInfo?.isLockedOut ? {
          duration: attemptInfo.lockoutTime,
          level: attemptInfo.lockoutLevel
        } : null
      });
    }
    
    if (await dataController.isDBConnected()) {
      // Find user by username
      const user = await User.findOne({
        username: username,
        isActive: true
      });
      
      if (!user) {
        // Record failed attempt for invalid username
        const attemptInfo = recordFailedAttempt(req);
        
        console.log(`🔍 Login attempt with invalid username: "${username}" from IP ${req.clientIP}`);
        
        return res.status(401).json({ 
          error: 'Invalid credentials',
          attempts: attemptInfo?.attempts,
          lockoutInfo: attemptInfo?.isLockedOut ? {
            duration: attemptInfo.lockoutTime,
            level: attemptInfo.lockoutLevel,
            message: `Too many failed attempts. Account locked for ${attemptInfo.lockoutTime} seconds.`
          } : null
        });
      }
      
      // Check password
      const isValidPassword = await user.comparePassword(password);
      
      if (!isValidPassword) {
        // Record failed attempt for invalid password
        const attemptInfo = recordFailedAttempt(req);
        
        console.log(`🔐 Login attempt with invalid password for user "${username}" from IP ${req.clientIP} (attempt #${attemptInfo?.attempts})`);
        
        return res.status(401).json({ 
          error: 'Invalid credentials',
          attempts: attemptInfo?.attempts,
          lockoutInfo: attemptInfo?.isLockedOut ? {
            duration: attemptInfo.lockoutTime,
            level: attemptInfo.lockoutLevel,
            message: `Too many failed attempts. Account locked for ${attemptInfo.lockoutTime} seconds.`
          } : null
        });
      }
      
      // Successful login - reset attempts for this IP
      recordSuccessfulAttempt(req);
      
      // Generate token
      const token = generateToken(user._id);
      
      // Update last login
      await user.updateLastLogin();
      
      console.log(`✅ Successful login for user "${username}" from IP ${req.clientIP}`);
      
      res.json({
        message: 'Login successful',
        token,
        user: user.toJSON()
      });
      
    } else {
      // Database connection issue
      console.error(`❌ Database connection failed during login attempt from IP ${req.clientIP}`);
      res.status(503).json({ 
        error: "Database connection failed",
        message: "Unable to connect to database. Please try again later."
      });
    }
    
  } catch (error) {
    console.error('Login error:', error);
    
    // Record failed attempt for server errors too (prevents abuse)
    recordFailedAttempt(req);
    
    res.status(500).json({ 
      error: 'Login failed due to server error',
      message: 'An internal error occurred. Please try again later.'
    });
  }
};

// Logout user (unchanged)
const logout = async (req, res) => {
  res.json({ message: 'Logout successful' });
};

// Get current user (unchanged)
const getCurrentUser = async (req, res) => {
  try {
    if (await dataController.isDBConnected()) {
      const user = await User.findById(req.userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }    
      res.json({ user });
    } else {
      res.status(503).json({ 
        error: "Database connection failed",
        message: "Could not connect to database"
      });
    }
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to get user information' });
  }
};

// Refresh token (unchanged)
const refreshToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const result = verifyAndRefreshToken(token);
    
    if (!result.valid) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    res.json({ 
      token: result.newToken,
      message: 'Token refreshed successfully' 
    });
    
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
};

// Change password (unchanged)
const changePassword = async (req, res) => {
  try {
    if (await dataController.isDBConnected()) {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Please provide current and new password' });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters long' });
      }
      
      const user = await User.findById(req.userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Verify current password
      const isValid = await user.comparePassword(currentPassword);
      
      if (!isValid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      
      // Update password
      user.password = newPassword;
      await user.save();
      
      // Generate new token
      const token = generateToken(user._id);
      
      res.json({ 
        message: 'Password changed successfully',
        token 
      });
    } else {
      res.status(503).json({
        error: "Database connection failed",
        message: "Could not connect to database"
      });
    }
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

module.exports = {
  login,
  logout,
  getCurrentUser,
  refreshToken,
  changePassword,
  verifyAndRefreshToken
};