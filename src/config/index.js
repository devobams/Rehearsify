// The ONLY file allowed to read process.env directly.
// Every other file imports `config` from here instead.
// This fails loudly at startup if something required is missing,
// instead of failing silently mid-request later.

import 'dotenv/config';

const required = ['DATABASE_URL', 'JWT_SECRET', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const config = {
  port: process.env.PORT || 3000,
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },
  job: {
    lookaheadDays: Number(process.env.JOB_LOOKAHEAD_DAYS) || 7,
    cronSchedule: process.env.JOB_CRON_SCHEDULE || '0 18 * * 0',
  },

  recommendation: {
    choirSkillLevel: (() => {
      const raw = process.env.CHOIR_SKILL_LEVEL;
      if (raw === undefined) return 3;
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
        throw new Error(`Invalid CHOIR_SKILL_LEVEL: "${raw}" — must be an integer between 1 and 5`);
      }
      return parsed;
    })(),
    rotationWindowDays: (() => {
      const raw = process.env.ROTATION_WINDOW_DAYS;
      if (raw === undefined) return 42;
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`Invalid ROTATION_WINDOW_DAYS: "${raw}" — must be a positive integer`);
      }
      return parsed;
    })(),
  },

  email: {
    apiKey: process.env.EMAIL_API_KEY,
    fromAddress: process.env.EMAIL_FROM_ADDRESS,
    smtp: {
      host: process.env.SMTP_HOST,
      port: (() => {
        const raw = process.env.SMTP_PORT;
        if (!raw) return undefined;
        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
          throw new Error(`Invalid SMTP_PORT: "${raw}" — must be an integer between 1 and 65535`);
        }
        return parsed;
      })(),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  }
};

export default config;
