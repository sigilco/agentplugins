import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Ajv, type ErrorObject } from 'ajv';
import type { ManifestSchema, AgentPathsRegistry } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(__dirname, '..', 'schemas', file), 'utf-8')) as T;
}

export const manifestSchema = loadJson<Record<string, unknown>>('manifest.schema.json');
export const adapterSchema = loadJson<Record<string, unknown>>('adapter.schema.json');
export const agentPaths = loadJson<AgentPathsRegistry>('agent-paths.json');

export const SCHEMA_VERSION = 1;
export const HOSTED_SCHEMA_URL = 'https://agentplugins.dev/schema/v1.json';
export const RAW_SCHEMA_URL = 'https://raw.githubusercontent.com/sigilco/agentplugins/main/spec/v1/manifest.schema.json';

let _ajv: Ajv | null = null;

export function getValidator(): Ajv {
  if (!_ajv) {
    _ajv = new Ajv({ allErrors: true, strict: false });
    _ajv.addSchema(manifestSchema, 'manifest');
  }
  return _ajv;
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
}

export function validateManifest(data: unknown): ValidationResult {
  const ajv = getValidator();
  const validate = ajv.getSchema('manifest');
  if (!validate) {
    return { valid: false, errors: [{ path: '(root)', message: 'schema not loaded' }] };
  }
  const valid = validate(data);
  if (valid) {
    return { valid: true, errors: [] };
  }
  const errors = (validate.errors || []).map((e: ErrorObject) => ({
    path: e.instancePath || '(root)',
    message: e.message || 'invalid',
  }));
  return { valid: false, errors };
}

export function isValidManifest(data: unknown): data is ManifestSchema {
  return validateManifest(data).valid;
}

export { type ManifestSchema, type AgentPathsRegistry, type AgentPathEntry } from './types.js';
