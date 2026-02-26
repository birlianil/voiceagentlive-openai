import crypto from 'node:crypto';

export interface KbEmbeddingClientConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export interface KbSectionChunk {
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
}

interface EmbeddingApiResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
}

export function normalizeKbText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function hashKbContent(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function clamp(n: number, minValue: number, maxValue: number): number {
  return Math.max(minValue, Math.min(maxValue, n));
}

export function chunkKbText(content: string, chunkSize: number, overlap: number): KbSectionChunk[] {
  const normalized = normalizeKbText(content);
  if (!normalized) return [];

  const safeChunkSize = clamp(Math.floor(chunkSize), 200, 3000);
  const safeOverlap = clamp(Math.floor(overlap), 0, Math.floor(safeChunkSize / 2));
  const step = Math.max(1, safeChunkSize - safeOverlap);

  const chunks: KbSectionChunk[] = [];
  let offset = 0;
  let chunkIndex = 0;

  while (offset < normalized.length) {
    const targetEnd = Math.min(normalized.length, offset + safeChunkSize);
    let end = targetEnd;

    if (targetEnd < normalized.length) {
      const boundaryWindow = normalized.slice(offset, targetEnd + 1);
      const paragraphBreak = boundaryWindow.lastIndexOf('\n\n');
      const sentenceBreak = Math.max(boundaryWindow.lastIndexOf('. '), boundaryWindow.lastIndexOf('? '), boundaryWindow.lastIndexOf('! '));

      if (paragraphBreak > step / 2) {
        end = offset + paragraphBreak + 2;
      } else if (sentenceBreak > step / 2) {
        end = offset + sentenceBreak + 1;
      }
    }

    const section = normalized.slice(offset, end).trim();
    if (section) {
      chunks.push({
        chunkIndex,
        content: section,
        metadata: {
          offsetStart: offset,
          offsetEnd: end,
          charLength: section.length,
        },
      });
      chunkIndex += 1;
    }

    offset += step;
  }

  return chunks;
}

export async function createOpenAiEmbeddings(
  config: KbEmbeddingClientConfig,
  inputs: string[],
): Promise<number[][]> {
  if (!config.apiKey) {
    throw new Error('OPENAI_API_KEY is required for embeddings');
  }
  if (inputs.length === 0) {
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const res = await fetch(`${config.baseUrl}/embeddings`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        input: inputs,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`embeddings request failed: ${res.status} ${text.slice(0, 300)}`);
    }

    const payload = (await res.json()) as EmbeddingApiResponse;
    const sorted = [...payload.data].sort((a, b) => a.index - b.index);
    return sorted.map((item) => item.embedding);
  } finally {
    clearTimeout(timeout);
  }
}

export function parseEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const numbers = value.filter((x) => typeof x === 'number') as number[];
  return numbers.length > 0 ? numbers : null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function truncateForSnippet(text: string, maxChars = 360): string {
  const normalized = normalizeKbText(text);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1)}…`;
}
