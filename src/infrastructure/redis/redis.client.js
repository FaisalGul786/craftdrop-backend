import { Redis } from '@upstash/redis';
import envConfig from "../../shared/env-config/env.variables.js"

const redis = new Redis({
  url: envConfig.UPSTASH_REDIS_URL,
  token: envConfig.UPSTASH_REDIS_TOKEN,
});

export const redisClient = {
  async set(key, value, ttlSeconds = null) {
    return ttlSeconds 
      ? await redis.set(key, value, { ex: ttlSeconds }) 
      : await redis.set(key, value);
  },

  async get(key) {
    return await redis.get(key);
  },

  async del(key) {
    return await redis.del(key);
  },

  async incr(key) {
    return await redis.incr(key);
  },

  async expire(key, ttlSeconds) {
    return await redis.expire(key, ttlSeconds);
  }
};