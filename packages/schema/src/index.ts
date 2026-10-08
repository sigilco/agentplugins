import { Ajv, type ErrorObject } from 'ajv';
import { manifestJson, adapterJson, agentPathsJson } from './schemas.js';
import type { ManifestSchema, AgentPathsRegistry } from './types.js';

// scriptc/bun: schemas are inlined (schemas.ts) — readFileSync(__dirname) has no
// file to read inside embedded bundles.
export const manifestSchema: Record<string, unknown> = manifestJson;
export const adapterSchema: Record<string, unknown> = adapterJson;
export const agentPaths: AgentPathsRegistry = agentPathsJson as AgentPathsRegistry;

export const SCHEMA_VERSION = 1;
export const HOSTED_SCHEMA_URL = 'https://agentplugins.pages.dev/schema/v1.json';
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
