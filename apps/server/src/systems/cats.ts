import {
  CAT_SPEED,
  PET_RANGE_PX,
  TICK_RATE,
  TICK_SEC,
  facingToward,
  findPath,
  isBlockedTile,
  tileCenter,
  tileOf,
  type AnimalPlacement,
  type CatAction,
  type CatFx,
  type CollisionGrid,
  type Facing,
  type Vec2,
} from "@park/shared";
import { createLogger } from "../logger";
import { AnimalState, type ParkState, type PlayerState } from "../schema/ParkState";

const log = createLogger("cat");

const sec = (s: number) => Math.round(s * TICK_RATE);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

// ---- 성격 수치 (px, 초) ----
/** 이 거리 안의 사람만 살핀다 */
const NOTICE_PX = 260;
/** 다가오는 사람이 이 안이면 한 발짝 물러난다 (친밀도 WARY_TRUST 미만) */
const WARY_PX = 96;
/** 다가오는 사람이 이 안까지 오면 놀라서 도망 (친밀도 CALM_TRUST 미만) */
const STARTLE_PX = 44;
/** 친한 사람이라도 이만큼 바짝 붙으면 살짝 비켜선다 */
const BUMP_PX = 18;
/** 놀란 뒤 이 시간 동안은 잠들지 않고 식빵 자세도 덜 한다 (경계 중) */
const ALERT_SEC = 20;
/** 쉬거나 산책하는 중에도 이 간격으로 가만히 있는 사람을 살핀다 */
const CHECK_SOCIAL_SEC = 2;
/** 자고 있으면 이 안까지 다가와야 깬다 */
const WAKE_PX = 60;
/** 뒤로 폴짝 물러날 때 거리, 도망갈 때 거리 */
const STEP_AWAY_PX = 42;
const FLEE_PX = 150;
/** 이만큼 가만히 있는 사람에게 관심을 갖는다 (앉아 있으면 더 빨리) */
const STILL_SEC = 2.5;
const STILL_SEATED_SEC = 1;
/** 관심을 갖는 거리 */
const INVITE_PX = 256;
/** 이 거리까지 다가가면 도착 (옆에 앉음) */
const NEAR_PX = 36;
/** 다가갈 때 한 번에 걷는 칸 수 (그다음 멈칫하고 다시 살핀다) */
const APPROACH_STEP_TILES = 2;
/** 친밀도 기준 */
const WARY_TRUST = 0.5;
const CALM_TRUST = 0.75;
const FOLLOW_TRUST = 0.8;
const PET_TRUST = 0.25;
/** 친밀도가 오르는 양 */
const TRUST_ARRIVE = 0.08;
const TRUST_NEAR_PER_SEC = 0.01;
const TRUST_PET = 0.12;
const TRUST_PET_REFUSED = 0.03;
const TRUST_EMOTE = 0.05;
/** 친해지는 이모티콘 (하트·안녕·고마워) */
const FRIENDLY_EMOTES: ReadonlySet<string> = new Set(["heart", "hello", "thanks"]);
/** 한 번 길찾기에서 받아들이는 최대 칸 수 (너무 먼 곳은 포기) */
const MAX_PATH_TILES = 26;
/** 서버는 클라이언트 화면(보간 지연)만큼 조금 더 멀리서도 쓰다듬기를 받아 준다 */
const PET_RANGE_SERVER_PX = PET_RANGE_PX + 14;

/**
 * 고양이가 지금 하는 일. 그림(action)과는 다르다: 예를 들어 approach 는 걷기와 멈칫(앉기·서기)을 오간다.
 *   idle 둘러보기 · wander 산책 · rest 앉기/식빵/잠/그루밍 등 제자리 행동 · zoom 우다다
 *   stepAway 한 발짝 물러남 · flee 도망 · watch 사람을 돌아봄
 *   approach 다가가기 · pause 다가가다 멈칫 · near 사람 옆에 있음 · beg 간식 조르기 · petted 쓰다듬어지는 중 · follow 따라가기
 */
type Mode = "idle" | "wander" | "rest" | "zoom" | "stepAway" | "flee" | "watch" | "approach" | "pause" | "near" | "beg" | "petted" | "follow";

interface Seen {
  last: Vec2;
  lastDist: number;
  /** 연속으로 가만히 있던 틱 */
  stillTicks: number;
  /** 연속으로 다가오던 틱 */
  approachTicks: number;
}

interface Cat {
  readonly state: AnimalState;
  readonly place: AnimalPlacement;
  readonly home: Vec2;
  mode: Mode;
  /** 제자리 행동의 자세 (rest·near·pause·watch 등) */
  pose: CatAction;
  /** 이 틱이 되면 다음 할 일을 정한다 (움직이는 중이면 길이 끝날 때) */
  until: number;
  path: Vec2[];
  speed: number;
  /** 길 끝에서 할 일 */
  afterPath?: () => void;
  /** 지금 관심을 두는 사람 (sessionId) */
  focus?: string;
  /** userId → 친밀도 0–1 */
  readonly trust: Map<number, number>;
  readonly seen: Map<string, Seen>;
  /** 잠깐 다른 그림을 보여 주는 중 (조르며 냐옹 등): 이 틱까지 */
  flashUntil: number;
  flashAction?: CatAction;
  lastWaryTick: number;
  nextBegMeowTick: number;
  lastCuriousTick: number;
}

/**
 * 공원 고양이 (Phase 5A). 서버가 움직임과 행동을 정하고 AnimalState 로 모두에게 보낸다.
 *
 * 성격
 * - 혼자 있을 때: 산책, 둘러보기, 앉기, 식빵, 잠(일어나면 기지개), 그루밍, 가끔 우다다, 가끔 냐옹
 * - 사람이 다가오면 한 발짝 물러나서 돌아본다. 바로 앞까지 뛰어들면 놀라서 도망 (도망친 뒤엔 그루밍으로 진정)
 * - 사람이 가만히 있거나 앉아 있으면 '?' 하고 머뭇머뭇(두 칸 걷고 멈칫) 다가와 옆에 앉는다. 벤치에 앉은 사람 옆에선 식빵·잠
 * - 간식을 든 사람에게는 더 잘 다가오고, 옆에 앉아 냐옹 조른다
 * - 친밀도(사람마다): 다가와 옆에 있기·쓰다듬기·하트 이모티콘으로 오른다. 친해지면 덜 피하고, 아주 친하면 가끔 따라온다
 */
export class CatSystem {
  private readonly cats: Cat[] = [];
  private tickNow = 0;

  constructor(
    private readonly state: ParkState,
    placements: readonly AnimalPlacement[],
    private readonly grid: CollisionGrid,
    /** sessionId → 계정 id (친밀도는 계정마다 기억) */
    private readonly userIdOf: (sessionId: string) => number | undefined,
  ) {
    for (const place of placements) {
      if (place.kind !== "cat") continue;
      const home = this.nearestOpen(place.home);
      const s = new AnimalState();
      s.kind = place.kind;
      s.name = place.name;
      s.x = home.x;
      s.y = home.y;
      s.facing = "down";
      s.action = "sit";
      s.fx = "";
      s.fxTick = 0;
      this.state.animals.set(place.id, s);
      this.cats.push({
        state: s,
        place,
        home,
        mode: "rest",
        pose: "sit",
        until: sec(rand(2, 6)),
        path: [],
        speed: 0,
        trust: new Map(),
        seen: new Map(),
        flashUntil: 0,
        lastWaryTick: 0,
        nextBegMeowTick: 0,
        lastCuriousTick: -9999,
      });
    }
  }

  tick(tick: number): void {
    this.tickNow = tick;
    for (const cat of this.cats) {
      this.perceive(cat);
      this.react(cat);
      if (cat.path.length > 0) this.move(cat);
      else if (tick >= cat.until) this.decide(cat);
      this.noticeStillPeople(cat);
      this.keepFacingFocus(cat);
      this.growTrustNearby(cat);
      this.applyAction(cat);
    }
  }

  /** 쓰다듬기. 친하거나 고양이가 스스로 다가와 있는 사람이면 골골, 아니면 피한다 */
  pet(sessionId: string, animalId: unknown): void {
    const player = this.state.players.get(sessionId);
    const cat = this.cats.find((c) => c.place.id === animalId);
    if (!player || !cat || cat.mode === "flee") return;
    if (dist(player, cat.state) > PET_RANGE_SERVER_PX) return;
    const trust = this.trustOf(cat, sessionId);
    const cameToYou = (cat.mode === "near" || cat.mode === "beg" || cat.mode === "petted") && cat.focus === sessionId;
    const asleep = cat.pose === "sleep" && cat.mode === "rest";
    if (trust >= PET_TRUST || cameToYou) {
      // 자고 있었으면 깨지 않고 그대로, 아니면 앉거나 식빵 자세로 골골
      const pose: CatAction = asleep ? "sleep" : cat.pose === "loaf" || player.seatId ? "loaf" : "sit";
      this.setMode(cat, "petted", pose, sec(rand(3.5, 5)));
      cat.focus = sessionId;
      this.addTrust(cat, sessionId, TRUST_PET);
      this.fx(cat, "purr");
      log.debug(`${cat.place.id} petted by ${sessionId} (trust ${this.trustOf(cat, sessionId).toFixed(2)})`);
    } else {
      this.addTrust(cat, sessionId, TRUST_PET_REFUSED);
      this.stepAway(cat, player, sessionId);
      log.debug(`${cat.place.id} refused pet by ${sessionId} (trust ${trust.toFixed(2)})`);
    }
  }

  /** 근처에서 하트·안녕·고마워 이모티콘: 조금 친해지고, 쉬고 있으면 쳐다보고 가끔 냐옹 대답 */
  onEmote(sessionId: string, emote: string): void {
    if (!FRIENDLY_EMOTES.has(emote)) return;
    const player = this.state.players.get(sessionId);
    if (!player) return;
    for (const cat of this.cats) {
      if (dist(player, cat.state) > INVITE_PX) continue;
      this.addTrust(cat, sessionId, TRUST_EMOTE);
      if (cat.path.length === 0 && cat.pose !== "sleep" && (cat.mode === "idle" || cat.mode === "rest")) {
        cat.state.facing = facingToward(player.x - cat.state.x, player.y - cat.state.y, cat.state.facing as Facing);
        if (Math.random() < 0.4) this.flash(cat, "meow", sec(1.2));
      }
    }
  }

  onLeave(sessionId: string): void {
    for (const cat of this.cats) {
      cat.seen.delete(sessionId);
      if (cat.focus === sessionId) cat.focus = undefined;
    }
  }

  /** 테스트·디버그용: 친밀도 */
  trustFor(animalId: string, sessionId: string): number {
    const cat = this.cats.find((c) => c.place.id === animalId);
    return cat ? this.trustOf(cat, sessionId) : 0;
  }

  /** 테스트·디버그용: 지금 하는 일 */
  modeOf(animalId: string): string | undefined {
    return this.cats.find((c) => c.place.id === animalId)?.mode;
  }

  // ---- 살피기·반응 ----

  /** 주변 사람마다 가만히 있는지, 다가오는지 */
  private perceive(cat: Cat): void {
    for (const [id, p] of this.state.players) {
      const d = dist(p, cat.state);
      let s = cat.seen.get(id);
      if (!s) {
        s = { last: { x: p.x, y: p.y }, lastDist: d, stillTicks: 0, approachTicks: 0 };
        cat.seen.set(id, s);
      }
      const moved = Math.hypot(p.x - s.last.x, p.y - s.last.y) > 0.3;
      s.stillTicks = moved ? 0 : s.stillTicks + 1;
      s.approachTicks = moved && d < s.lastDist - 0.4 ? s.approachTicks + 1 : 0;
      s.last = { x: p.x, y: p.y };
      s.lastDist = d;
    }
  }

  /** 다가오는 사람에게 반응 (하던 일을 끊는다). 도망치는 중이면 계속 도망 */
  private react(cat: Cat): void {
    if (cat.mode === "flee") return;
    const asleep = cat.pose === "sleep" && cat.path.length === 0;
    let threat: { id: string; p: PlayerState; d: number } | undefined;
    for (const [id, p] of this.state.players) {
      const s = cat.seen.get(id);
      if (!s || s.approachTicks < 2 || s.lastDist > WARY_PX) continue;
      if (this.trustOf(cat, id) >= CALM_TRUST) continue;
      if (!threat || s.lastDist < threat.d) threat = { id, p, d: s.lastDist };
    }
    if (!threat) return;
    const trust = this.trustOf(cat, threat.id);
    if (asleep && threat.d > WAKE_PX) return;
    if (trust >= WARY_TRUST) {
      // 친한 사람: 피하지 않고 쳐다본다. 바짝 붙을 때만 살짝 비켜선다
      if (threat.d < BUMP_PX && this.tickNow - cat.lastWaryTick > sec(2)) this.stepAway(cat, threat.p, threat.id);
      else if (cat.path.length === 0 && cat.mode !== "near" && cat.mode !== "petted") cat.focus = threat.id;
      return;
    }
    if (threat.d < STARTLE_PX) {
      // 바로 앞까지 다가옴: 낯설면 놀라서 도망, 조금 낯이 익었으면 한 발짝만
      if (trust < WARY_TRUST * 0.6) this.flee(cat, threat.p, threat.id);
      else this.stepAway(cat, threat.p, threat.id);
      return;
    }
    if (this.tickNow - cat.lastWaryTick < sec(0.8) || cat.mode === "stepAway") return;
    this.stepAway(cat, threat.p, threat.id);
  }

  // ---- 다음 할 일 정하기 ----

  private decide(cat: Cat): void {
    const prev = cat.mode;
    const prevPose = cat.pose;
    // 자고 일어나면 기지개. 식빵 자세에서도 자주
    if (prev === "rest" && (prevPose === "sleep" || (prevPose === "loaf" && Math.random() < 0.6))) {
      this.setMode(cat, "idle", "stretch", sec(1.8));
      return;
    }
    // 놀라서 도망친 뒤에는 그루밍으로 진정
    if (prev === "watch" && cat.focus && Math.random() < 0.5) {
      this.setMode(cat, "rest", "groom", sec(rand(2.5, 4.5)));
      cat.focus = undefined;
      return;
    }
    if (this.trySocial(cat)) return;
    if (this.tryFollow(cat)) return;
    cat.focus = undefined;
    this.autonomous(cat);
  }

  /**
   * 쉬거나(깊이 잠든 것 제외) 산책하는 중에도 가끔 주변을 살펴, 가만히 있는 사람이 있으면 하던 일을 그만두고 다가간다.
   * (안 그러면 식빵·잠이 끝날 때까지 수십 초 동안 사람을 모른 척한다)
   */
  private noticeStillPeople(cat: Cat): void {
    if (this.tickNow % sec(CHECK_SOCIAL_SEC) !== 0) return;
    const busy = cat.mode !== "idle" && cat.mode !== "rest" && cat.mode !== "wander";
    if (busy || (cat.mode === "rest" && cat.pose === "sleep") || cat.pose === "stretch") return;
    this.trySocial(cat, 0.5);
  }

  /** 가만히 있거나 앉아 있는 사람에게 다가가기. eagerness: 처음 관심을 가질 확률 배율 */
  private trySocial(cat: Cat, eagerness = 1): boolean {
    let best: { id: string; p: PlayerState; score: number; d: number } | undefined;
    for (const [id, p] of this.state.players) {
      const s = cat.seen.get(id);
      if (!s) continue;
      const d = s.lastDist;
      if (d > INVITE_PX) continue;
      const seated = p.seatId !== "";
      if (s.stillTicks < sec(seated ? STILL_SEATED_SEC : STILL_SEC)) continue;
      const trust = this.trustOf(cat, id);
      const hasFood = p.hands.length > 0;
      // 오래 가만히 있을수록 궁금해진다 (최대 2.5배)
      const patience = 1 + Math.min(1.5, s.stillTicks / sec(15));
      const score = (0.15 + cat.place.boldness * 0.4 + trust * 0.7 + (hasFood ? 0.5 : 0) + (seated ? 0.25 : 0)) * patience;
      if (!best || score > best.score) best = { id, p, score, d };
    }
    if (!best) return false;
    // 다가가던 중(멈칫 후)이면 거의 이어서, 처음이면 성격·친밀도에 따라
    const continuing = (cat.mode === "pause" || cat.mode === "near" || cat.mode === "beg" || cat.mode === "petted") && cat.focus === best.id;
    if (!continuing && Math.random() > best.score * 0.7 * eagerness) return false;
    if (best.d <= NEAR_PX + 6) {
      this.arrive(cat, best.p, best.id);
      return true;
    }
    if (!continuing && this.tickNow - cat.lastCuriousTick > sec(20)) {
      this.fx(cat, "curious");
      cat.lastCuriousTick = this.tickNow;
    }
    return this.approach(cat, best.p, best.id);
  }

  /** 아주 친한 사람이 걸어가면 가끔 따라간다 */
  private tryFollow(cat: Cat): boolean {
    for (const [id, p] of this.state.players) {
      const s = cat.seen.get(id);
      if (!s || this.trustOf(cat, id) < FOLLOW_TRUST || s.stillTicks > 0) continue;
      if (s.lastDist < 40 || s.lastDist > 220 || Math.random() > 0.4) continue;
      const target = this.openNear({ x: p.x, y: p.y + 20 }, cat.state);
      if (!target || !this.goTo(cat, target, CAT_SPEED.walk + 20, "follow")) continue;
      cat.focus = id;
      cat.afterPath = () => this.setMode(cat, "watch", "sit", sec(rand(1, 2.5)));
      return true;
    }
    return false;
  }

  /** 혼자 할 일 (가중치 뽑기) */
  private autonomous(cat: Cat): void {
    // 집에서 너무 멀면 돌아간다
    if (dist(cat.state, cat.home) > cat.place.roamPx * 0.85) {
      const back = this.randomOpen(cat.home, 32, cat.place.roamPx * 0.4);
      if (back && this.goTo(cat, back, CAT_SPEED.walk, "wander")) return;
    }
    const alert = this.tickNow - cat.lastWaryTick < sec(ALERT_SEC);
    const pick = weighted<() => void>([
      [30, () => this.wander(cat)],
      [12, () => this.setMode(cat, "idle", "stand", sec(rand(2, 4)))],
      [16, () => this.setMode(cat, "rest", "sit", sec(rand(6, 14)))],
      [alert ? 3 : 12, () => this.setMode(cat, "rest", "loaf", sec(rand(12, 25)))],
      [alert ? 0 : this.quiet(cat) ? 10 : 3, () => this.setMode(cat, "rest", "sleep", sec(rand(25, 50)))],
      [10, () => this.setMode(cat, "rest", "groom", sec(rand(3, 6)))],
      [4, () => this.zoom(cat)],
      [4, () => this.setMode(cat, "idle", "meow", sec(1.2))],
    ]);
    pick();
  }

  /** 근처에 움직이는 사람이 없다 (잠들기 좋음) */
  private quiet(cat: Cat): boolean {
    for (const s of cat.seen.values()) if (s.lastDist < 160 && s.stillTicks === 0) return false;
    return true;
  }

  // ---- 행동들 ----

  private wander(cat: Cat): void {
    const target = this.randomOpen(cat.state, 64, 200, cat);
    if (!target || !this.goTo(cat, target, CAT_SPEED.walk, "wander")) this.setMode(cat, "idle", "stand", sec(2));
  }

  /** 우다다: 갑자기 뛰어갔다가 멈춰서 앉거나 그루밍 (반은 한 번 더 꺾어서 뜀) */
  private zoom(cat: Cat, again = Math.random() < 0.5): void {
    const target = this.randomOpen(cat.state, 120, 230, cat);
    if (!target || !this.goTo(cat, target, CAT_SPEED.run, "zoom")) return this.setMode(cat, "idle", "stand", sec(1));
    cat.afterPath = () => (again ? this.zoom(cat, false) : this.setMode(cat, "rest", Math.random() < 0.5 ? "groom" : "sit", sec(rand(2, 5))));
  }

  /**
   * 깜짝 놀라 사람 쪽을 본 채로 뒤로 폴짝 → 그 자리에 앉아 쳐다본다.
   * 바로 뒤가 비어 있으면 곧장 뛰고(길찾기 경유점 없이), 막혀 있으면 길을 따라 물러난다
   */
  private stepAway(cat: Cat, from: Vec2, sessionId: string): void {
    const s = cat.state;
    cat.lastWaryTick = this.tickNow;
    cat.focus = sessionId;
    s.facing = facingToward(from.x - s.x, from.y - s.y, s.facing as Facing);
    this.fx(cat, "startle");
    const target = this.awayFrom(cat, from, STEP_AWAY_PX);
    if (!target) return this.setMode(cat, "watch", "sit", sec(1.5));
    const mid = { x: (s.x + target.x) / 2, y: (s.y + target.y) / 2 };
    if (this.isOpen(mid) && this.isOpen(target)) {
      cat.mode = "stepAway";
      cat.path = [target];
      cat.speed = CAT_SPEED.hop;
      cat.flashUntil = 0;
    } else if (!this.goTo(cat, target, CAT_SPEED.hop, "stepAway")) {
      return this.setMode(cat, "watch", "sit", sec(1.5));
    }
    cat.afterPath = () => this.setMode(cat, "watch", "sit", sec(rand(1.5, 2.5)));
  }

  /** 깜짝 놀라 도망. 멀리 가서 돌아본다 */
  private flee(cat: Cat, from: Vec2, sessionId: string): void {
    cat.lastWaryTick = this.tickNow;
    this.fx(cat, "startle");
    const target = this.awayFrom(cat, from, FLEE_PX) ?? this.awayFrom(cat, from, FLEE_PX / 2);
    cat.focus = sessionId;
    if (!target || !this.goTo(cat, target, CAT_SPEED.run, "flee")) return this.stepAway(cat, from, sessionId);
    cat.afterPath = () => this.setMode(cat, "watch", "stand", sec(rand(1.5, 2.5)));
  }

  /** 머뭇머뭇 다가가기: 두 칸 걷고 멈칫(앉거나 서서 쳐다봄), 그 사이 계속 가만히 있으면 또 다가간다 */
  private approach(cat: Cat, p: PlayerState, sessionId: string): boolean {
    const target = this.openNear(p, cat.state);
    if (!target) return false;
    if (!this.goTo(cat, target, CAT_SPEED.walk, "approach")) return false;
    cat.focus = sessionId;
    if (cat.path.length > APPROACH_STEP_TILES + 1) cat.path = cat.path.slice(0, APPROACH_STEP_TILES);
    cat.afterPath = () => {
      if (dist(cat.state, p) <= NEAR_PX + 6) this.arrive(cat, p, sessionId);
      else this.setMode(cat, "pause", Math.random() < 0.5 ? "sit" : "stand", sec(rand(0.8, 2.2)));
    };
    return true;
  }

  /** 사람 옆에 도착: 간식이 있으면 조르기, 벤치에 앉아 있으면 식빵·잠, 아니면 옆에 앉기 */
  private arrive(cat: Cat, p: PlayerState, sessionId: string): void {
    const first = cat.focus !== sessionId || (cat.mode !== "near" && cat.mode !== "beg");
    if (first) this.addTrust(cat, sessionId, TRUST_ARRIVE);
    cat.focus = sessionId;
    if (p.hands.length > 0) {
      this.setMode(cat, "beg", "sit", sec(rand(8, 14)));
      cat.nextBegMeowTick = this.tickNow + sec(0.6);
      return;
    }
    if (p.seatId) return this.setMode(cat, "near", Math.random() < 0.3 ? "sleep" : "loaf", sec(rand(15, 35)));
    this.setMode(cat, "near", weighted<CatAction>([[6, "sit"], [3, "loaf"], [2, "groom"]]), sec(rand(6, 16)));
  }

  // ---- 매 틱 ----

  private move(cat: Cat): void {
    const s = cat.state;
    let budget = cat.speed * TICK_SEC;
    while (budget > 0 && cat.path.length > 0) {
      const wp = cat.path[0]!;
      const d = Math.hypot(wp.x - s.x, wp.y - s.y);
      // 뒤로 폴짝 뛸 때는 사람 쪽을 계속 본다
      if (d > 0.01 && cat.mode !== "stepAway") s.facing = facingToward(wp.x - s.x, wp.y - s.y, s.facing as Facing);
      if (d <= budget) {
        s.x = wp.x;
        s.y = wp.y;
        budget -= d;
        cat.path.shift();
      } else {
        s.x += ((wp.x - s.x) / d) * budget;
        s.y += ((wp.y - s.y) / d) * budget;
        budget = 0;
      }
    }
    if (cat.path.length === 0) {
      const next = cat.afterPath;
      cat.afterPath = undefined;
      cat.until = this.tickNow;
      if (next) next();
      else this.setMode(cat, "idle", "stand", sec(rand(0.5, 1.5)));
    }
  }

  /** 서 있거나 앉아서 사람을 보고 있을 때는 그 사람 쪽을 본다 (자거나 식빵·그루밍 중엔 그대로) */
  private keepFacingFocus(cat: Cat): void {
    if (cat.path.length > 0 || !cat.focus) return;
    if (cat.pose !== "sit" && cat.pose !== "stand" && cat.pose !== "meow") return;
    const p = this.state.players.get(cat.focus);
    if (!p) return;
    cat.state.facing = facingToward(p.x - cat.state.x, p.y - cat.state.y, cat.state.facing as Facing);
  }

  /** 사람 옆에서 그 사람이 가만히 있으면 조금씩 친해진다. 조르는 중이면 가끔 냐옹 */
  private growTrustNearby(cat: Cat): void {
    if (!cat.focus || (cat.mode !== "near" && cat.mode !== "beg" && cat.mode !== "petted")) return;
    const s = cat.seen.get(cat.focus);
    const p = this.state.players.get(cat.focus);
    if (!s || !p) return;
    if (s.lastDist <= NEAR_PX + 24 && s.stillTicks > 0) this.addTrust(cat, cat.focus, TRUST_NEAR_PER_SEC * TICK_SEC);
    if (cat.mode === "beg" && this.tickNow >= cat.nextBegMeowTick) {
      if (p.hands.length === 0) cat.until = this.tickNow; // 간식이 없어지면 그만 조른다
      else this.flash(cat, "meow", sec(1.2));
      cat.nextBegMeowTick = this.tickNow + sec(rand(3, 5));
    }
    if (cat.mode === "petted" && (this.tickNow - cat.state.fxTick) >= sec(2)) this.fx(cat, "purr");
  }

  private applyAction(cat: Cat): void {
    const s = cat.state;
    let action: CatAction;
    if (cat.path.length > 0) action = cat.mode === "stepAway" ? "hop" : cat.speed >= CAT_SPEED.run ? "run" : "walk";
    else if (this.tickNow < cat.flashUntil && cat.flashAction) action = cat.flashAction;
    else action = cat.pose;
    if (action !== s.action) {
      s.action = action;
      if (action === "meow") this.fx(cat, "meow");
    }
  }

  // ---- 도우미 ----

  private setMode(cat: Cat, mode: Mode, pose: CatAction, durationTicks: number): void {
    cat.mode = mode;
    cat.pose = pose;
    cat.path = [];
    cat.afterPath = undefined;
    cat.until = this.tickNow + durationTicks;
    cat.flashUntil = 0;
  }

  /** 길을 찾아 걷기 시작. 못 가면 false */
  private goTo(cat: Cat, target: Vec2, speed: number, mode: Mode): boolean {
    const ts = this.grid.tileSize;
    const from = tileOf(cat.state, ts);
    const goal = tileOf(target, ts);
    const tiles = findPath(this.grid, from, goal);
    if (!tiles || tiles.length > MAX_PATH_TILES) return false;
    const pts = tiles.map((t) => tileCenter(t, ts));
    // 마지막 칸 안에서는 목표 지점까지 (칸 가운데보다 자연스럽게)
    if (pts.length > 0) pts[pts.length - 1] = target;
    else pts.push(target);
    cat.mode = mode;
    cat.path = pts;
    cat.speed = speed;
    cat.afterPath = undefined;
    cat.flashUntil = 0;
    return true;
  }

  /** from 반대쪽으로 distance 만큼 떨어진 빈 곳 (막혔으면 조금씩 옆으로 틀어 본다) */
  private awayFrom(cat: Cat, from: Vec2, distance: number): Vec2 | undefined {
    const s = cat.state;
    const base = Math.atan2(s.y - from.y, s.x - from.x);
    for (const turn of [0, 0.6, -0.6, 1.1, -1.1, 1.6, -1.6]) {
      const a = base + turn;
      const p = { x: s.x + Math.cos(a) * distance, y: s.y + Math.sin(a) * distance };
      if (this.isOpen(p) && dist(p, cat.home) <= cat.place.roamPx * 1.4) return p;
    }
    return undefined;
  }

  /**
   * 사람 옆의 빈 곳. 발치 옆(고양이가 오는 쪽 먼저) → 비스듬히 앞 → 뒤 순서.
   * 사람 바로 위(뒤)는 이름표·몸에 가려서 마지막
   */
  private openNear(p: Vec2, catPos: Vec2): Vec2 | undefined {
    const side = catPos.x >= p.x ? 1 : -1;
    const r = NEAR_PX - 8;
    const spots: [number, number][] = [
      [side * r, 2], [-side * r, 2],
      [side * r * 0.7, r * 0.6], [-side * r * 0.7, r * 0.6], [0, r],
      [side * r * 0.8, -r * 0.4], [-side * r * 0.8, -r * 0.4], [0, -r],
    ];
    for (const [dx, dy] of spots) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (this.isOpen(q)) return q;
    }
    return undefined;
  }

  /** center 에서 minR~maxR 떨어진 빈 곳 (cat 이 있으면 돌아다니는 범위 안으로) */
  private randomOpen(center: Vec2, minR: number, maxR: number, cat?: Cat): Vec2 | undefined {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(minR, maxR);
      const p = { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
      if (!this.isOpen(p)) continue;
      if (cat && dist(p, cat.home) > cat.place.roamPx) continue;
      return p;
    }
    return undefined;
  }

  /** 그 지점의 칸이 막혀 있지 않음 (고양이는 작아서 칸 단위로만 본다) */
  private isOpen(p: Vec2): boolean {
    const t = tileOf(p, this.grid.tileSize);
    return t.col >= 0 && t.row >= 0 && t.col < this.grid.cols && t.row < this.grid.rows && !isBlockedTile(this.grid, t.col, t.row);
  }

  /** 맵이 바뀌어 사는 곳이 막혔으면 가장 가까운 빈 칸 */
  private nearestOpen(p: Vec2): Vec2 {
    if (this.isOpen(p)) return p;
    const t = tileOf(p, this.grid.tileSize);
    for (let r = 1; r < 12; r++)
      for (let dr = -r; dr <= r; dr++)
        for (let dc = -r; dc <= r; dc++) {
          const c = { col: t.col + dc, row: t.row + dr };
          const q = tileCenter(c, this.grid.tileSize);
          if (this.isOpen(q)) return q;
        }
    return p;
  }

  private fx(cat: Cat, fx: CatFx): void {
    cat.state.fx = fx;
    cat.state.fxTick = this.tickNow;
  }

  /** 잠깐 다른 그림 (조르며 냐옹 등). 끝나면 원래 자세 */
  private flash(cat: Cat, action: CatAction, ticks: number): void {
    cat.flashAction = action;
    cat.flashUntil = this.tickNow + ticks;
  }

  private trustOf(cat: Cat, sessionId: string): number {
    const userId = this.userIdOf(sessionId);
    return userId === undefined ? 0 : (cat.trust.get(userId) ?? 0);
  }

  private addTrust(cat: Cat, sessionId: string, amount: number): void {
    const userId = this.userIdOf(sessionId);
    if (userId === undefined) return;
    cat.trust.set(userId, Math.min(1, (cat.trust.get(userId) ?? 0) + amount));
  }
}

function weighted<T>(items: [number, T][]): T {
  const total = items.reduce((s, [w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [w, v] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[items.length - 1]![1];
}
