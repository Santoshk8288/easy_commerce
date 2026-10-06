import Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().uri().required(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  BULK_WORKER_CONCURRENCY: Joi.number().integer().min(1).max(100).default(10),
  COURIER_TIMEOUT_MS: Joi.number().integer().min(100).default(10000),
  COURIER_RETRY_COUNT: Joi.number().integer().min(0).max(10).default(3),
  COURIER_RETRY_BASE_DELAY_MS: Joi.number().integer().min(10).default(250),
  URBANEBOLT_BASE_URL: Joi.string().uri().default('https://uat.urbanebolt.in'),
  URBANEBOLT_USERNAME: Joi.string().allow('').optional(),
  URBANEBOLT_PASSWORD: Joi.string().allow('').optional(),
  URBANEBOLT_CUSTOMER_CODE: Joi.string().allow('').optional(),
  URBANEBOLT_TOKEN_TTL_SECONDS: Joi.number().integer().min(60).default(3300),
  MOCK_COURIER_DELAY_MS: Joi.number().integer().min(0).default(20),
});
