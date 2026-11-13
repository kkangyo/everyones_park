/**
 * 고양이 그림(고등어 태비 + 흰 가슴·주둥이·발)을 생성한다. 사용자 사진을 바탕으로 한 색·무늬.
 *
 *   pnpm gen:cat            → assets/sprites/animals/cat-tabby.png
 *   pnpm gen:cat --preview  → 위 + scratch 미리보기 (8배 확대, 행 이름) assets/sprites/review/cat-preview.png
 *
 * 시트 배치는 packages/shared/src/animals.ts CAT_SHEET_ROWS (32x32 칸, 4열). 기준점은 칸 아래 가운데 (발바닥 y 29).
 *
 * 그리는 방법: 프레임마다 부위(몸통·머리·귀·다리·꼬리 등)를 도형으로 놓고(뒤 → 앞 순서), 칸마다 재질(털·흰 털·눈·코…)과
 * 부위 안 좌표를 기록한다. 마지막에 재질별로 색을 정하면서 줄무늬(부위 좌표 기준이라 몸과 같이 움직임)·명암·외곽선을 입힌다.
 * 그래서 모든 프레임이 같은 고양이로 보이고, 자세만 바꾸면 새 동작을 만들 수 있다.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CAT_FRAME, CAT_FRAMES_PER_ROW, CAT_SHEET_ROWS, type CatAction, type CatView } from "../packages/shared/src/animals";
import { Canvas, encodePng, hex, type RGBA } from "./lib/png";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const N = CAT_FRAME;

// ---- 색 (사진: 은회색 바탕 + 검은 고등어 줄무늬, 흰 가슴·주둥이·발, 연두빛 눈) ----
const C = {
  outline: hex("#2a2420"),
  furLight: hex("#c2b9aa"),
  fur: hex("#958c7d"),
  furShade: hex("#6f675b"),
  stripe: hex("#3b342d"),
  stripeSoft: hex("#5b5248"),
  far: hex("#776f62"),
  farStripe: hex("#3a332c"),
  white: hex("#f4f2ec"),
  whiteShade: hex("#d5d0c5"),
  farWhite: hex("#b3ada2"),
  eye: hex("#c3d25a"),
  eyeLight: hex("#ffffff"),
  eyeDark: hex("#7f9338"),
  pupil: hex("#1d1915"),
  nose: hex("#c98a80"),
  earPink: hex("#d9a196"),
  mouth: hex("#b85a55"),
  shadow: hex("#000000", 60),
} as const;

type Mat = "fur" | "white" | "far" | "farWhite" | "eye" | "eyeDark" | "eyeLight" | "pupil" | "nose" | "ear" | "mouth" | "line" | "stripe";
/** 줄무늬 규칙이 다른 부위 */
type Kind = "body" | "bodyFront" | "head" | "leg" | "tail" | "ear" | "none";

interface Px {
  mat: Mat;
  kind: Kind;
  id: number;
  u: number;
  v: number;
  /** 이 부위와 앞뒤 경계에 진한 선을 넣는다 (다리가 몸 앞에 올 때 등) */
  edge: boolean;
}

/** 프레임 하나를 그리는 도구. 나중에 그린 부위가 앞 */
class Frame {
  readonly px: (Px | null)[] = new Array(N * N).fill(null);
  readonly shadow = new Uint8Array(N * N);
  private nextId = 1;

  private put(x: number, y: number, p: Omit<Px, "id">, id: number): void {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    this.px[y * N + x] = { ...p, id };
  }

  /** 기울일 수 있는 타원. mat 은 부위 안 좌표 (u: 오른쪽 +, v: 아래 +) 로 칸마다 정할 수 있다 */
  ellipse(o: { cx: number; cy: number; rx: number; ry: number; rot?: number; kind: Kind; mat: Mat | ((u: number, v: number) => Mat); edge?: boolean }): void {
    const id = this.nextId++;
    const cos = Math.cos(o.rot ?? 0);
    const sin = Math.sin(o.rot ?? 0);
    const r = Math.max(o.rx, o.ry) + 1;
    for (let y = Math.floor(o.cy - r); y <= Math.ceil(o.cy + r); y++)
      for (let x = Math.floor(o.cx - r); x <= Math.ceil(o.cx + r); x++) {
        const dx = x + 0.5 - o.cx;
        const dy = y + 0.5 - o.cy;
        const u = dx * cos + dy * sin;
        const v = -dx * sin + dy * cos;
        if ((u / o.rx) ** 2 + (v / o.ry) ** 2 > 1) continue;
        const mat = typeof o.mat === "function" ? o.mat(u, v) : o.mat;
        this.put(x, y, { mat, kind: o.kind, u, v, edge: !!o.edge }, id);
      }
  }

  /** 굵은 꺾은선 (다리·꼬리). t = 시작점부터 따라간 거리 → v 에 넣는다 (꼬리 줄무늬·다리 발끝 판정) */
  line(o: { pts: [number, number][]; w: number; kind: Kind; mat: Mat | ((t: number, len: number) => Mat); edge?: boolean }): void {
    const id = this.nextId++;
    const segs: { ax: number; ay: number; bx: number; by: number; t0: number; len: number }[] = [];
    let total = 0;
    for (let i = 1; i < o.pts.length; i++) {
      const [ax, ay] = o.pts[i - 1]!;
      const [bx, by] = o.pts[i]!;
      const len = Math.hypot(bx - ax, by - ay);
      segs.push({ ax, ay, bx, by, t0: total, len });
      total += len;
    }
    const xs = o.pts.map((p) => p[0]);
    const ys = o.pts.map((p) => p[1]);
    const r = o.w / 2;
    for (let y = Math.floor(Math.min(...ys) - r - 1); y <= Math.ceil(Math.max(...ys) + r); y++)
      for (let x = Math.floor(Math.min(...xs) - r - 1); x <= Math.ceil(Math.max(...xs) + r); x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let best = Infinity;
        let bestT = 0;
        for (const s of segs) {
          const k = s.len === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * (s.bx - s.ax) + (py - s.ay) * (s.by - s.ay)) / (s.len * s.len)));
          const d = Math.hypot(px - (s.ax + (s.bx - s.ax) * k), py - (s.ay + (s.by - s.ay) * k));
          if (d < best) {
            best = d;
            bestT = s.t0 + k * s.len;
          }
        }
        if (best > r) continue;
        const mat = typeof o.mat === "function" ? o.mat(bestT, total) : o.mat;
        this.put(x, y, { mat, kind: o.kind, u: 0, v: bestT, edge: !!o.edge }, id);
      }
  }

  /** 볼록 다각형 (귀) */
  poly(o: { pts: [number, number][]; kind: Kind; mat: Mat | ((x: number, y: number) => Mat); edge?: boolean }): void {
    const id = this.nextId++;
    const xs = o.pts.map((p) => p[0]);
    const ys = o.pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        if (!insidePoly(x + 0.5, y + 0.5, o.pts)) continue;
        const mat = typeof o.mat === "function" ? o.mat(x, y) : o.mat;
        this.put(x, y, { mat, kind: o.kind, u: x, v: y, edge: !!o.edge }, id);
      }
  }

  /** 칸 하나를 직접 (눈·코·입·무늬) */
  dot(x: number, y: number, mat: Mat): void {
    const prev = this.px[y * N + x];
    this.put(x, y, { mat, kind: prev?.kind ?? "none", u: prev?.u ?? 0, v: prev?.v ?? 0, edge: false }, prev?.id ?? this.nextId++);
  }

  /** 바닥 그림자 (고양이 그림 아래에만 보임) */
  ground(cx: number, rx: number): void {
    for (let y = 29; y <= 31; y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x + 0.5 - cx) / rx) ** 2 + ((y - 30) / 1.3) ** 2;
        if (d <= 1 && x >= 0 && x < N) this.shadow[y * N + x] = 1;
      }
  }
}

function insidePoly(x: number, y: number, pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** 부위 안 좌표로 정하는 줄무늬: 0 없음, 1 옅게, 2 진하게 */
function stripeOf(p: Px, view: CatView): 0 | 1 | 2 {
  switch (p.kind) {
    case "body":
      if (view === "side") {
        // 고등어 무늬: 등에서 배 쪽으로 살짝 기운 세로 줄 + 진한 등줄
        if (p.v < -2.6) return 2;
        if (p.v > 1.8) return 0;
        return mod(p.u + p.v * 0.55 + 40, 3.6) < 1.15 ? 2 : 0;
      }
      // 앞·뒤에서 보면 몸통을 감싸는 가로 줄
      return mod(p.v + p.u * p.u * 0.06 + 40, 3.2) < 1.05 ? 2 : Math.abs(p.u) < 0.8 && view === "up" ? 1 : 0;
    case "bodyFront":
      return mod(p.v + p.u * p.u * 0.08 + 40, 3) < 1 ? 2 : 0;
    case "leg":
      return p.v < 4.5 && mod(p.v, 2.6) < 0.9 ? 1 : 0;
    case "tail":
      return mod(p.v, 2.8) < 1.1 ? 2 : 0;
    case "head":
      return 0; // 머리 무늬는 자세마다 직접 찍는다 (이마 M, 눈꼬리 줄)
    case "ear":
    case "none":
      return 0;
  }
}

function render(f: Frame, view: CatView): Canvas {
  const out = new Canvas(N, N);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? null : f.px[y * N + x]!);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (f.shadow[y * N + x]) out.set(x, y, C.shadow);
      const p = at(x, y);
      if (!p) continue;
      const below = at(x, y + 1);
      const above = at(x, y - 1);
      const bottomEdge = !below || (below.id !== p.id && below.mat !== p.mat && below.kind !== "head");
      const topEdge = !above;
      // 앞에 놓인 부위의 경계: 뒤 부위와 맞닿은 칸을 진하게 (다리·머리 윤곽이 몸통에 묻히지 않게)
      const behind = p.edge && [at(x - 1, y), at(x + 1, y), above, below].some((q) => q && q.id < p.id && q.mat !== "line");
      let c: RGBA;
      switch (p.mat) {
        case "fur": {
          const s = stripeOf(p, view);
          if (behind) c = C.stripeSoft;
          else if (s === 2) c = C.stripe;
          else if (s === 1) c = C.stripeSoft;
          else if (bottomEdge) c = C.furShade;
          else if (topEdge) c = C.furLight;
          else c = C.fur;
          break;
        }
        case "far":
          c = stripeOf(p, view) ? C.farStripe : C.far;
          break;
        case "white":
          c = behind ? C.whiteShade : bottomEdge ? C.whiteShade : C.white;
          break;
        case "farWhite":
          c = C.farWhite;
          break;
        case "stripe":
          c = C.stripe;
          break;
        case "eye":
          c = C.eye;
          break;
        case "eyeDark":
          c = C.eyeDark;
          break;
        case "eyeLight":
          c = C.eyeLight;
          break;
        case "pupil":
          c = C.pupil;
          break;
        case "nose":
          c = C.nose;
          break;
        case "ear":
          c = C.earPink;
          break;
        case "mouth":
          c = C.mouth;
          break;
        case "line":
          c = C.outline;
          break;
      }
      out.set(x, y, c);
    }
  // 바깥 윤곽선: 고양이 칸에 붙은 빈 칸 (그림자 위에도)
  const filled = (x: number, y: number) => !!at(x, y);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (filled(x, y)) continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) out.set(x, y, C.outline);
    }
  return out;
}

// ---------------------------------------------------------------------------
// 부위 그리기 도우미 (옆모습은 오른쪽을 본다)

/** 다리: 엉덩이·어깨(hip) → 발(foot). 아래 2칸은 흰 발 (앞다리는 전부 흰색) */
function leg(f: Frame, hip: [number, number], foot: [number, number], o: { far?: boolean; white?: "all" | "paw"; knee?: [number, number]; w?: number }): void {
  const pts: [number, number][] = o.knee ? [hip, o.knee, foot] : [hip, foot];
  const whiteMat: Mat = o.far ? "farWhite" : "white";
  const furMat: Mat = o.far ? "far" : "fur";
  f.line({
    pts,
    w: o.w ?? 2.2,
    kind: "leg",
    edge: !o.far,
    mat: (t, len) => (o.white === "all" || len - t < 2.2 ? whiteMat : furMat),
  });
}

/** front: 몸 앞에 오는 꼬리 (몸과 맞닿은 칸에 진한 선을 넣어 구분) */
/** puff: 놀라서 부푼 꼬리 (굵게) */
function tail(f: Frame, pts: [number, number][], o: { far?: boolean; front?: boolean; puff?: boolean } = {}): void {
  f.line({ pts, w: o.puff ? 3.4 : 2.3, kind: "tail", edge: o.front, mat: (t, len) => (len - t < 1.6 ? "stripe" : o.far ? "far" : "fur") });
}

/** 옆모습 머리 (cx, cy 가 머리 가운데). eyes: open / half / closed, mouth: 0 닫힘 ~ 2 크게 */
function headSide(f: Frame, cx: number, cy: number, o: { eyes?: "open" | "half" | "closed"; earBack?: boolean; mouth?: number; tilt?: number } = {}): void {
  const t = o.tilt ?? 0;
  // 뒤쪽 귀 → 머리 → 앞쪽 귀
  f.poly({ pts: [[cx - 4, cy - 2.5 + t], [cx - 2.8, cy - 7 + t], [cx - 1, cy - 3.5 + t]], kind: "ear", mat: "far" });
  f.ellipse({
    cx,
    cy,
    rx: 4.6,
    ry: 4.3,
    kind: "head",
    edge: true,
    // 주둥이·볼·턱은 흰 털 (사진: 코 아래부터 턱·가슴까지 흰색)
    mat: (u, v) => (u > 1.2 && v > 0.6) || (v > 2.4 && u > -1.5) ? "white" : "fur",
  });
  const earTop = o.earBack ? [cx + 0.2, cy - 6.2 + t] : [cx + 0.6, cy - 7.6 + t];
  f.poly({ pts: [[cx - 1.6, cy - 3 + t], earTop as [number, number], [cx + 2.6, cy - 3 + t]], kind: "ear", edge: true, mat: (x, y) => (y >= cy - 5 + t && x >= cx - 0.5 && x <= cx + 1 ? "ear" : "fur") });
  const ex = Math.round(cx + 1.5);
  const ey = Math.round(cy - 1);
  // 이마·눈꼬리 줄무늬
  f.dot(Math.round(cx - 1), Math.round(cy - 3), "stripe");
  f.dot(Math.round(cx - 2), Math.round(cy - 2), "stripe");
  f.dot(Math.round(cx - 3), Math.round(cy - 1), "stripe");
  f.dot(Math.round(cx - 2), Math.round(cy + 1), "stripe");
  f.dot(Math.round(cx - 3), Math.round(cy + 1), "stripe");
  if (o.eyes === "closed") {
    f.dot(ex, ey + 1, "line");
    f.dot(ex + 1, ey + 1, "line");
  } else if (o.eyes === "half") {
    f.dot(ex, ey, "line");
    f.dot(ex + 1, ey, "line");
    f.dot(ex, ey + 1, "eye");
    f.dot(ex + 1, ey + 1, "pupil");
  } else {
    f.dot(ex, ey, "eyeDark");
    f.dot(ex + 1, ey, "pupil");
    f.dot(ex, ey + 1, "eye");
    f.dot(ex + 1, ey + 1, "pupil");
  }
  // 코·입
  const nx = Math.round(cx + 4.4);
  const ny = Math.round(cy + 0.4);
  f.dot(nx, ny, "nose");
  if ((o.mouth ?? 0) > 0) {
    f.dot(nx - 1, ny + 2, "mouth");
    if ((o.mouth ?? 0) > 1) f.dot(nx - 1, ny + 3, "mouth");
  } else f.dot(nx - 1, ny + 1, "line");
}

/** 앞모습 머리. 이마 M 무늬, 양 볼 줄, 초록 눈 두 개, 분홍 코, 흰 주둥이 */
/** flat: 놀라서 귀를 옆으로 젖힌 정도 (px) */
function headFront(f: Frame, cx: number, cy: number, o: { eyes?: "open" | "half" | "closed"; mouth?: number; tilt?: number; lookUp?: boolean; flat?: number } = {}): void {
  const tl = o.tilt ?? 0;
  const fl = o.flat ?? 0;
  f.poly({ pts: [[cx - 5, cy - 1.5 + tl], [cx - 4.3 - fl * 0.8, cy - 7.2 + tl + fl], [cx - 0.8, cy - 3.8]], kind: "ear", edge: true, mat: (x, y) => (x >= cx - 4 - fl * 0.5 && x <= cx - 3 && y >= cy - 5 + tl + fl * 0.6 ? "ear" : "fur") });
  f.poly({ pts: [[cx + 0.8, cy - 3.8], [cx + 4.3 + fl * 0.8, cy - 7.2 - tl + fl], [cx + 5, cy - 1.5 - tl]], kind: "ear", edge: true, mat: (x, y) => (x >= cx + 2 && x <= cx + 3 + fl * 0.5 && y >= cy - 5 - tl + fl * 0.6 ? "ear" : "fur") });
  f.ellipse({ cx, cy, rx: 5.2, ry: 4.6, kind: "head", edge: true, mat: (u, v) => (v > 1 && Math.abs(u) < 2.8) || v > 3 ? "white" : "fur" });
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  // 이마 무늬: 눈 위로 한 칸 띄운 줄 + 미간의 세로줄 (눈과 붙으면 눈썹처럼 무거워 보인다)
  for (const [dx, dy] of [[-3, -4], [-1, -4], [0, -4], [2, -4], [-1, -3], [0, -3]] as const) f.dot(x0 + dx, y0 + dy, "stripe");
  // 볼 줄무늬
  for (const [dx, dy] of [[-5, 0], [-4, 1], [4, 0], [3, 1]] as const) f.dot(x0 + dx, y0 + dy, "stripe");
  // 눈: 3x3 (위는 진한 연두, 가운데 밝은 연두 + 세로 동공, 왼쪽 위 흰 반짝임). 코(x0-1, x0)를 가운데 두고 좌우 대칭
  const lidY = y0 - 2 + (o.lookUp ? -1 : 0);
  for (const ex of [x0 - 4, x0 + 1]) {
    if (o.eyes === "closed") {
      // 웃는 듯 감은 눈 (∪)
      f.dot(ex, lidY + 1, "line");
      f.dot(ex + 1, lidY + 2, "line");
      f.dot(ex + 2, lidY + 1, "line");
    } else if (o.eyes === "half") {
      for (let i = 0; i < 3; i++) f.dot(ex + i, lidY + 1, "line");
      f.dot(ex, lidY + 2, "eye");
      f.dot(ex + 1, lidY + 2, "pupil");
      f.dot(ex + 2, lidY + 2, "eye");
    } else {
      for (let i = 0; i < 3; i++) f.dot(ex + i, lidY, "eyeDark");
      f.dot(ex, lidY + 1, "eyeLight");
      f.dot(ex + 1, lidY + 1, "pupil");
      f.dot(ex + 2, lidY + 1, "eye");
      f.dot(ex, lidY + 2, "eye");
      f.dot(ex + 1, lidY + 2, "pupil");
      f.dot(ex + 2, lidY + 2, "eye");
    }
  }
  f.dot(x0, y0 + 1, "nose");
  f.dot(x0 - 1, y0 + 1, "nose");
  const m = o.mouth ?? 0;
  if (m === 0) {
    f.dot(x0 - 2, y0 + 2, "line");
    f.dot(x0 + 1, y0 + 2, "line");
  } else {
    f.dot(x0 - 1, y0 + 2, "mouth");
    f.dot(x0, y0 + 2, "mouth");
    if (m > 1) {
      f.dot(x0 - 1, y0 + 3, "mouth");
      f.dot(x0, y0 + 3, "mouth");
    }
  }
}

/** 뒷모습 머리: 귀 뒷면, 뒤통수 줄무늬 */
function headBack(f: Frame, cx: number, cy: number): void {
  f.poly({ pts: [[cx - 5, cy - 1.5], [cx - 4.3, cy - 7.2], [cx - 0.8, cy - 3.8]], kind: "ear", edge: true, mat: "fur" });
  f.poly({ pts: [[cx + 0.8, cy - 3.8], [cx + 4.3, cy - 7.2], [cx + 5, cy - 1.5]], kind: "ear", edge: true, mat: "fur" });
  // 뒤통수: 정수리에서 목덜미로 둥글게 감기는 가로줄 3개
  f.ellipse({ cx, cy, rx: 5.1, ry: 4.6, kind: "head", edge: true, mat: (u, v) => (mod(v + u * u * 0.09 + 40, 2.6) < 0.9 && v > -3.6 ? "stripe" : "fur") });
}

/** 옆모습 몸통 (배·가슴 아래쪽은 흰 털) */
function bodySide(f: Frame, cx: number, cy: number, rx: number, ry: number, rot = 0): void {
  f.ellipse({ cx, cy, rx, ry, rot, kind: "body", mat: (u, v) => (v > ry - 1.4 && u > -rx * 0.35) || (u > rx - 3.2 && v > -0.5) ? "white" : "fur" });
}

// ---------------------------------------------------------------------------
// 자세 (옆모습은 오른쪽을 본다). k = 프레임 번호 0–3

type Pose = (f: Frame, k: number) => void;

const standSide: Pose = (f, k) => {
  f.ground(15, 10);
  tail(f, [[7.5, 19], [4.6, 17], [3.6, 14], [4, 11 - (k % 2)], [5.6 + (k === 1 ? 1 : 0), 9.4 - (k % 2)]]);
  leg(f, [21, 22], [21.5, 29], { far: true, white: "all" });
  leg(f, [9.5, 22], [9.5, 29], { far: true, white: "paw" });
  bodySide(f, 15, 20.5, 8.5, 4.2);
  f.ellipse({ cx: 10, cy: 21.5, rx: 3.4, ry: 3.4, kind: "leg", edge: true, mat: "fur" });
  leg(f, [11, 23], [11.5, 29], { white: "paw" });
  leg(f, [19.5, 22], [19.5, 29], { white: "all" });
  headSide(f, 24.4, 14.6, { eyes: k === 2 ? "closed" : "open" });
};

/** 걷기: 대각선 다리 짝이 번갈아 나간다. 지나가는 프레임(1·3)은 한쪽 발을 든다 */
const walkSide: Pose = (f, k) => {
  f.ground(15, 10);
  const sw = [2, 0, -2, 0][k]!;
  const liftA = k === 1; // 앞 가까운 발 + 뒤 먼 발
  const liftB = k === 3;
  tail(f, [[7.5, 19], [4.6, 17.5], [3.4, 15], [3.6 + (k % 2), 12], [5 + (k % 2), 10.4]]);
  leg(f, [21, 22], [21.5 - sw + (liftB ? 0.5 : 0), liftB ? 28 : 29], { far: true, white: "all" });
  leg(f, [9.5, 22], [9.5 + sw + (liftA ? 0.5 : 0), liftA ? 28 : 29], { far: true, white: "paw" });
  bodySide(f, 15, 20.5 - (k % 2) * 0.4, 8.5, 4.2);
  f.ellipse({ cx: 10, cy: 21.5, rx: 3.4, ry: 3.4, kind: "leg", edge: true, mat: "fur" });
  leg(f, [11, 23], [11.5 - sw + (liftB ? 0.5 : 0), liftB ? 28 : 29], { white: "paw" });
  leg(f, [19.5, 22], [19.5 + sw + (liftA ? 0.5 : 0), liftA ? 28 : 29], { white: "all" });
  headSide(f, 24.6, 14.6 + (k % 2) * 0.4, {});
};

/** 뛰기 (갤럽): 모으기 → 쭉 뻗기(공중) → 앞발 착지 → 뒷발 모으기. 몸이 위아래로 크게 출렁 */
const runSide: Pose = (f, k) => {
  const P = [
    { body: [15, 20.2, 7.6, 4.5, -0.08], head: [24, 15.6], ff: [[19, 22], [16.5, 28.5]], fn: [[20, 22], [18, 29]], hf: [[10, 21], [14, 28]], hn: [[11, 22], [15.5, 29]], tail: [[7.5, 19], [4, 18], [1.5, 16.5]] },
    { body: [15, 18.6, 9.6, 3.8, 0], head: [25.6, 14], ff: [[21, 20], [27, 25]], fn: [[22, 20.5], [28.5, 23.5]], hf: [[9, 20], [3, 25]], hn: [[10, 20.5], [4, 26.5]], tail: [[5.5, 17.5], [2.5, 16.5], [0.5, 15]] },
    { body: [15, 19.4, 8.8, 4.1, 0.1], head: [24.8, 15.8], ff: [[21, 22], [23.5, 29]], fn: [[22, 22], [25, 29]], hf: [[9, 21], [7, 27]], hn: [[10, 21.5], [9.5, 28]], tail: [[6.5, 18.5], [3.5, 17], [1, 15.5]] },
    { body: [15, 20, 8, 4.3, -0.05], head: [24.3, 15.2], ff: [[20, 22], [19.5, 29]], fn: [[21, 22], [21.5, 28.5]], hf: [[10, 21], [12, 29]], hn: [[11, 22], [13.5, 29]], tail: [[7, 19], [3.5, 18], [1, 17]] },
  ][k]!;
  f.ground(15, 9);
  tail(f, P.tail as [number, number][]);
  leg(f, P.ff[0] as [number, number], P.ff[1] as [number, number], { far: true, white: "all" });
  leg(f, P.hf[0] as [number, number], P.hf[1] as [number, number], { far: true, white: "paw" });
  const [bx, by, brx, bry, rot] = P.body;
  bodySide(f, bx!, by!, brx!, bry!, rot);
  f.ellipse({ cx: bx! - 5, cy: by! + 1, rx: 3.3, ry: 3.2, kind: "leg", edge: true, mat: "fur" });
  leg(f, P.hn[0] as [number, number], P.hn[1] as [number, number], { white: "paw" });
  leg(f, P.fn[0] as [number, number], P.fn[1] as [number, number], { white: "all" });
  headSide(f, P.head[0]!, P.head[1]!, { earBack: true });
};

const sitSide: Pose = (f, k) => {
  f.ground(14, 8.5);
  // 꼬리는 앉은 발 앞으로 감는다. 끝이 살짝 까딱
  tail(f, [[7, 26.5], [6.2, 28.8], [9, 29.6], [14, 29.6], [17.5 + (k === 1 ? 0.6 : 0), 28.6 - (k === 1 || k === 2 ? 1 : 0)]]);
  leg(f, [17, 21], [17, 29], { far: true, white: "all" });
  f.ellipse({ cx: 12, cy: 24.6, rx: 5.6, ry: 5, kind: "body", mat: (u, v) => (v > 3.2 && u > -1 ? "white" : "fur") });
  f.ellipse({ cx: 16.6, cy: 19.4, rx: 4.2, ry: 6, rot: 0.25, kind: "body", mat: (u, v) => (u > 1.2 && v > -4 ? "white" : "fur") });
  f.ellipse({ cx: 14.6, cy: 28.6, rx: 2.2, ry: 1.1, kind: "leg", mat: "white" });
  leg(f, [18.6, 21], [18.8, 29], { white: "all" });
  headSide(f, 18.8, 10.8, { eyes: k === 2 ? "closed" : "open" });
};

/** 식빵 자세: 엎드려 앞발을 몸 밑에 넣고 고개를 든다. 숨쉬기 + 느린 눈 깜빡임 */
const loafSide: Pose = (f, k) => {
  f.ground(15, 10);
  tail(f, [[6.4, 27], [6, 29], [10, 29.6], [17, 29.6]]);
  const br = k % 2 === 1 ? 0.35 : 0;
  bodySide(f, 14.6, 25.4 - br, 9, 4.1 + br);
  f.ellipse({ cx: 22, cy: 28.8, rx: 2.4, ry: 1, kind: "leg", mat: "white" });
  headSide(f, 22.6, 19.4, { eyes: k === 2 ? "half" : "open" });
};

/** 몸을 말고 잔다: 머리를 앞으로 묻고 꼬리로 감싼다. 숨쉬며 등이 오르내림 */
const sleepSide: Pose = (f, k) => {
  f.ground(15.5, 10.5);
  const br = k === 1 || k === 2 ? 0.6 : 0;
  // 등을 둥글게 만 몸 (배는 안 보임)
  f.ellipse({ cx: 13.6, cy: 25.6 - br, rx: 8.6, ry: 4 + br, rot: -0.04, kind: "body", mat: "fur" });
  // 머리: 몸 앞쪽 위에 얹고 코를 꼬리 쪽으로 묻는다. 귀 두 개, 감은 눈
  f.poly({ pts: [[18.4, 21.6], [19.2, 17.4], [21.4, 20.6]], kind: "ear", edge: true, mat: (x, y) => (y >= 19 && x >= 19 && x <= 20 ? "ear" : "fur") });
  f.poly({ pts: [[22.2, 20.4], [24.6, 17.6], [25.4, 21.4]], kind: "ear", edge: true, mat: "fur" });
  f.ellipse({ cx: 22, cy: 24.2, rx: 4.6, ry: 3.9, kind: "head", edge: true, mat: (u, v) => (v > 1.2 && u > -1.5 ? "white" : "fur") });
  for (const [x, y] of [[20, 21], [21, 21], [22, 21], [21, 22]] as const) f.dot(x, y, "stripe");
  f.dot(19, 24, "line");
  f.dot(20, 24, "line");
  f.dot(23, 24, "line");
  f.dot(24, 24, "line");
  f.dot(22, 25, "nose");
  // 꼬리로 앞을 감싼다 (끝이 코 앞)
  tail(f, [[5.4, 25.5], [5.6, 28.6], [10, 29.7], [17, 29.7], [21.5, 29]], { front: true });
};

/** 기지개: 서 있다가 앞발을 쭉 뻗고 가슴을 낮추고 엉덩이를 든다 → 다시 섬 (0 → 1 → 2 → 1) */
const stretchSide: Pose = (f, k) => {
  if (k === 0) return standSide(f, 0);
  const full = k === 2;
  f.ground(16, 11);
  tail(f, full ? [[7.5, 17], [6.5, 13], [6.8, 9], [8, 6.5]] : [[7.5, 18], [5.5, 15], [5, 12], [6, 9.5]]);
  leg(f, [9.5, 20], [8.5, 29], { far: true, white: "paw" });
  leg(f, [20, 23], full ? [27, 29] : [24.5, 29], { far: true, white: "all" });
  bodySide(f, 15, full ? 21.5 : 21, 8.6, 4, full ? 0.32 : 0.16);
  f.ellipse({ cx: 10, cy: full ? 18.8 : 19.8, rx: 3.3, ry: 3.4, kind: "leg", edge: true, mat: "fur" });
  leg(f, [11, 21], [10.5, 29], { white: "paw" });
  leg(f, [20.5, 24], full ? [28.5, 29] : [25.5, 29], { white: "all" });
  headSide(f, full ? 24.2 : 24.4, full ? 21.4 : 18, { eyes: full ? "closed" : "half", mouth: full ? 2 : 0 });
};

// ---- 앞모습 (down) ----

const standDown: Pose = (f, k) => {
  f.ground(16, 7.5);
  tail(f, [[20.5, 24], [23, 22.5], [24.2, 19.6], [23.6 - (k % 2), 17]]);
  leg(f, [12, 23], [11.8, 29], { far: true, white: "paw" });
  leg(f, [20, 23], [20.2, 29], { far: true, white: "paw" });
  f.ellipse({ cx: 16, cy: 21.5, rx: 5.6, ry: 4, kind: "body", mat: "fur" });
  f.ellipse({ cx: 16, cy: 21.4, rx: 3.3, ry: 3.8, kind: "bodyFront", mat: "white" });
  leg(f, [14.2, 22], [14.2, 29], { white: "all" });
  leg(f, [17.8, 22], [17.8, 29], { white: "all" });
  headFront(f, 16, 13.8, { eyes: k === 2 ? "closed" : "open" });
};

const walkDown: Pose = (f, k) => {
  f.ground(16, 7.5);
  const la = k === 1;
  const lb = k === 3;
  const sway = [0, -0.4, 0, 0.4][k]!;
  tail(f, [[20.5, 24], [23, 22.5], [24 + (k % 2), 19.6], [23.4, 17]]);
  leg(f, [12, 23], [11.8, lb ? 27.6 : 29], { far: true, white: "paw" });
  leg(f, [20, 23], [20.2, la ? 27.6 : 29], { far: true, white: "paw" });
  f.ellipse({ cx: 16 + sway, cy: 21.5, rx: 5.6, ry: 4, kind: "body", mat: "fur" });
  f.ellipse({ cx: 16 + sway, cy: 21.4, rx: 3.3, ry: 3.8, kind: "bodyFront", mat: "white" });
  leg(f, [14.2, 22], [14.2, la ? 27.4 : 29], { white: "all" });
  leg(f, [17.8, 22], [17.8, lb ? 27.4 : 29], { white: "all" });
  headFront(f, 16 + sway, 13.8 + (k % 2) * 0.4, {});
};

/** 앞모습 뛰기: 걷기보다 발을 높이 들고 몸이 출렁 */
const runDown: Pose = (f, k) => {
  f.ground(16, 7);
  const up = k % 2 === 1 ? -1.2 : 0;
  tail(f, [[20.5, 23 + up], [23.5, 21.5 + up], [25, 19 + up]]);
  leg(f, [12, 23 + up], [11.5, k === 1 ? 26.8 : 29], { far: true, white: "paw" });
  leg(f, [20, 23 + up], [20.5, k === 3 ? 26.8 : 29], { far: true, white: "paw" });
  f.ellipse({ cx: 16, cy: 21.2 + up, rx: 5.5, ry: 4, kind: "body", mat: "fur" });
  f.ellipse({ cx: 16, cy: 21.1 + up, rx: 3.3, ry: 3.8, kind: "bodyFront", mat: "white" });
  leg(f, [14.2, 22 + up], [13.6, k === 3 ? 26.4 : 29], { white: "all" });
  leg(f, [17.8, 22 + up], [18.4, k === 1 ? 26.4 : 29], { white: "all" });
  headFront(f, 16, 14.4 + up, {});
};

const sitDown: Pose = (f, k) => {
  f.ground(16, 8);
  f.ellipse({ cx: 16, cy: 25.4, rx: 7, ry: 4.4, kind: "body", mat: "fur" });
  f.ellipse({ cx: 10.6, cy: 28.8, rx: 2, ry: 1.1, kind: "leg", mat: "white" });
  f.ellipse({ cx: 21.4, cy: 28.8, rx: 2, ry: 1.1, kind: "leg", mat: "white" });
  f.ellipse({ cx: 16, cy: 19.8, rx: 4.8, ry: 6, kind: "body", mat: "fur" });
  f.ellipse({ cx: 16, cy: 20.6, rx: 3, ry: 5, kind: "bodyFront", mat: "white" });
  leg(f, [14.6, 21], [14.4, 29], { white: "all" });
  leg(f, [17.4, 21], [17.6, 29], { white: "all" });
  tail(f, [[22, 26], [23.4, 28.6], [21, 29.7], [16 - (k === 1 ? 1 : 0), 29.8], [11.5 - (k === 1 ? 1 : 0), 29.4]]);
  headFront(f, 16, 11.8, { eyes: k === 2 ? "closed" : "open" });
};

/** 그루밍: 앉아서 앞발을 들어 핥는다 (고개를 숙였다 들었다) */
const groomDown: Pose = (f, k) => {
  f.ground(16, 8);
  f.ellipse({ cx: 16, cy: 25.4, rx: 7, ry: 4.4, kind: "body", mat: "fur" });
  f.ellipse({ cx: 10.6, cy: 28.8, rx: 2, ry: 1.1, kind: "leg", mat: "white" });
  f.ellipse({ cx: 21.4, cy: 28.8, rx: 2, ry: 1.1, kind: "leg", mat: "white" });
  f.ellipse({ cx: 16, cy: 19.8, rx: 4.8, ry: 6, kind: "body", mat: "fur" });
  f.ellipse({ cx: 16, cy: 20.6, rx: 3, ry: 5, kind: "bodyFront", mat: "white" });
  leg(f, [17.4, 21], [17.6, 29], { white: "all" });
  tail(f, [[22, 26], [23.4, 28.6], [21, 29.7], [16, 29.8], [11.5, 29.4]]);
  const down = k === 1 || k === 3 ? 1 : 0;
  headFront(f, 15.6, 12.4 + down, { eyes: "closed", mouth: k === 2 ? 0 : 1, tilt: 0.6 });
  // 든 앞발: 가슴 밖 왼쪽으로 꺾어 올려 입에 댄다 (흰 가슴에 묻히지 않게 털 색 팔 + 흰 발)
  f.line({ pts: [[13.2, 22], [10.6, 20], [11.4, 16.8 + down]], w: 2.2, kind: "leg", edge: true, mat: (t, len) => (len - t < 2.4 ? "white" : "fur") });
  if (k !== 2) f.dot(12, 16 + down, "mouth");
};

/** 냐옹: 앉아서 고개를 살짝 들고 입을 벌린다 (0 닫힘 → 1 조금 → 2·3 크게) */
const meowDown: Pose = (f, k) => {
  f.ground(16, 8);
  f.ellipse({ cx: 16, cy: 25.4, rx: 7, ry: 4.4, kind: "body", mat: "fur" });
  f.ellipse({ cx: 10.6, cy: 28.8, rx: 2, ry: 1.1, kind: "leg", mat: "white" });
  f.ellipse({ cx: 21.4, cy: 28.8, rx: 2, ry: 1.1, kind: "leg", mat: "white" });
  f.ellipse({ cx: 16, cy: 19.8, rx: 4.8, ry: 6, kind: "body", mat: "fur" });
  f.ellipse({ cx: 16, cy: 20.6, rx: 3, ry: 5, kind: "bodyFront", mat: "white" });
  leg(f, [14.6, 21], [14.4, 29], { white: "all" });
  leg(f, [17.4, 21], [17.6, 29], { white: "all" });
  tail(f, [[22, 26], [23.4, 28.6], [21, 29.7], [16, 29.8], [11.5, 29.4]]);
  headFront(f, 16, 11.4 - (k > 0 ? 0.6 : 0), { mouth: [0, 1, 2, 2][k]!, eyes: k >= 2 ? "half" : "open", lookUp: k > 0 });
};

const loafDown: Pose = (f, k) => {
  f.ground(16, 9);
  const br = k % 2 === 1 ? 0.35 : 0;
  f.ellipse({ cx: 16, cy: 25.8 - br, rx: 8, ry: 3.9 + br, kind: "body", mat: (u, v) => (Math.abs(u) < 2.6 && v > 0.5 ? "white" : "fur") });
  f.ellipse({ cx: 14, cy: 29, rx: 1.6, ry: 0.9, kind: "leg", mat: "white" });
  f.ellipse({ cx: 18, cy: 29, rx: 1.6, ry: 0.9, kind: "leg", mat: "white" });
  tail(f, [[22.5, 27], [24, 29.2], [21, 29.8]]);
  headFront(f, 16, 19.6, { eyes: k === 2 ? "half" : "open" });
};

// ---- 뒷모습 (up) ----

/** 뒷모습 몸: 위는 좁고(어깨) 아래는 넓은(엉덩이) 배 모양 */
function bodyBack(f: Frame, cx: number, cy: number): void {
  f.ellipse({ cx, cy: cy + 2.6, rx: 5.8, ry: 3.6, kind: "body", mat: "fur" });
  // 어깨: 머리 아래에 맞닿는 곳에 진한 선 (목 경계)
  f.ellipse({ cx, cy: cy - 1, rx: 4.2, ry: 3.4, kind: "body", edge: true, mat: "fur" });
}

/** 뒷모습 꼬리: 엉덩이에서 오른쪽으로 휘어 올라간다. 몸 앞에 그리고 윤곽을 넣는다 */
function tailBack(f: Frame, cx: number, cy: number, k: number, up = false): void {
  const s = k % 2;
  const pts: [number, number][] = up
    ? [[cx + 0.6, cy + 3], [cx + 1.2, cy - 1], [cx + 1.8, cy - 5]]
    : [[cx + 0.5, cy + 3.2], [cx + 4.6, cy + 1], [cx + 6.8 + s * 0.6, cy - 2.6], [cx + 6.4 + s, cy - 6.4]];
  tail(f, pts, { front: true });
}

const standUp: Pose = (f, k) => {
  f.ground(16, 7.5);
  headBack(f, 16, 12.6);
  leg(f, [13, 25], [12.8, 29], { white: "paw", w: 2.4 });
  leg(f, [19, 25], [19.2, 29], { white: "paw", w: 2.4 });
  bodyBack(f, 16, 20.8);
  tailBack(f, 16, 20.8, k);
};

const walkUp: Pose = (f, k) => {
  f.ground(16, 7.5);
  const sway = [0, -0.4, 0, 0.4][k]!;
  headBack(f, 16 - sway, 12.6 + (k % 2) * 0.4);
  leg(f, [13, 25], [12.8, k === 1 ? 28 : 29], { white: "paw", w: 2.4 });
  leg(f, [19, 25], [19.2, k === 3 ? 28 : 29], { white: "paw", w: 2.4 });
  bodyBack(f, 16 + sway, 20.8);
  tailBack(f, 16 + sway, 20.8, k);
};

const runUp: Pose = (f, k) => {
  f.ground(16, 7);
  const up = k % 2 === 1 ? -1.2 : 0;
  headBack(f, 16, 13.2 + up);
  leg(f, [13, 25 + up], [12.4, k === 1 ? 27 : 29], { white: "paw", w: 2.4 });
  leg(f, [19, 25 + up], [19.6, k === 3 ? 27 : 29], { white: "paw", w: 2.4 });
  bodyBack(f, 16, 20.6 + up);
  tailBack(f, 16, 20.6 + up, k, true);
};

const sitUp: Pose = (f, k) => {
  f.ground(16, 8);
  headBack(f, 16, 11.2);
  f.ellipse({ cx: 16, cy: 25.2, rx: 7, ry: 4.6, kind: "body", mat: "fur" });
  f.ellipse({ cx: 16, cy: 19, rx: 4.6, ry: 5.2, kind: "body", mat: "fur" });
  tail(f, [[17, 28.4], [20, 29.6], [23, 29.3], [24.6 - (k === 1 ? 0.6 : 0), 27.6 - (k === 1 ? 0.8 : 0)]], { front: true });
};

// ---- 깜짝 뒤로 폴짝 (hop): 웅크림 → 공중(몸이 떠오르고 꼬리가 부풂) → 가장 높이 → 착지. 사람 쪽을 본 채로 뒤로 뛴다 ----

/** 프레임별 떠오른 높이, 웅크린 정도 (px) */
const HOP_LIFT = [0, 3.5, 5, 0.5] as const;
const HOP_CROUCH = [1.5, 0, 0, 1] as const;

const hopSide: Pose = (f, k) => {
  const lift = HOP_LIFT[k]!;
  const cr = HOP_CROUCH[k]!;
  const air = lift > 1;
  f.ground(15, air ? 7.5 : 10);
  tail(f, [[7.5, 19.5 - lift + cr], [5.4, 15.5 - lift], [5.6, 11.5 - lift], [6.8, 8.4 - lift]], { puff: true });
  const by = 20.6 - lift + cr;
  // 공중에선 다리를 아래로 늘어뜨리고(먼 다리 → 몸 → 가까운 다리), 땅에선 웅크려 짧게
  const footY = air ? 29 - lift * 0.9 : 29;
  leg(f, [21, by + 1.5], [22, footY], { far: true, white: "all" });
  leg(f, [9.5, by + 1.5], [8.6, footY], { far: true, white: "paw" });
  bodySide(f, 15, by, 8.4, 4.2 - cr * 0.3, k === 1 ? -0.12 : k === 2 ? -0.05 : 0);
  f.ellipse({ cx: 10, cy: by + 1, rx: 3.4, ry: 3.3, kind: "leg", edge: true, mat: "fur" });
  leg(f, [11, by + 2.5], [10.2, footY], { white: "paw" });
  leg(f, [19.5, by + 1.5], [20.6, footY], { white: "all" });
  headSide(f, 24.4, 14.4 - lift + cr * 1.2, { earBack: true });
};

const hopDown: Pose = (f, k) => {
  const lift = HOP_LIFT[k]!;
  const cr = HOP_CROUCH[k]!;
  const air = lift > 1;
  f.ground(16, air ? 6 : 7.5);
  tail(f, [[20.5, 24 - lift + cr], [23.6, 21.6 - lift], [24.8, 18 - lift], [24, 14.6 - lift]], { puff: true });
  const footY = air ? 29 - lift * 0.9 : 29;
  leg(f, [12, 23 - lift + cr], [11.4, footY], { far: true, white: "paw" });
  leg(f, [20, 23 - lift + cr], [20.6, footY], { far: true, white: "paw" });
  f.ellipse({ cx: 16, cy: 21.5 - lift + cr, rx: 5.6, ry: 4 - cr * 0.3, kind: "body", mat: "fur" });
  f.ellipse({ cx: 16, cy: 21.4 - lift + cr, rx: 3.3, ry: 3.8 - cr * 0.3, kind: "bodyFront", mat: "white" });
  leg(f, [14.2, 22 - lift + cr], [13.6, footY], { white: "all" });
  leg(f, [17.8, 22 - lift + cr], [18.4, footY], { white: "all" });
  headFront(f, 16, 13.8 - lift + cr * 1.2, { flat: 1.6 });
};

const hopUp: Pose = (f, k) => {
  const lift = HOP_LIFT[k]!;
  const cr = HOP_CROUCH[k]!;
  const air = lift > 1;
  f.ground(16, air ? 6 : 7.5);
  const footY = air ? 29 - lift * 0.9 : 29;
  headBack(f, 16, 12.6 - lift + cr * 1.2);
  leg(f, [13, 25 - lift + cr], [12.4, footY], { white: "paw", w: 2.4 });
  leg(f, [19, 25 - lift + cr], [19.6, footY], { white: "paw", w: 2.4 });
  bodyBack(f, 16, 20.8 - lift + cr);
  tail(f, [[16.5, 23.6 - lift + cr], [19.6, 21 - lift], [21.6, 17 - lift], [21.4, 13.4 - lift]], { front: true, puff: true });
};

const POSES: Record<`${CatAction}-${CatView}`, Pose | undefined> = {
  "stand-side": standSide, "stand-down": standDown, "stand-up": standUp,
  "walk-side": walkSide, "walk-down": walkDown, "walk-up": walkUp,
  "run-side": runSide, "run-down": runDown, "run-up": runUp,
  "sit-side": sitSide, "sit-down": sitDown, "sit-up": sitUp,
  "loaf-side": loafSide, "loaf-down": loafDown, "loaf-up": undefined,
  "sleep-side": sleepSide, "sleep-down": undefined, "sleep-up": undefined,
  "groom-down": groomDown, "groom-side": undefined, "groom-up": undefined,
  "stretch-side": stretchSide, "stretch-down": undefined, "stretch-up": undefined,
  "meow-down": meowDown, "meow-side": undefined, "meow-up": undefined,
  "hop-side": hopSide, "hop-down": hopDown, "hop-up": hopUp,
};

function main(): void {
  const sheet = new Canvas(N * CAT_FRAMES_PER_ROW, N * CAT_SHEET_ROWS.length);
  CAT_SHEET_ROWS.forEach(([action, view], row) => {
    const pose = POSES[`${action}-${view}`];
    if (!pose) throw new Error(`고양이 자세 ${action}-${view} 이(가) 없습니다`);
    for (let k = 0; k < CAT_FRAMES_PER_ROW; k++) {
      const f = new Frame();
      pose(f, k);
      const cell = render(f, view);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const c = cell.get(x, y);
        if (c[3]) sheet.set(k * N + x, row * N + y, c);
      }
    }
  });
  const out = resolve(ROOT, "assets/sprites/animals/cat-tabby.png");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(sheet));
  console.log(`${out} (${sheet.width}x${sheet.height}, ${CAT_SHEET_ROWS.length}행)`);

  if (process.argv.includes("--preview")) {
    // 8배 확대 + 칸 구분 (검토용, 게임에서 쓰지 않음)
    const K = 6;
    const pv = new Canvas(sheet.width * K, sheet.height * K);
    for (let y = 0; y < pv.height; y++)
      for (let x = 0; x < pv.width; x++) {
        const sx = Math.floor(x / K);
        const sy = Math.floor(y / K);
        const c = sheet.get(sx, sy);
        const bg: RGBA = (Math.floor(sx / N) + Math.floor(sy / N)) % 2 ? [214, 222, 232, 255] : [236, 240, 244, 255];
        const a = c[3] / 255;
        pv.set(x, y, [Math.round(c[0] * a + bg[0] * (1 - a)), Math.round(c[1] * a + bg[1] * (1 - a)), Math.round(c[2] * a + bg[2] * (1 - a)), 255]);
      }
    const pvOut = resolve(ROOT, "assets/sprites/review/cat-preview.png");
    mkdirSync(dirname(pvOut), { recursive: true });
    writeFileSync(pvOut, encodePng(pv));
    console.log(pvOut);
  }
}

main();
