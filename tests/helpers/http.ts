import type { HttpRequestLike, HttpResponseLike } from '../../src/response';

export type MockResponse = HttpResponseLike & {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
};

export const mockRequest = (
  overrides: Partial<HttpRequestLike> & {
    readonly headers?: Record<string, string | string[] | undefined>;
  } = {},
): HttpRequestLike => ({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': 'test-api-key',
    ...overrides.headers,
  },
  body: {},
  url: '/api/generate-docx',
  ...overrides,
});

export const mockResponse = (): MockResponse => {
  const headers: Record<string, string> = {};
  const state = { statusCode: 200, body: undefined as unknown };
  const res: MockResponse = {
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    },
    headers,
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
    end(body?: unknown) {
      if (body !== undefined) state.body = body;
      return res;
    },
  };
  return res;
};
