import {
  API,
  type ApiError,
  type ApiErrorCode,
  type LoginRequest,
  type LoginResponse,
  type NicknameCheckResponse,
  type RandomNicknameResponse,
  type SignupRequest,
} from "@park/shared";

/** API 실패. code 로 i18n 문구를 찾는다 (NETWORK: 서버에 닿지 못함) */
export class ApiFailure extends Error {
  constructor(
    readonly code: ApiErrorCode | "NETWORK",
    readonly detail: Omit<ApiError, "error"> = {},
  ) {
    super(code);
  }
}

const TIMEOUT_MS = 8000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, signal: init?.signal ?? AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new ApiFailure("NETWORK");
  }
  const body = (await res.json().catch(() => null)) as (T & Partial<ApiError>) | null;
  if (!res.ok || !body) {
    // 프록시가 서버에 닿지 못하면(502 등) JSON 이 아니다
    if (!body?.error) throw new ApiFailure(res.status >= 500 ? "NETWORK" : "BAD_REQUEST");
    const { error, ...detail } = body as ApiError;
    throw new ApiFailure(error, detail);
  }
  return body;
}

export function login(req: LoginRequest): Promise<LoginResponse> {
  return request(API.login, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req) });
}

export function signup(req: SignupRequest): Promise<LoginResponse> {
  return request(API.signup, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req) });
}

export async function fetchRandomNickname(): Promise<string> {
  return (await request<RandomNicknameResponse>(API.randomNickname)).nickname;
}

export async function checkNickname(nickname: string, signal?: AbortSignal): Promise<NicknameCheckResponse> {
  return request(`${API.checkNickname}?name=${encodeURIComponent(nickname)}`, signal ? { signal } : undefined);
}
