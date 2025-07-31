const rateLimit = require('express-rate-limit');

// In-memory storage for failed login attempts per IP
const failedAttempts = new Map();

// Configuration for lockout periods and thresholds
const LOCKOUT_CONFIG = {
  // Thresholds for different lockout levels
  LEVEL_1_THRESHOLD: 5,    // First lockout after 5 attempts
  LEVEL_2_THRESHOLD: 8,    // Second lockout after 3 more attempts (5+3=8)
  LEVEL_3_THRESHOLD: 13,   // Third lockout after 5 more attempts (8+5=13)
  
  // Lockout durations in milliseconds
  LEVEL_1_DURATION: 10 * 1000,      // 10 seconds
  LEVEL_2_DURATION: 30 * 1000,      // 30 seconds (same as level 1)
  LEVEL_3_DURATION: 60 * 1000,      // 1 minute
  
  // Reset attempts after successful login or after extended period
  RESET_AFTER_SUCCESS: true,
  RESET_AFTER_HOURS: 24,             // Reset attempts after 24 hours
  
  // Cleanup interval
  CLEANUP_INTERVAL: 15 * 60 * 1000   // Clean up old entries every 15 minutes
};

// Structure for tracking attempts per IP
class IPAttemptTracker {
  constructor() {
    this.attempts = 0;
    this.firstAttemptTime = Date.now();
    this.lastAttemptTime = Date.now();
    this.lockoutUntil = null;
    this.lockoutLevel = 0;
  }
  
  // Calculate current lockout duration based on attempt count
  getLockoutDuration() {
    if (this.attempts >= LOCKOUT_CONFIG.LEVEL_3_THRESHOLD) {
      return LOCKOUT_CONFIG.LEVEL_3_DURATION;
    } else if (this.attempts >= LOCKOUT_CONFIG.LEVEL_2_THRESHOLD) {
      return LOCKOUT_CONFIG.LEVEL_2_DURATION;
    } else if (this.attempts >= LOCKOUT_CONFIG.LEVEL_1_THRESHOLD) {
      return LOCKOUT_CONFIG.LEVEL_1_DURATION;
    }
    return 0;
  }
  
  // Check if IP is currently locked out
  isLockedOut() {
    if (!this.lockoutUntil) return false;
    return Date.now() < this.lockoutUntil;
  }
  
  // Get remaining lockout time in seconds
  getRemainingLockoutTime() {
    if (!this.isLockedOut()) return 0;
    return Math.ceil((this.lockoutUntil - Date.now()) / 1000);
  }
  
  // Record a failed attempt
  recordFailedAttempt() {
    this.attempts++;
    this.lastAttemptTime = Date.now();
    
    const lockoutDuration = this.getLockoutDuration();
    if (lockoutDuration > 0) {
      this.lockoutUntil = Date.now() + lockoutDuration;
      
      // Determine lockout level for logging
      if (this.attempts >= LOCKOUT_CONFIG.LEVEL_3_THRESHOLD) {
        this.lockoutLevel = 3;
      } else if (this.attempts >= LOCKOUT_CONFIG.LEVEL_2_THRESHOLD) {
        this.lockoutLevel = 2;
      } else {
        this.lockoutLevel = 1;
      }
    }
  }
  
  // Reset attempts (on successful login)
  reset() {
    this.attempts = 0;
    this.lockoutUntil = null;
    this.lockoutLevel = 0;
    this.firstAttemptTime = Date.now();
  }
  
  // Check if attempts should be reset due to age
  shouldResetDueToAge() {
    const hoursSinceFirst = (Date.now() - this.firstAttemptTime) / (1000 * 60 * 60);
    return hoursSinceFirst >= LOCKOUT_CONFIG.RESET_AFTER_HOURS;
  }
}

// Get client IP address (handles proxies)
function getClientIP(req) {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         req.headers['x-forwarded-for']?.split(',')[0] ||
         req.headers['x-real-ip'] ||
         'unknown';
}

// Middleware to check if IP is rate limited
const checkLoginRateLimit = (req, res, next) => {
  const clientIP = getClientIP(req);
  
  // Get or create attempt tracker for this IP
  let tracker = failedAttempts.get(clientIP);
  if (!tracker) {
    tracker = new IPAttemptTracker();
    failedAttempts.set(clientIP, tracker);
  }
  
  // Reset attempts if they're too old
  if (tracker.shouldResetDueToAge()) {
    console.log(`Resetting attempts for IP ${clientIP} due to age`);
    tracker.reset();
  }
  
  // Check if IP is currently locked out
  if (tracker.isLockedOut()) {
    const remainingTime = tracker.getRemainingLockoutTime();
    
    console.log(`🚫 Login attempt blocked for IP ${clientIP}: locked out for ${remainingTime} more seconds (Level ${tracker.lockoutLevel} lockout, ${tracker.attempts} total attempts)`);
    
    return res.status(429).json({
      error: 'Too many failed login attempts',
      message: `Account temporarily locked. Please try again in ${remainingTime} seconds.`,
      lockoutLevel: tracker.lockoutLevel,
      attemptsCount: tracker.attempts,
      remainingTime: remainingTime,
      retryAfter: remainingTime
    });
  }
  
  // Attach tracker to request for use in login controller
  req.attemptTracker = tracker;
  req.clientIP = clientIP;
  
  next();
};

// Function to record failed attempt (called from authController)
const recordFailedAttempt = (req) => {
  const tracker = req.attemptTracker;
  const clientIP = req.clientIP;
  
  if (tracker) {
    tracker.recordFailedAttempt();
    
    const lockoutTime = tracker.getRemainingLockoutTime();
    
    console.log(`❌ Failed login attempt #${tracker.attempts} from IP ${clientIP}`);
    
    if (lockoutTime > 0) {
      console.log(`🔒 IP ${clientIP} locked out for ${lockoutTime} seconds (Level ${tracker.lockoutLevel})`);
    }
    
    return {
      attempts: tracker.attempts,
      isLockedOut: tracker.isLockedOut(),
      lockoutTime: lockoutTime,
      lockoutLevel: tracker.lockoutLevel
    };
  }
  
  return null;
};

// Function to record successful attempt (called from authController)
const recordSuccessfulAttempt = (req) => {
  const tracker = req.attemptTracker;
  const clientIP = req.clientIP;
  
  if (tracker && LOCKOUT_CONFIG.RESET_AFTER_SUCCESS) {
    console.log(`✅ Successful login from IP ${clientIP}, resetting failed attempts (was ${tracker.attempts})`);
    tracker.reset();
  }
};

// Cleanup old entries periodically
const cleanupOldEntries = () => {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [ip, tracker] of failedAttempts.entries()) {
    // Remove entries that are old and not locked out
    const hoursSinceLastAttempt = (now - tracker.lastAttemptTime) / (1000 * 60 * 60);
    
    if (hoursSinceLastAttempt >= LOCKOUT_CONFIG.RESET_AFTER_HOURS && !tracker.isLockedOut()) {
      failedAttempts.delete(ip);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} old IP attempt records`);
  }
  
  console.log(`📊 Active IP tracking: ${failedAttempts.size} addresses`);
};

// Start cleanup interval
setInterval(cleanupOldEntries, LOCKOUT_CONFIG.CLEANUP_INTERVAL);

// Express rate limiter for additional protection (very permissive, just for extreme cases)
const expressRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 30, // 30 requests per minute per IP (very generous)
  message: {
    error: 'Too many requests',
    message: 'Please slow down your requests'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Function to get current statistics (for monitoring)
const getLoginAttemptStats = () => {
  const stats = {
    totalTrackedIPs: failedAttempts.size,
    currentlyLockedIPs: 0,
    totalFailedAttempts: 0,
    lockoutLevels: { level1: 0, level2: 0, level3: 0 },
    oldestEntry: null,
    newestEntry: null
  };
  
  let oldestTime = Date.now();
  let newestTime = 0;
  
  for (const [ip, tracker] of failedAttempts.entries()) {
    stats.totalFailedAttempts += tracker.attempts;
    
    if (tracker.isLockedOut()) {
      stats.currentlyLockedIPs++;
      stats.lockoutLevels[`level${tracker.lockoutLevel}`]++;
    }
    
    if (tracker.firstAttemptTime < oldestTime) {
      oldestTime = tracker.firstAttemptTime;
      stats.oldestEntry = { ip, time: new Date(oldestTime), attempts: tracker.attempts };
    }
    
    if (tracker.lastAttemptTime > newestTime) {
      newestTime = tracker.lastAttemptTime;
      stats.newestEntry = { ip, time: new Date(newestTime), attempts: tracker.attempts };
    }
  }
  
  return stats;
};

module.exports = {
  checkLoginRateLimit,
  recordFailedAttempt,
  recordSuccessfulAttempt,
  expressRateLimit,
  getLoginAttemptStats,
  cleanupOldEntries,
  LOCKOUT_CONFIG
};