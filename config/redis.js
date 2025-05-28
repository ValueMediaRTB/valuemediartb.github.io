const redis = require('redis');
const { promisify } = require('util');

const client = redis.createClient({
  url: process.env.REDIS_URI
});

client.on('error', (err) => console.log('Redis Client Error', err));

const connectRedis = async () => {
  await client.connect();
  console.log('Redis Connected...');
};

// Promisify Redis methods
const getAsync = promisify(client.get).bind(client);
const setAsync = promisify(client.set).bind(client);
const delAsync = promisify(client.del).bind(client);

module.exports = {
  client,
  connectRedis,
  getAsync,
  setAsync,
  delAsync
};