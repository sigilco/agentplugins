/**
 * Logger for the CLI package.
 *
 * SPIKE: logtape replaced by a ~20-line console shim. logtape pulls Intl
 * (absent in scriptc's embedded engine) and accounts for ~17+121 dynamic
 * coverage sites. Interpolates `{key}` placeholders from the props object,
 * matching the logtape call-site style used throughout the CLI.
 */

interface CliLogger {
  info(message: string, props?: any): void;
  warn(message: string, props?: any): void;
  error(message: string, props?: any): void;
}

function interpolate(template: string, props?: any): string {
  if (!props) return template;
  let out = '';
  let i = 0;
  while (true) {
    const a = template.indexOf('{', i);
    if (a < 0) return out + template.slice(i);
    const b = template.indexOf('}', a);
    if (b < 0) return out + template.slice(i);
    const key = template.slice(a + 1, b);
    const val = props[key];
    out += template.slice(i, a) + (val === undefined ? '{' + key + '}' : String(val));
    i = b + 1;
  }
}

export function getCliLogger(): CliLogger {
  return {
    info: (message: string, props?: any) => console.log(interpolate(message, props)),
    warn: (message: string, props?: any) => console.log(interpolate(message, props)),
    error: (message: string, props?: any) => console.error(interpolate(message, props)),
  };
}

/** Kept for call-site compatibility; the shim needs no configuration. */
export async function setupLogger(): Promise<void> {}
