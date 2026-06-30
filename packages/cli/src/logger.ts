import { configure, getConsoleSink, getLogger } from '@logtape/logtape';

let configured = false;

export async function setupLogger() {
  if (configured) return;
  await configure({
    sinks: { console: getConsoleSink() },
    filters: {},
    loggers: [
      { category: ['agentplugins', 'cli'], sinks: ['console'], level: 'info' },
      { category: ['logtape', 'meta'], sinks: ['console'], level: 'warning' },
    ],
  });
  configured = true;
}

export function getCliLogger() {
  return getLogger(['agentplugins', 'cli']);
}
