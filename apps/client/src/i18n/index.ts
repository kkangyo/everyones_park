// 화면에 보이는 문구는 모두 이 모듈을 거친다. 영어를 추가할 때는 en.json 을 만들고 여기서 고르게 한다.
import ko from "./ko.json";

type Messages = typeof ko;

/** "lobby.enter" 처럼 점으로 이은 키 (오타는 타입 오류) */
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;

const messages: Messages = ko;

/** 문구를 찾는다. {name} 자리는 params 로 채운다. 없는 키면 키 그대로 (화면에서 바로 눈에 띄게) */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  return translate(key, params) ?? key;
}

/** 키가 있는지 모르는 경우 (서버 오류 코드 등). 없으면 undefined */
export function translate(key: string, params?: Record<string, string | number>): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
  if (typeof node !== "string") return undefined;
  return params ? node.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : node;
}
