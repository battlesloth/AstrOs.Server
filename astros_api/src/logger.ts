import pino from 'pino';
import appdata from 'appdata-path';
import fs from 'fs';

const logDir = `${appdata('astrosserver')}/logs`;
fs.mkdirSync(logDir, { recursive: true });

export const logger = pino({
  level: 'debug',
  transport: {
    targets: [
      {
        target: 'pino-roll',
        options: {
          file: `${logDir}/astros`,
          frequency: 'daily',
          dateFormat: 'yyyy-MM-dd',
          mkdir: true,
          limit: { count: 10 },
        },
      },
      {
        target: 'pino/file',
        options: { destination: 1 },
      },
    ],
  },
});
