const redis = require('redis');
const { promisify } = require('util');

class RedisClient {
  constructor() {
    this.client = redis.createClient({
      url: process.env.REDIS_URI
    });
    
    this.client.on('error', (err) => console.error('Redis Client Error', err));
    this.connected = false;
  }

  async connect() {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
      console.log('Redis Connected...');
    }
    return this.client;
  }

  async get(key) {
    await this.connect();
    return this.client.get(key);
  }

  async set(key, value, ttl) {
    await this.connect();
    return ttl ? this.client.setEx(key, ttl, value) : this.client.set(key, value);
  }

  async del(key) {
    await this.connect();
    return this.client.del(key);
  }

  async flush() {
    await this.connect();
    return this.client.flushDb();
  }
}

module.exports = new RedisClient();