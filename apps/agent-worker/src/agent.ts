import 'dotenv/config';

import { AudioByteStream, defineAgent, llm, mergeFrames, stt, tts, voice } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import * as openai from '@livekit/agents-plugin-openai';
import * as silero from '@livekit/agents-plugin-silero';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { z } from 'zod';

const DB_API_BASE_URL = process.env.DB_API_BASE_URL || 'http://127.0.0.1:4010';
const STT_SERVICE_URL = process.env.STT_SERVICE_URL || 'http://127.0.0.1:4020';
const TTS_SERVICE_URL = process.env.TTS_SERVICE_URL || 'http://127.0.0.1:4030';

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_TEMPERATURE = Number(process.env.OPENAI_TEMPERATURE || 0.2);
const OPENAI_MAX_COMPLETION_TOKENS = Number(process.env.OPENAI_MAX_COMPLETION_TOKENS || 96);
const USE_OPENAI_STT = (process.env.USE_OPENAI_STT || 'true').toLowerCase() === 'true';
const OPENAI_STT_MODEL = process.env.OPENAI_STT_MODEL || 'whisper-1';
const OPENAI_STT_DETECT_LANGUAGE =
  (process.env.OPENAI_STT_DETECT_LANGUAGE || 'true').toLowerCase() === 'true';
const OPENAI_STT_LANGUAGE = process.env.OPENAI_STT_LANGUAGE || '';
const OPENAI_STT_PROMPT = process.env.OPENAI_STT_PROMPT || '';
const USE_OPENAI_TTS = (process.env.USE_OPENAI_TTS || 'true').toLowerCase() === 'true';
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'nova';
const OPENAI_TTS_SPEED = Number(process.env.OPENAI_TTS_SPEED || 1.05);
const OPENAI_TTS_INSTRUCTIONS =
  process.env.OPENAI_TTS_INSTRUCTIONS ||
  'Energetic, warm, and helpful female assistant voice. Natural and friendly.';
const ENABLE_TOOLS = (process.env.ENABLE_TOOLS || 'true').toLowerCase() === 'true';

const AGENT_SYSTEM_PROMPT_FILE = process.env.AGENT_SYSTEM_PROMPT_FILE || './prompt.md';
const AGENT_SYSTEM_PROMPT = process.env.AGENT_SYSTEM_PROMPT || '';
const AGENT_GREETING =
  process.env.AGENT_GREETING || 'Hello, I am ready. How can I help you today?';

const MAX_SPOKEN_WORDS = Number(process.env.AGENT_MAX_SPOKEN_WORDS || 24);
const VOICE_ALLOW_INTERRUPTIONS =
  (process.env.VOICE_ALLOW_INTERRUPTIONS || 'true').toLowerCase() === 'true';
const VOICE_MIN_INTERRUPTION_DURATION_MS = Number(
  process.env.VOICE_MIN_INTERRUPTION_DURATION_MS || 280,
);
const VOICE_MIN_INTERRUPTION_WORDS = Number(process.env.VOICE_MIN_INTERRUPTION_WORDS || 1);
const VOICE_MIN_ENDPOINTING_DELAY_MS = Number(process.env.VOICE_MIN_ENDPOINTING_DELAY_MS || 200);
const VOICE_MAX_ENDPOINTING_DELAY_MS = Number(process.env.VOICE_MAX_ENDPOINTING_DELAY_MS || 900);
const VOICE_PREEMPTIVE_GENERATION =
  (process.env.VOICE_PREEMPTIVE_GENERATION || 'false').toLowerCase() === 'true';
const STT_SILENCE_FLUSH_MS = Number(process.env.STT_SILENCE_FLUSH_MS || 520);
const STT_MAX_SEGMENT_MS = Number(process.env.STT_MAX_SEGMENT_MS || 10_000);
const STT_MIN_SPEECH_MS = Number(process.env.STT_MIN_SPEECH_MS || 180);
const STT_SPEECH_RMS_THRESHOLD = Number(process.env.STT_SPEECH_RMS_THRESHOLD || 0.02);
const ACTIVE_STT_LABEL = USE_OPENAI_STT
  ? `openai:${OPENAI_STT_MODEL}${OPENAI_STT_DETECT_LANGUAGE ? ':auto-lang' : OPENAI_STT_LANGUAGE ? `:${OPENAI_STT_LANGUAGE}` : ''}`
  : `local:${STT_SERVICE_URL}`;
const ACTIVE_TTS_LABEL = USE_OPENAI_TTS
  ? `openai:${OPENAI_TTS_MODEL}:${OPENAI_TTS_VOICE}`
  : `local:${TTS_SERVICE_URL}`;

function loadSystemPrompt(): string {
  if (AGENT_SYSTEM_PROMPT.trim()) {
    return AGENT_SYSTEM_PROMPT.trim();
  }

  const promptPath = resolve(AGENT_SYSTEM_PROMPT_FILE);
  if (existsSync(promptPath)) {
    const text = readFileSync(promptPath, 'utf8').trim();
    if (text) return text;
  }

  return [
    'You are a realtime voice assistant for scheduling and support.',
    'Keep answers short, clear, and spoken-friendly.',
    'If tools are enabled, use tools for database actions.',
  ].join('\n');
}

const SYSTEM_PROMPT = loadSystemPrompt();

function extractStringLike(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;
  const candidates = ['value', 'text', 'query', 'name', 'email', 'datetimeISO', 'reason'];
  for (const key of candidates) {
    const v = record[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }

  return undefined;
}

const zLooseString = z.preprocess((value) => extractStringLike(value) ?? value, z.string().min(1));
const zLooseEmail = z.preprocess((value) => extractStringLike(value) ?? value, z.string().email());
const zLooseOptionalString = z.preprocess(
  (value) => {
    const s = extractStringLike(value);
    return s && s.length > 0 ? s : undefined;
  },
  z.string().min(1).optional(),
);
const zLooseOptionalEmail = z.preprocess(
  (value) => {
    const s = extractStringLike(value);
    return s && s.length > 0 ? s : undefined;
  },
  z.string().email().optional(),
);

class LocalServiceSTT extends stt.STT {
  label = 'local.http.stt';

  constructor() {
    super({ streaming: true, interimResults: false, alignedTranscript: false });
  }

  protected async _recognize(): Promise<stt.SpeechEvent> {
    throw new Error('LocalServiceSTT._recognize is not used; sttNode is overridden');
  }

  stream(): stt.SpeechStream {
    throw new Error('LocalServiceSTT.stream is not used; sttNode is overridden');
  }
}

class LocalServiceTTS extends tts.TTS {
  label = 'local.http.tts';

  constructor() {
    super(24000, 1, { streaming: true, alignedTranscript: false });
  }

  synthesize(): tts.ChunkedStream {
    throw new Error('LocalServiceTTS.synthesize is not used; ttsNode is overridden');
  }

  stream(): tts.SynthesizeStream {
    throw new Error('LocalServiceTTS.stream is not used; ttsNode is overridden');
  }
}

function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function computeRmsNormalized(samples: Int16Array): number {
  if (samples.length === 0) return 0;

  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i] / 32768;
    sum += s * s;
  }

  return Math.sqrt(sum / samples.length);
}

function createPcm16Wav(frame: AudioFrame): Buffer {
  const bitsPerSample = 16;
  const byteRate = (frame.sampleRate * frame.channels * bitsPerSample) / 8;
  const blockAlign = (frame.channels * bitsPerSample) / 8;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + frame.data.byteLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(frame.channels, 22);
  header.writeUInt32LE(frame.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(frame.data.byteLength, 40);

  const rawBuffer = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
  return Buffer.concat([header, rawBuffer]);
}

function parsePcm16Wav(wavBytes: Uint8Array): {
  sampleRate: number;
  numChannels: number;
  pcmBytes: Uint8Array;
} {
  const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);

  if (readFourCC(view, 0) !== 'RIFF' || readFourCC(view, 8) !== 'WAVE') {
    throw new Error('Invalid WAV header');
  }

  let offset = 12;
  let audioFormat: number | undefined;
  let numChannels: number | undefined;
  let sampleRate: number | undefined;
  let bitsPerSample: number | undefined;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= view.byteLength) {
    const chunkId = readFourCC(view, offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataStart = offset + 8;

    if (chunkId === 'fmt ') {
      audioFormat = view.getUint16(chunkDataStart, true);
      numChannels = view.getUint16(chunkDataStart + 2, true);
      sampleRate = view.getUint32(chunkDataStart + 4, true);
      bitsPerSample = view.getUint16(chunkDataStart + 14, true);
    } else if (chunkId === 'data') {
      dataOffset = chunkDataStart;
      dataSize = chunkSize;
      break;
    }

    offset = chunkDataStart + chunkSize + (chunkSize % 2);
  }

  if (audioFormat !== 1) {
    throw new Error(`Unsupported WAV format: ${audioFormat}`);
  }
  if (bitsPerSample !== 16) {
    throw new Error(`Unsupported WAV bit depth: ${bitsPerSample}`);
  }
  if (!numChannels || !sampleRate || dataOffset < 0 || dataSize <= 0) {
    throw new Error('Missing WAV fmt/data chunk');
  }

  const end = Math.min(dataOffset + dataSize, wavBytes.byteLength);
  const pcmBytes = wavBytes.subarray(dataOffset, end);
  return { sampleRate, numChannels, pcmBytes };
}

async function readAllText(textStream: ReadableStream<string>): Promise<string> {
  const reader = textStream.getReader();
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += value;
    }
  } finally {
    reader.releaseLock();
  }

  return text.trim();
}

function compactSpokenReply(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return normalized;

  const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
  const words = firstSentence.split(/\s+/);
  if (words.length <= MAX_SPOKEN_WORDS) return firstSentence;
  return `${words.slice(0, MAX_SPOKEN_WORDS).join(' ')}.`;
}

async function transcribeFrames(frames: AudioFrame[]): Promise<string> {
  if (frames.length === 0) return '';

  const merged = mergeFrames(frames);
  const wav = createPcm16Wav(merged);

  const form = new FormData();
  form.set('audio', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'speech.wav');

  const res = await fetch(`${STT_SERVICE_URL}/transcribe`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    throw new Error(`STT /transcribe failed: ${res.status}`);
  }

  const payload = (await res.json()) as { text?: string };
  return String(payload.text || '').trim();
}

async function synthesizeTextToFrames(text: string): Promise<AudioFrame[]> {
  const res = await fetch(`${TTS_SERVICE_URL}/synthesize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    throw new Error(`TTS /synthesize failed: ${res.status}`);
  }

  const payload = (await res.json()) as { audio_base64?: string };
  const audioB64 = payload.audio_base64;
  if (!audioB64) {
    throw new Error('TTS service returned empty audio_base64');
  }

  const wavBytes = Buffer.from(audioB64, 'base64');
  const { sampleRate, numChannels, pcmBytes } = parsePcm16Wav(wavBytes);

  const sampleChunk = Math.max(1, Math.floor(sampleRate / 20));
  const pcmBuffer = new Uint8Array(pcmBytes).buffer;

  const byteStream = new AudioByteStream(sampleRate, numChannels, sampleChunk);
  return [...byteStream.write(pcmBuffer), ...byteStream.flush()];
}

async function dbGet(path: string) {
  const res = await fetch(`${DB_API_BASE_URL}${path}`);
  if (!res.ok) throw new Error(`DB GET ${path} failed: ${res.status}`);
  return res.json();
}

async function dbPost(path: string, body: unknown) {
  const res = await fetch(`${DB_API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DB POST ${path} failed: ${res.status}`);
  return res.json();
}

class DbAgent extends voice.Agent {
  constructor() {
    const tools = {
      db_search: llm.tool({
        description: 'Search the knowledge base / policy store',
        parameters: z.object({ query: zLooseString }),
        execute: async ({ query }) => dbGet(`/search?q=${encodeURIComponent(String(query))}`),
      }),
      save_contact: llm.tool({
        description: 'Save confirmed user contact info (name + email) into backend',
        parameters: z.object({
          name: zLooseString,
          email: zLooseEmail,
        }),
        execute: async ({ name, email }) =>
          dbPost('/contact', { name: String(name), email: String(email) }),
      }),
      create_appointment: llm.tool({
        description: 'Create appointment. Collect confirmed name, email, datetimeISO, and reason.',
        parameters: z.object({
          name: zLooseString,
          email: zLooseEmail,
          datetimeISO: zLooseString,
          reason: zLooseOptionalString,
        }),
        execute: async (args) =>
          dbPost('/appointments', {
            name: String(args.name),
            email: String(args.email),
            datetimeISO: String(args.datetimeISO),
            reason: args.reason ? String(args.reason) : 'general',
          }),
      }),
      check_availability_cal: llm.tool({
        description:
          'Check calendar slot availability for a date/date-range and preferred time of day.',
        parameters: z.object({
          dateFromISO: zLooseOptionalString,
          dateToISO: zLooseOptionalString,
          preferredTimeOfDay: zLooseOptionalString,
        }),
        execute: async ({ dateFromISO, dateToISO, preferredTimeOfDay }) =>
          dbPost('/calendar/availability', {
            dateFromISO: dateFromISO ? String(dateFromISO) : undefined,
            dateToISO: dateToISO ? String(dateToISO) : undefined,
            preferredTimeOfDay: preferredTimeOfDay ? String(preferredTimeOfDay) : 'any',
          }),
      }),
      book_appointment_cal: llm.tool({
        description:
          'Book a calendar appointment after confirming appointment type, date/time, and clinic/facility.',
        parameters: z.object({
          datetimeISO: zLooseString,
          appointmentType: zLooseOptionalString,
          facility: zLooseOptionalString,
          reason: zLooseOptionalString,
          name: zLooseOptionalString,
          email: zLooseOptionalEmail,
        }),
        execute: async ({ datetimeISO, appointmentType, facility, reason, name, email }) =>
          dbPost('/calendar/book', {
            datetimeISO: String(datetimeISO),
            appointmentType: appointmentType ? String(appointmentType) : 'general',
            facility: facility ? String(facility) : 'va-clinic',
            reason: reason ? String(reason) : 'general',
            name: name ? String(name) : undefined,
            email: email ? String(email) : undefined,
          }),
      }),
      send_call_summary_email: llm.tool({
        description:
          'Send a short call-summary email when customer requested recap and email is available.',
        parameters: z.object({
          summary: zLooseString,
          email: zLooseOptionalEmail,
          customer_name: zLooseOptionalString,
        }),
        execute: async ({ summary, email, customer_name }) =>
          dbPost('/retell/send_call_summary_email', {
            summary: String(summary),
            email: email ? String(email) : undefined,
            customer_name: customer_name ? String(customer_name) : undefined,
          }),
      }),
      transfer_call: llm.tool({
        description: 'Transfer caller to a real person when requested.',
        parameters: z.object({
          reason: zLooseOptionalString,
          target: zLooseOptionalString,
        }),
        execute: async ({ reason, target }) =>
          dbPost('/retell/transfer_call', {
            reason: reason ? String(reason) : undefined,
            target: target ? String(target) : undefined,
          }),
      }),
      press_digit_medrics: llm.tool({
        description: 'Ask caller to press digit 5 before transfer to creator company.',
        parameters: z.object({}),
        execute: async () => dbPost('/retell/press_digit_medrics', {}),
      }),
      end_call: llm.tool({
        description: 'End call once conversation is complete and user confirms no further help is needed.',
        parameters: z.object({
          reason: zLooseOptionalString,
        }),
        execute: async ({ reason }) =>
          dbPost('/retell/end_call', {
            reason: reason ? String(reason) : 'completed',
          }),
      }),
    };

    const sttClient = USE_OPENAI_STT
      ? new openai.STT({
          model: OPENAI_STT_MODEL,
          baseURL: OPENAI_BASE_URL,
          apiKey: process.env.OPENAI_API_KEY,
          detectLanguage: OPENAI_STT_DETECT_LANGUAGE,
          ...(OPENAI_STT_LANGUAGE ? { language: OPENAI_STT_LANGUAGE } : {}),
          ...(OPENAI_STT_PROMPT ? { prompt: OPENAI_STT_PROMPT } : {}),
        })
      : new LocalServiceSTT();

    const ttsClient = USE_OPENAI_TTS
      ? new openai.TTS({
          model: OPENAI_TTS_MODEL,
          voice: OPENAI_TTS_VOICE as any,
          speed: OPENAI_TTS_SPEED,
          instructions: OPENAI_TTS_INSTRUCTIONS,
          baseURL: OPENAI_BASE_URL,
          apiKey: process.env.OPENAI_API_KEY,
        })
      : new LocalServiceTTS();

    super({
      instructions: SYSTEM_PROMPT,
      llm: new openai.LLM({
        model: OPENAI_MODEL,
        baseURL: OPENAI_BASE_URL,
        apiKey: process.env.OPENAI_API_KEY,
        temperature: OPENAI_TEMPERATURE,
        maxCompletionTokens: OPENAI_MAX_COMPLETION_TOKENS,
        ...(ENABLE_TOOLS ? {} : { toolChoice: 'none', parallelToolCalls: false }),
      }),
      stt: sttClient,
      tts: ttsClient,
      ...(ENABLE_TOOLS ? { tools } : {}),
    });
  }

  async sttNode(
    audio: ReadableStream<AudioFrame>,
    modelSettings: voice.ModelSettings,
  ): Promise<ReadableStream<stt.SpeechEvent | string> | null> {
    if (USE_OPENAI_STT) {
      return voice.Agent.default.sttNode(this, audio, modelSettings);
    }

    const silenceFlushMs = STT_SILENCE_FLUSH_MS;
    const maxSegmentMs = STT_MAX_SEGMENT_MS;
    const minSpeechMs = STT_MIN_SPEECH_MS;
    const speechRmsThreshold = STT_SPEECH_RMS_THRESHOLD;

    return new ReadableStream<stt.SpeechEvent>({
      start: async (controller) => {
        const reader = audio.getReader();
        const segmentFrames: AudioFrame[] = [];

        let segmentMs = 0;
        let speechMs = 0;
        let trailingSilenceMs = 0;
        let hasSpeech = false;

        const resetSegment = () => {
          segmentFrames.length = 0;
          segmentMs = 0;
          speechMs = 0;
          trailingSilenceMs = 0;
          hasSpeech = false;
        };

        const flushSegment = async () => {
          if (!hasSpeech || segmentFrames.length === 0 || speechMs < minSpeechMs) {
            resetSegment();
            return;
          }

          const framesToTranscribe = segmentFrames.slice();
          resetSegment();

          const text = await transcribeFrames(framesToTranscribe);
          if (text) {
            controller.enqueue({
              type: stt.SpeechEventType.FINAL_TRANSCRIPT,
              alternatives: [
                {
                  text,
                  language: 'en',
                  startTime: 0,
                  endTime: 0,
                  confidence: 0.9,
                },
              ],
            });
          }

          controller.enqueue({
            type: stt.SpeechEventType.END_OF_SPEECH,
          });
        };

        try {
          while (true) {
            const { done, value: frame } = await reader.read();
            if (done) break;

            const frameMs = (frame.samplesPerChannel / frame.sampleRate) * 1000;
            const rms = computeRmsNormalized(frame.data);
            const isSpeech = rms >= speechRmsThreshold;

            if (isSpeech) {
              if (!hasSpeech) {
                controller.enqueue({
                  type: stt.SpeechEventType.START_OF_SPEECH,
                });
              }
              hasSpeech = true;
              speechMs += frameMs;
            }

            if (hasSpeech) {
              segmentFrames.push(frame);
              segmentMs += frameMs;
              trailingSilenceMs = isSpeech ? 0 : trailingSilenceMs + frameMs;
            }

            if (hasSpeech && (trailingSilenceMs >= silenceFlushMs || segmentMs >= maxSegmentMs)) {
              await flushSegment();
            }
          }

          await flushSegment();
          controller.close();
        } catch (err) {
          controller.error(err);
        } finally {
          reader.releaseLock();
        }
      },
    });
  }

  async ttsNode(
    text: ReadableStream<string>,
    modelSettings: voice.ModelSettings,
  ): Promise<ReadableStream<AudioFrame> | null> {
    if (USE_OPENAI_TTS) {
      return voice.Agent.default.ttsNode(this, text, modelSettings);
    }

    const rawText = await readAllText(text);
    const finalText = compactSpokenReply(rawText || 'I did not catch that. Please repeat shortly.');
    const frames = await synthesizeTextToFrames(finalText);

    return new ReadableStream<AudioFrame>({
      start(controller) {
        for (const frame of frames) {
          controller.enqueue(frame);
        }
        controller.close();
      },
    });
  }
}

export default defineAgent({
  prewarm: async (proc) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx) => {
    await ctx.connect();
    console.log(
      `[agent:start] llm=${OPENAI_MODEL} stt=${ACTIVE_STT_LABEL} tts=${ACTIVE_TTS_LABEL} tools=${ENABLE_TOOLS}`,
    );

    const vad = ctx.proc.userData.vad as silero.VAD | undefined;

    const session = new voice.AgentSession({
      turnDetection: 'vad',
      vad,
      voiceOptions: {
        allowInterruptions: VOICE_ALLOW_INTERRUPTIONS,
        minInterruptionDuration: VOICE_MIN_INTERRUPTION_DURATION_MS,
        minInterruptionWords: VOICE_MIN_INTERRUPTION_WORDS,
        minEndpointingDelay: VOICE_MIN_ENDPOINTING_DELAY_MS,
        maxEndpointingDelay: VOICE_MAX_ENDPOINTING_DELAY_MS,
        preemptiveGeneration: VOICE_PREEMPTIVE_GENERATION,
        userAwayTimeout: 120,
      },
      connOptions: {
        llmConnOptions: {
          timeoutMs: 60_000,
          maxRetry: 2,
          retryIntervalMs: 800,
        },
      },
    });

    session.on(voice.AgentSessionEventTypes.Error, (ev) => {
      const message = ev.error instanceof Error ? ev.error.message : String(ev.error);
      console.error(`[agent-session:error] ${ev.type} ${message}`);
    });

    session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, (ev) => {
      const outputs = ev.functionCallOutputs
        .map((x) => `${x.name}:${x.isError ? 'error' : 'ok'}`)
        .join(' | ');
      console.log(`[agent-session:tools] ${outputs || 'no-tools'}`);
    });

    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
      if (ev.isFinal) {
        console.log(`[agent-session:stt] ${ev.transcript}`);
      }
    });

    session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => {
      console.log(`[agent-session:user-state] ${ev.oldState} -> ${ev.newState}`);
    });

    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      console.log(`[agent-session:agent-state] ${ev.oldState} -> ${ev.newState}`);
    });

    await session.start({ room: ctx.room, agent: new DbAgent() });
    await session.say(AGENT_GREETING, { allowInterruptions: true });
  },
});
