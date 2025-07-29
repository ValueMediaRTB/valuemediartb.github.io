// middleware/cache.js
const { client: redisClient } = require('../config/redis');

const cacheMiddleware = (duration) => {
  return async (req, res, next) => {
    const key = `express:${req.originalUrl}`;
    
    try {
      const cachedData = await redisClient.get(key);
      if (cachedData) {
        return res.send(JSON.parse(cachedData));
      }
      
      // Override res.send to cache the response
      const originalSend = res.send;
      res.send = function(body) {
        if (res.statusCode === 200) {
          redisClient.setEx(key, duration, JSON.stringify(body));
        }
        originalSend.call(this, body);
      };
      
      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
};

module.exports = cacheMiddleware;