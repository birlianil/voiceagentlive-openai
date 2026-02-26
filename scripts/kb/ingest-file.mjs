#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const options = {
    file: '',
    title: '',
    source: 'local-file',
    api: process.env.KB_API_BASE_URL || 'http://127.0.0.1:4011',
    embed: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file' || arg === '-f') {
      options.file = String(argv[++i] || '').trim();
      continue;
    }
    if (arg === '--title' || arg === '-t') {
      options.title = String(argv[++i] || '').trim();
      continue;
    }
    if (arg === '--source' || arg === '-s') {
      options.source = String(argv[++i] || '').trim() || options.source;
      continue;
    }
    if (arg === '--api') {
      options.api = String(argv[++i] || '').trim() || options.api;
      continue;
    }
    if (arg === '--embed') {
      const value = String(argv[++i] || 'true').trim().toLowerCase();
      options.embed = value !== 'false';
      continue;
    }
  }

  return options;
}

function getAuthHeaders() {
  const token = process.env.DB_API_AUTH_TOKEN || process.env.TOOLS_API_AUTH_TOKEN || '';
  if (!token) return {};
  return { authorization: `Bearer ${token}` };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error('Usage: node scripts/kb/ingest-file.mjs --file <path> [--title <title>] [--source <source>] [--api <baseUrl>] [--embed true|false]');
    process.exit(1);
  }

  const resolvedPath = path.resolve(args.file);
  const rawContent = await fs.readFile(resolvedPath, 'utf8');
  const title = args.title || path.basename(resolvedPath);

  const payload = {
    title,
    source: args.source,
    content: rawContent,
    metadata: {
      filePath: resolvedPath,
      ingestedAt: new Date().toISOString(),
    },
    embed: args.embed,
  };

  const endpoint = `${args.api.replace(/\/$/, '')}/kb/ingest`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`Ingest failed: ${res.status} ${text}`);
    process.exit(1);
  }

  console.log(text);
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
