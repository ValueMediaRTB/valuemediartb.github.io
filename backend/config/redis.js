// config/redis.js
const redis = require('redis');
const { promisify } = require('util');

class RedisClient {
  constructor() {
    this.client = null;
    this.connected = false;
    this.connecting = false;
    this.connectionPromise = null;
    
    // Connection retry configuration
    this.maxRetries = 3;
    this.retryDelay = 1000;
    this.reconnectTimeout = null;
  }

  async connect() {
    // If already connected, return existing client
    if (this.connected && this.client && this.client.isOpen) {
      return this.client;
    }
    
    // If connection is in progress, wait for it
    if (this.connecting && this.connectionPromise) {
      return this.connectionPromise;
    }
    
    // Start new connection
    this.connecting = true;
    
    this.connectionPromise = this._establishConnection();
    
    try {
      await this.connectionPromise;
      return this.client;
    } catch (error) {
      this.connecting = false;
      this.connectionPromise = null;
      throw error;
    }
  }

  async _establishConnection() {
    try {
      // Create new client if needed
      if (!this.client) {
        this.client = redis.createClient({
          url: process.env.REDIS_URI,
          socket: {
            connectTimeout: 5000,
            reconnectStrategy: (retries) => {
              if (retries > this.maxRetries) {
                console.error('Max Redis reconnection attempts reached');
                return false;
              }
              return Math.min(retries * this.retryDelay, 3000);
            }
          }
        });
        
        // Set up event handlers
        this.client.on('error', (err) => {
          console.error('Redis Client Error:', err);
          this.connected = false;
        });
        
        this.client.on('ready', () => {
          console.log('Redis connection ready');
          this.connected = true;
          this.connecting = false;
        });
        
        this.client.on('end', () => {
          console.log('Redis connection closed');
          this.connected = false;
        });
        
        this.client.on('reconnecting', () => {
          console.log('Redis reconnecting...');
          this.connecting = true;
        });
      }
      
      // Connect if not already connected
      if (!this.client.isOpen) {
        await this.client.connect();
        console.log('Redis Connected...');
      }
      
      this.connected = true;
      this.connecting = false;
      
      return this.client;
      
    } catch (error) {
      console.error('Redis connection failed:', error);
      this.connected = false;
      this.connecting = false;
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      try {
        await this.client.quit();
        this.client = null;
        this.connected = false;
        this.connecting = false;
        console.log('Redis disconnected');
      } catch (error) {
        console.error('Error disconnecting Redis:', error);
      }
    }
  }

  async get(key) {
    const client = await this.connect();
    return client.get(key);
  }

  async set(key, value, ttl) {
    const client = await this.connect();
    return ttl ? client.setEx(key, ttl, value) : client.set(key, value);
  }

  async del(key) {
    const client = await this.connect();
    return client.del(key);
  }

  async exists(key) {
    const client = await this.connect();
    return client.exists(key);
  }

  async keys(pattern) {
    const client = await this.connect();
    return client.keys(pattern);
  }

  async flush() {
    const client = await this.connect();
    return client.flushDb();
  }

  async multi() {
    const client = await this.connect();
    return client.multi();
  }

  async hSet(key, field, value) {
    const client = await this.connect();
    if (typeof field === 'object') {
      // Handle multiple fields
      return client.hSet(key, field);
    }
    return client.hSet(key, field, value);
  }

  async hGetAll(key) {
    const client = await this.connect();
    return client.hGetAll(key);
  }

  async expire(key, seconds) {
    const client = await this.connect();
    return client.expire(key, seconds);
  }

  async zAdd(key, members) {
    const client = await this.connect();
    return client.zAdd(key, members);
  }

  async zRem(key, member) {
    const client = await this.connect();
    return client.zRem(key, member);
  }

  async zRange(key, start, stop) {
    const client = await this.connect();
    return client.zRange(key, start, stop);
  }

  async zRangeByScore(key, min, max) {
    const client = await this.connect();
    return client.zRangeByScore(key, min, max);
  }

  async zCard(key) {
    const client = await this.connect();
    return client.zCard(key);
  }

  // Health check
  async ping() {
    try {
      const client = await this.connect();
      const result = await client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis ping failed:', error);
      return false;
    }
  }

  // Get connection status
  getStatus() {
    return {
      connected: this.connected,
      connecting: this.connecting,
      clientExists: !!this.client,
      isOpen: this.client ? this.client.isOpen : false
    };
  }
}

module.exports = new RedisClient();