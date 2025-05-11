import path from 'node:path';
import { getCacheDirPath } from '../services/cache-service';
import { pino } from 'pino';

export const serverLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: {
    targets: [
      ...(process.env.NODE_ENV !== 'production'
        ? [{
          target: 'pino-pretty',
          options: { colorize: true },
          level: process.env.LOG_LEVEL ?? 'info',
        }]
        : []),
      {
        target: 'pino/file',
        level: process.env.LOG_LEVEL ?? 'info',
        options: {
          destination: path.join(
            getCacheDirPath(),
            'logs',
            `code-templator.${new Date().toISOString().slice(0, 10)}.log`
          ),
          mkdir: true,
          rotate: { interval: '1d', size: '10m', maxFiles: 14 },
        },
      }
    ],
  },
});

export const logger = serverLogger.child({ src: 'backend' });

