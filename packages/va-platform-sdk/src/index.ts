export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class VaSdkHttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body?: unknown;

  constructor(status: number, url: string, body?: unknown) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'VaSdkHttpError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export interface HttpClientOptions {
  baseUrl: string;
  fetchImpl?: FetchLike;
  defaultHeaders?: Record<string, string>;
}

export interface HealthResponse {
  ok: boolean;
}

export interface TokenRequest {
  room?: string;
  identity?: string;
  ttl?: string;
}

export interface TokenResponse {
  token: string;
  room: string;
  identity: string;
  ttl: string;
  agentName: string;
}

export interface SearchResponse {
  query: string;
  results: Array<{ id: string; title: string; text: string }>;
}

export interface ContactResponse {
  ok: boolean;
  id: string;
}

export interface AppointmentResponse {
  ok: boolean;
  id: string;
}

export interface AvailabilityResponse {
  ok: boolean;
  query: {
    dateFromISO: string;
    dateToISO: string;
    preferredTimeOfDay: string;
  };
  slots: Array<{
    datetimeISO: string;
    available: boolean;
  }>;
}

export interface BookCalendarResponse {
  ok: boolean;
  id: string;
  datetimeISO: string;
  appointmentType?: string;
  facility?: string;
}

export interface RetellEventResponse {
  ok: boolean;
  id: string;
  status?: string;
  action?: string;
  digit?: string;
  ended?: boolean;
}

function ensureFetch(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) return fetchImpl;
  if (typeof fetch === 'undefined') {
    throw new Error('No fetch implementation available. Provide fetchImpl in client options.');
  }
  return fetch;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function withQuery(path: string, query?: Record<string, string | undefined>): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  return text || undefined;
}

class HttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: HttpClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.fetchImpl = ensureFetch(options.fetchImpl);
    this.defaultHeaders = options.defaultHeaders || {};
  }

  async getJson<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
    const url = `${this.baseUrl}${withQuery(path, query)}`;
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: this.defaultHeaders,
    });

    if (!response.ok) {
      throw new VaSdkHttpError(response.status, url, await parseBody(response));
    }

    return (await response.json()) as T;
  }

  async getText(path: string, query?: Record<string, string | undefined>): Promise<string> {
    const url = `${this.baseUrl}${withQuery(path, query)}`;
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: this.defaultHeaders,
    });

    if (!response.ok) {
      throw new VaSdkHttpError(response.status, url, await parseBody(response));
    }

    return response.text();
  }

  async postJson<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...this.defaultHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new VaSdkHttpError(response.status, url, await parseBody(response));
    }

    return (await response.json()) as T;
  }
}

export class TokenApiClient {
  private readonly http: HttpClient;

  constructor(options: HttpClientOptions) {
    this.http = new HttpClient(options);
  }

  health(): Promise<HealthResponse> {
    return this.http.getJson<HealthResponse>('/health');
  }

  getToken(params: TokenRequest = {}): Promise<TokenResponse> {
    return this.http.getJson<TokenResponse>('/token', {
      room: params.room,
      identity: params.identity,
      ttl: params.ttl,
    });
  }

  getRawToken(params: TokenRequest = {}): Promise<string> {
    return this.http.getText('/token/raw', {
      room: params.room,
      identity: params.identity,
      ttl: params.ttl,
    });
  }
}

export interface CreateAppointmentInput {
  name: string;
  email: string;
  datetimeISO: string;
  reason?: string;
}

export interface CheckAvailabilityInput {
  dateFromISO?: string;
  dateToISO?: string;
  preferredTimeOfDay?: string;
}

export interface BookCalendarInput {
  datetimeISO: string;
  appointmentType?: string;
  facility?: string;
  reason?: string;
  name?: string;
  email?: string;
}

export class ToolsApiClient {
  private readonly http: HttpClient;

  constructor(options: HttpClientOptions) {
    this.http = new HttpClient(options);
  }

  health(): Promise<HealthResponse> {
    return this.http.getJson<HealthResponse>('/health');
  }

  search(query: string): Promise<SearchResponse> {
    return this.http.getJson<SearchResponse>('/search', { q: query });
  }

  saveContact(name: string, email: string): Promise<ContactResponse> {
    return this.http.postJson<ContactResponse>('/contact', { name, email });
  }

  createAppointment(input: CreateAppointmentInput): Promise<AppointmentResponse> {
    return this.http.postJson<AppointmentResponse>('/appointments', input);
  }

  checkAvailability(input: CheckAvailabilityInput = {}): Promise<AvailabilityResponse> {
    return this.http.postJson<AvailabilityResponse>('/calendar/availability', input);
  }

  bookCalendar(input: BookCalendarInput): Promise<BookCalendarResponse> {
    return this.http.postJson<BookCalendarResponse>('/calendar/book', input);
  }

  sendCallSummaryEmail(summary: string, email?: string, customer_name?: string): Promise<RetellEventResponse> {
    return this.http.postJson<RetellEventResponse>('/retell/send_call_summary_email', {
      summary,
      email,
      customer_name,
    });
  }

  transferCall(reason?: string, target?: string): Promise<RetellEventResponse> {
    return this.http.postJson<RetellEventResponse>('/retell/transfer_call', { reason, target });
  }

  pressDigitMedrics(): Promise<RetellEventResponse> {
    return this.http.postJson<RetellEventResponse>('/retell/press_digit_medrics', {});
  }

  endCall(reason?: string): Promise<RetellEventResponse> {
    return this.http.postJson<RetellEventResponse>('/retell/end_call', { reason });
  }
}

export interface VaVoicePlatformClientsConfig {
  tokenServerBaseUrl: string;
  toolsApiBaseUrl: string;
  fetchImpl?: FetchLike;
  defaultHeaders?: Record<string, string>;
}

export function createVaVoicePlatformClients(config: VaVoicePlatformClientsConfig): {
  tokenApi: TokenApiClient;
  toolsApi: ToolsApiClient;
} {
  return {
    tokenApi: new TokenApiClient({
      baseUrl: config.tokenServerBaseUrl,
      fetchImpl: config.fetchImpl,
      defaultHeaders: config.defaultHeaders,
    }),
    toolsApi: new ToolsApiClient({
      baseUrl: config.toolsApiBaseUrl,
      fetchImpl: config.fetchImpl,
      defaultHeaders: config.defaultHeaders,
    }),
  };
}
