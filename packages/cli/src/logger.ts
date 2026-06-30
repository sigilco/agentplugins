import { configure, getConsoleSink, getLogger } from '@logtape/logtape';

let configured = false;

export async function setupLogger() {
  if (configured) return;
  await configure({
    sinks: { console: getConsoleSink() },
    filters: {},
    loggers: [
      { category: ['agentplugins', 'cli'], sinks: ['console'], lowestLevel: 'info' },
      { category: ['logtape', 'meta'], sinks: ['console'], lowestLevel: 'warning' },
    ],
  });
  configured = true;
}

export function getCliLogger() {
  return getLogger(['agentplugins', 'cli']);
}
