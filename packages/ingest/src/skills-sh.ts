/**
 * Skills.sh format ingestor.
 *
 * Skills.sh plugins are simply a directory of SKILL.md files. Each file has
 * YAML frontmatter with `name` and `description`. The plugin-level manifest
 * is synthesized from the directory itself — the directory name becomes the
 * plugin name and the SKILL.md files become the `skills` array.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import matter from 'gray-matter';
import { droppedField } from './warnings.js';
import type { IngestResult, IngestWarning, VendorFile } from './types.js';

export function ingestSkillsSh(sourceRoot: string): IngestResult {
  const warnings: IngestWarning[] = [];
  const vendorFiles: VendorFile[] = [];

  if (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) {
    return {
      manifest: {},
      warnings: [
        {
          code: 'no-skills-sh-dir',
          severity: 'error',
          message: `Skills.sh source "${sourceRoot}" is not a directory.`,
        },
      ],
      vendorFiles: [],
      format: 'skills-sh',
      sourceRoot,
    };
  }

  const dirName = basename(sourceRoot);
  const skillFiles = findSkillFiles(sourceRoot);

  if (skillFiles.length === 0) {
    return {
      manifest: {},
      warnings: [
        {
          code: 'no-skills-md',
          severity: 'error',
          message: `No SKILL.md files found under ${sourceRoot}.`,
        },
      ],
      vendorFiles: [],
      format: 'skills-sh',
      sourceRoot,
    };
  }

  const skills: Array<{ name: string; description: string; content?: string; filePath?: string }> = [];
  let pluginDescription: string | undefined;
  let pluginName = dirName;

  for (const abs of skillFiles) {
    const rel = abs.slice(sourceRoot.length + 1);
    vendorFiles.push({ absolutePath: abs, relativePath: rel, reason: 'Skills.sh skill content' });
    const raw = readFileSync(abs, 'utf-8');
    const parsed = matter(raw);
    const data = parsed.data as Record<string, unknown>;
    const name = (typeof data.name === 'string' && data.name) || basename(dirnameOfSkill(rel));
    const description = (typeof data.description === 'string' && data.description) || '';

    if (!description) {
      warnings.push(droppedField(abs, 'description', '(missing)'));
    }

    skills.push({
      name,
      description: description || '(no description)',
      content: parsed.content,
      filePath: rel,
    });

    // First skill at the root becomes the plugin-level metadata
    if (!pluginDescription && rel === 'SKILL.md' && description) {
      pluginDescription = description;
      if (typeof data.name === 'string' && data.name) pluginName = data.name;
    }
  }

  const manifest: Record<string, unknown> = {
    name: pluginName,
    version: '0.0.0',
    description: pluginDescription ?? `Imported Skills.sh plugin with ${skills.length} skill${skills.length === 1 ? '' : 's'}`,
    skills,
  };

  manifest.metadata = {
    _ingestedFrom: 'skills-sh',
    _ingestedAt: new Date().toISOString(),
  };

  return {
    manifest,
    warnings,
    vendorFiles,
    format: 'skills-sh',
    sourceRoot,
  };
}

function findSkillFiles(root: string): string[] {
  const results: string[] = [];
  walk(root, results);
  return results.sort();
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden + common noise directories
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      walk(abs, out);
    } else if (entry.isFile() && (entry.name === 'SKILL.md' || entry.name === 'skill.md')) {
      out.push(abs);
    }
  }
}

function dirnameOfSkill(relPath: string): string {
  const parts = relPath.split('/');
  parts.pop();
  return parts.length > 0 ? parts.join('/') : '.';
}
