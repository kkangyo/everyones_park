// 모두의 쉼터 메인 화면: 3D SD 겨울 공원.
// 지도(assets/maps/park.json, 서버와 같은 파일)를 SD 3D 디오라마로 세우고, 정식 공원 채널(ParkRoom)에 들어간다.
// 계정·이동·간식·앉기·이모티콘·고양이·채널은 2D 화면과 같은 서버 규칙(@park/shared)을 따르고, 그리는 것만 3D 인형으로 바꿨다.
// 배경·사람·고양이는 3D 인형, 손에 든 간식은 고해상도 스프라이트. 원근 카메라가 따라온다. 1칸(32px) = 1.
// Three.js r128 과 스프라이트(이모티콘·간식 아이콘)는 /park3d/ 의 three.min.js · sprites-data.js 를 전역으로 쓴다.
import {
  CAT_ACTIONS,
  CAT_FX,
  CLOSE_CODE,
  DEFAULT_APPEARANCE,
  EMOTE_COOLDOWN_SEC,
  EMOTE_SHOW_MS,
  EMOTES as EMOTE_DEFS,
  FACINGS,
  HANDS_MAX,
  JOIN_ERROR_BANNED,
  MENU,
  MSG,
  NICKNAME_MAX_LENGTH,
  NO_INPUT,
  PET_RANGE_PX,
  PIN_PATTERN,
  SIT_RANGE_PX,
  TICK_MS,
  TICK_SEC,
  TILE_SIZE,
  TRUCKS,
  checkNicknameFormat,
  collisionGridFromTiled,
  facingFromInput,
  findPath,
  isAtTruckFront,
  isBlockedTile,
  isMoving,
  nearestSlot,
  normalizeNickname,
  seatStandPoint,
  seatsFromTiled,
  seatsInRange,
  step,
  tileCenter,
  tileOf,
  truckFrontPoint,
  truckPlacementsFromTiled,
} from "@park/shared";
import { initSideControls } from "./side-controls.js";
import { loadFoodSprites } from "./food-sprites.js";
import { createArmIK } from "./arm-ik.js";
import { DEBUG, DEV_KEYS, LAG_MS } from "../debug";
import { localized, t, translate } from "../i18n";
import { PathFollower } from "../input/pathFollower";
import { ApiFailure, checkNickname, fetchChannels, fetchRandomNickname, fetchStatsToday, login, signup } from "../net/api";
import { ParkSound } from "../audio/ParkSound";
import { joinChannel, joinPark, stateCallbacks } from "../net/connection";
import { checkHealth } from "../net/health";
import { ServerClock, SnapshotBuffer } from "../net/Interpolation";
import { LagSim } from "../net/LagSim";
import { Prediction } from "../net/Prediction";
import { loadProfile, saveProfile } from "../profile";
import { getSettings, hidePlayer, isHidden, unhidePlayer, updateSettings } from "../settings";

main().catch((err) => {
  console.error("[park] 시작 실패", err);
  window.bootFail?.(/WebGL/i.test(String(err?.message)) ? "이 기기에서는 3D 화면을 열 수 없어요" : "공원을 불러오지 못했어요");
});

async function main() {
"use strict";
const $ = (id) => document.getElementById(id);
initSideControls();
const THREE = window.THREE, SPR = window.SPRITES;
if (!THREE || !SPR) throw new Error("three.min.js / sprites-data.js 를 불러오지 못함");
// 시험 스위치
// MESHY_DOLL: Meshy 로 만든 인형(여자 meshy-mint · 남자 meshy-boy · 곱슬머리 meshy-curly)을 입힌다. 처음 화면에서 인형만 고르고, 꾸미기·친구 바꾸기는 숨긴다
// ACCOUNT_FORM: false 면 닉네임·PIN 입력을 숨기고, 이 기기에 저장한 손님 계정(무작위 닉네임 + PIN)으로 자동 로그인한다
const MESHY_DOLL = true, ACCOUNT_FORM = false;
const MAP = await fetch("/maps/park.json").then((r) => { if (!r.ok) throw new Error(`park.json ${r.status}`); return r.json(); });
const MW = MAP.width, MH = MAP.height;
const layer = (n) => MAP.layers.find((l) => l.name === n);
const GROUND = layer("ground").data, OBST = layer("obstacles").data;
const G = { snow: 1, snow2: 2, path: 3, plaza: 4, ice: 5, outside: 6, tree: 7, fence: 8, rock: 9, wall: 10, benchDown: 11, benchUp: 12, benchLeft: 13, garden: 14, bridge: 15, stage: 16 };
const prop = (o, k) => (o.properties || []).find((p) => p.name === k)?.value;
const groundAt = (x, y) => GROUND[y * MW + x];
const TRUCK_DEF = TRUCKS;
// 서버와 같은 판정 자료 (px 단위)
const GRID = collisionGridFromTiled(MAP, "obstacles");
const SEAT_DEFS = new Map(seatsFromTiled(MAP, "seats").map((s) => [s.id, s]));
const SEAT_LIST = [...SEAT_DEFS.values()];
const TRUCK_PLACES = new Map(truckPlacementsFromTiled(MAP, "trucks").map((p) => [p.def.id, p]));

const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: (devicePixelRatio || 1) < 1.5, powerPreference: "high-performance" });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
// 화질은 '보통' 하나로 고정: 해상도 배율 1.5 · 그림자 지도 1024(두 프레임에 한 번) · 눈 입자 300
const QUAL = { dpr: 1.5, shadow: 1024, every: 2, snow: 300 };
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdfe4ff, 0x8a7fb0, 0.55));
const sun = new THREE.DirectionalLight(0xfff0dc, 0.7); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 }); sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// ───────── 재질 ─────────
const ramp = new THREE.DataTexture(new Uint8Array([110, 110, 110, 172, 172, 172, 228, 228, 228]), 3, 1, THREE.RGBFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
// Meshy 인형용 부드러운 음영: 3단 계단은 Meshy 메시의 고르지 않은 노멀 때문에 얼굴·옷에 끊긴 얼룩이 생긴다.
// 어두운 쪽 0.5 → 밝은 쪽 0.78 을 빛 방향(0~1)의 0.1~0.8 구간에서 부드럽게(smoothstep) 잇는다
const DOLL_RAMP = (() => {
  const N = 64, lo = 0.5, hi = 0.78, from = 0.1, to = 0.8, a = new Uint8Array(N * 3);
  for (let i = 0; i < N; i++) { const t = Math.min(1, Math.max(0, (i / (N - 1) - from) / (to - from))), v = Math.round(255 * (lo + (hi - lo) * t * t * (3 - 2 * t))); a.set([v, v, v], i * 3); }
  const g = new THREE.DataTexture(a, N, 1, THREE.RGBFormat); g.minFilter = g.magFilter = THREE.LinearFilter; g.generateMipmaps = false; g.needsUpdate = true; return g;
})();
const mats = new Map();
const toon = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshToonMaterial({ color: c, gradientMap: ramp })); return mats.get(c); };
const glowM = (c) => { const k = "g" + c; if (!mats.has(k)) mats.set(k, new THREE.MeshBasicMaterial({ color: c })); return mats.get(k); };
function M(geo, mat, x = 0, y = 0, z = 0, p) { const m = new THREE.Mesh(geo, typeof mat === "number" ? toon(mat) : mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; (p || scene).add(m); return m; }
const geos = new Map();
function rboxGeo(w, h, d, r = 0.05) {
  r = Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002); const k = [w, h, d, r].join(); if (geos.has(k)) return geos.get(k);
  const e = r * 0.05, x = w / 2 - r - e, y = h / 2 - r - e, s = new THREE.Shape();
  s.absarc(x, y, e, 0, Math.PI / 2); s.absarc(-x, y, e, Math.PI / 2, Math.PI); s.absarc(-x, -y, e, Math.PI, Math.PI * 1.5); s.absarc(x, -y, e, Math.PI * 1.5, Math.PI * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 2 }); g.translate(0, 0, -(d - 2 * r) / 2);
  geos.set(k, g); return g;
}
const box = (w, h, d, c, x, y, z, p, r) => M(rboxGeo(w, h, d, r), c, x, y, z, p);
const SPH = new THREE.SphereGeometry(1, 16, 12);
const cyl = (rt, rb, h, c, x, y, z, p, seg = 10) => M(new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y, z, p);
const GLOW_TEX = (() => { const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d"); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, "rgba(255,214,140,.9)"); gr.addColorStop(0.5, "rgba(255,180,100,.3)"); gr.addColorStop(1, "rgba(255,170,90,0)"); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
function glow(x, y, z, size, p, op = 0.8) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.set(x, y, z); s.scale.set(size, size, 1); (p || scene).add(s); return s; }
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); const rr = (a, b) => a + (b - a) * rnd();
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// Shared scenery is also used by /park3d/?edit. Keep asset models and terrain in world.js.
const world = window.ParkWorld.create(THREE, MAP, TRUCK_DEF, renderer);
scene.add(world.root);
const { heightAt, inside, SEATS, trucks } = world;

// ───────── 눈·김 ─────────
const SNOW_MAX = QUAL.snow, snowGeo = new THREE.BufferGeometry();
const snow = (() => {
  const N = SNOW_MAX, geo = snowGeo; geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const s = new Float32Array(N * 4); for (let i = 0; i < N * 4; i++) s[i] = Math.random(); geo.setAttribute("aSeed", new THREE.BufferAttribute(s, 4));
  const mat = new THREE.ShaderMaterial({ depthWrite: false, transparent: true, uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uPx: { value: 1 } },
    vertexShader: `attribute vec4 aSeed; uniform float uTime, uPx; uniform vec3 uCenter; void main(){ float r=aSeed.w, B=24.0; vec3 p;
      p.y = mod(aSeed.y*9.0 - uTime*(0.5+r*0.5), 9.0) - 0.3 + uCenter.y;
      p.x = mod(aSeed.x*B + sin(uTime*0.7+r*12.0)*0.4 - uCenter.x + B*0.5, B) - B*0.5 + uCenter.x;
      p.z = mod(aSeed.z*B + cos(uTime*0.5+r*9.0)*0.4 - uCenter.z + B*0.5, B) - B*0.5 + uCenter.z;
      vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = min(9.0, (r > 0.7 ? 2.8 : 1.7) * uPx * 16.0 / max(1.0, -mv.z)); }`,
    fragmentShader: `void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0 - smoothstep(0.1, 0.25, d)); }` });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts); return mat.uniforms;
})();
const puffs = [];
function puff(pos, { size = 0.12, life = 1.3, rise = 0.8, op = 0.7 } = {}) {
  let p = puffs.find((q) => !q.alive);
  if (!p) { if (puffs.length > 40) return; p = { m: M(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })) }; p.m.castShadow = false; puffs.push(p); }
  Object.assign(p, { alive: true, t: 0, life, rise, size, op, dx: rr(-0.06, 0.06) }); p.m.position.copy(pos); p.m.visible = true;
}

// ───────── 도트 시트 캐릭터 (사람: 64px 칸 몸+옷 / 고양이: 32px 칸) ─────────
const IMG = {};
const loadImages = () => Promise.all(Object.entries(SPR).map(([k, src]) => new Promise((ok) => { const i = new Image(); i.onload = () => { IMG[k] = i; ok(); }; i.onerror = ok; i.src = src; })));
// ───────── 옷장: 기존 두 시트를 섞고 다시 칠하고, 겨울 소품은 프레임마다 머리 모양을 읽어 직접 찍는다 ─────────
const PAL = { // [외곽선, 그늘, 바탕, 밝은 면]
  black: null, choco: ["#24161a", "#4d2e2a", "#7a4a3a", "#a26a50"], milk: ["#3a2420", "#7a5038", "#b08058", "#d6aa7c"], honey: ["#5a3a1c", "#a8742e", "#dcaa4c", "#f4d68a"],
  pink: ["#5a2a3c", "#b05a78", "#e88aa6", "#fbbccc"], ash: ["#2a2a38", "#575a72", "#8a8ea8", "#bcc0d6"],
  red: ["#5a1f2c", "#a8384a", "#e0606a", "#f59a96"], mint: ["#1f4a48", "#3f8a7e", "#6cc4a8", "#a8e6cc"], yellow: ["#5a4020", "#b98a2c", "#f0c04a", "#fae28a"],
  navy: ["#1b2140", "#323f78", "#5568b0", "#8a9ad8"], lilac: ["#3a2a52", "#6e57a0", "#a48ad6", "#cdb8f0"], cream: ["#5a4a3c", "#b8a28a", "#eee2cc", "#fdf7ea"],
  berry: ["#4a1830", "#8c2c58", "#c8508a", "#ec88b6"], sky: ["#1c3c5a", "#3a78a8", "#6ab0de", "#a8d8f4"], brown: ["#2e1c18", "#5e3c30", "#8e6248", "#b88a68"],
};
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const ramp4 = (p, t) => { const c = p.map(hexRGB), f = Math.max(0, Math.min(2.999, t * 3)), i = Math.floor(f), u = f - i; return [0, 1, 2].map((k) => Math.round(c[i][k] + (c[i + 1][k] - c[i][k]) * u)); };
const OPTIONS = {
  hair: [["long", "긴 머리"], ["short", "짧은 머리"], ["curly", "곱슬머리"], ["roller", "헤어롤"], ["penguin", "펭귄"], ["alpaca", "알파카"]],
  outfit: [["dress", "원피스"], ["coat", "패딩"]],
  hairColor: ["black", "choco", "milk", "honey", "pink", "ash"],
  outfitColor: ["cream", "red", "mint", "yellow", "lilac", "navy", "berry", "sky", "black"],
  hat: [["none", "없음"], ["pompom", "방울 모자"], ["cat", "고양이 모자"], ["bear", "곰 모자"], ["rabbit", "토끼 모자"], ["muff", "귀마개"]],
  hatColor: ["red", "cream", "mint", "yellow", "pink", "navy", "lilac", "brown"],
  scarf: ["none", "red", "cream", "mint", "yellow", "navy", "berry", "sky"],
  scarfStyle: [["wrap", "둘러 감기"], ["long", "길게 늘어뜨리기"], ["cover", "얼굴까지 덮기"]],
  scarfPattern: [["plain", "민무늬"], ["knit", "골지 니트"], ["check", "체크"]],
};
const SWATCH = (k) => (PAL[k] ? PAL[k][2] : "#2a2430");
const DEFAULT_LOOK = { hair: "long", outfit: "coat", hairColor: "milk", outfitColor: "mint", hat: "pompom", hatColor: "red", scarf: "cream", scarfStyle: "wrap", scarfPattern: "knit" };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function randomLook() {
  const v = (a) => { const x = pick(a); return Array.isArray(x) ? x[0] : x; };
  const l = { hair: v(OPTIONS.hair), outfit: v(OPTIONS.outfit), hairColor: v(OPTIONS.hairColor), outfitColor: v(OPTIONS.outfitColor.filter((c) => c !== "black")), hat: Math.random() < 0.85 ? v(OPTIONS.hat.slice(1)) : "none", hatColor: v(OPTIONS.hatColor), scarf: Math.random() < 0.7 ? v(OPTIONS.scarf.slice(1)) : "none", scarfStyle: v(OPTIONS.scarfStyle), scarfPattern: v(OPTIONS.scarfPattern) };
  if (l.hair !== "long") l.outfit = "coat";
  return l;
}
const lookKey = (l) => [l.hair, l.outfit, l.hairColor, l.outfitColor, l.hat, l.hatColor, l.scarf, l.scarfStyle, l.scarfPattern].join(".");
// 처음 화면에서 고르는 친구들 (꾸미기 선택지를 미리 맞춘 묶음. 고른 뒤에도 꾸미기에서 바꿀 수 있다)
const PRESETS = [
  { name: "눈송이", note: "방울 모자 · 민트 패딩", look: { hair: "long", outfit: "coat", hairColor: "milk", outfitColor: "mint", hat: "pompom", hatColor: "red", scarf: "cream", scarfStyle: "long", scarfPattern: "knit" } },
  { name: "곰돌이", note: "곰 모자 · 크림 패딩", look: { hair: "short", outfit: "coat", hairColor: "choco", outfitColor: "cream", hat: "bear", hatColor: "brown", scarf: "red", scarfStyle: "wrap", scarfPattern: "plain" } },
  { name: "냥냥이", note: "고양이 모자 · 라일락 원피스", look: { hair: "long", outfit: "dress", hairColor: "pink", outfitColor: "lilac", hat: "cat", hatColor: "cream", scarf: "none", scarfStyle: "wrap", scarfPattern: "plain" } },
  { name: "깡총이", note: "토끼 모자 · 베리 패딩", look: { hair: "long", outfit: "coat", hairColor: "honey", outfitColor: "berry", hat: "rabbit", hatColor: "cream", scarf: "sky", scarfStyle: "long", scarfPattern: "check" } },
  { name: "귤이", note: "방울 모자 · 노랑 패딩", look: { hair: "short", outfit: "coat", hairColor: "black", outfitColor: "yellow", hat: "pompom", hatColor: "mint", scarf: "navy", scarfStyle: "cover", scarfPattern: "knit" } },
  { name: "별빛", note: "귀마개 · 남색 패딩", look: { hair: "long", outfit: "coat", hairColor: "ash", outfitColor: "navy", hat: "muff", hatColor: "pink", scarf: "berry", scarfStyle: "wrap", scarfPattern: "check" } },
];
// ───────── SD 캐릭터: 머리 큰 장난감 인형 (위 옷장 선택지를 그대로 입는다) ─────────
// 공원과 같은 장면·조명에 서고, 뒤집은 껍질(외곽선)을 둘러 귀여운 인형처럼 보이게 한다. 선 굵기는 거리와 상관없이 화면에서 비슷하게
const OUTLINE = new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: { uW: { value: 0.0021 }, uC: { value: new THREE.Color(0x3d3352) } },
  vertexShader: "uniform float uW; void main(){ vec4 vp = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal); vp.xyz += n * uW * max(-vp.z, 2.0); gl_Position = projectionMatrix * vp; }",
  fragmentShader: "uniform vec3 uC; void main(){ gl_FragColor = vec4(uC, 1.0); }" });
const noRay = () => {};
function outline(root) {
  const list = []; root.traverse((m) => { if (m.isMesh && m.material.isMeshToonMaterial && !m.userData.noOutline) list.push(m); });
  for (const m of list) { m.castShadow = true; const h = new THREE.Mesh(m.geometry, OUTLINE); h.raycast = noRay; m.add(h); }
  return root;
}
const SHADOW_TEX = (() => { const c = document.createElement("canvas"); c.width = 64; c.height = 32; const g = c.getContext("2d"), gr = g.createRadialGradient(32, 16, 2, 32, 16, 30); gr.addColorStop(0, "rgba(70,60,110,.42)"); gr.addColorStop(1, "rgba(70,60,110,0)"); g.setTransform(1, 0, 0, 0.5, 0, 8); g.fillStyle = gr; g.fillRect(0, -16, 64, 64); return new THREE.CanvasTexture(c); })();
// 발밑 그림자는 비탈을 따라 눕힌다
const UP = new THREE.Vector3(0, 1, 0), slopeN = new THREE.Vector3();
function placeShadow(c) { const { x, z } = c.pos; c.shadow.position.set(x, c.pos.y + 0.04, z); c.shadow.quaternion.setFromUnitVectors(UP, slopeN.set(heightAt(x - 0.2, z) - heightAt(x + 0.2, z), 0.4, heightAt(x, z - 0.2) - heightAt(x, z + 0.2)).normalize()); }
function makeShadow(w) { const s = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: SHADOW_TEX, transparent: true, opacity: 0.6, depthWrite: false })); scene.add(s); return s; }
const palN = (k, i = 2, dflt = 0x34303f) => (PAL[k] ? parseInt(PAL[k][i].slice(1), 16) : dflt);
const SKIN = 0xffe2cc, INK = 0x2b2238, PINK = 0xff9fb0;
const SGEO = new Map(), sgeo = (k, f) => { if (!SGEO.has(k) && f) SGEO.set(k, f()); return SGEO.get(k); };
function part(geo, c, x, y, z, p, sx = 1, sy = sx, sz = sx) { const m = new THREE.Mesh(geo, typeof c === "number" ? toon(c) : c); m.position.set(x, y, z); m.scale.set(sx, sy, sz); p.add(m); return m; }
const pivot = (x, y, z, p) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); return g; };
const lathe = (k, pts) => sgeo(k, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 18));
const dome = (k, t0, tl, p0 = 0, pl = Math.PI * 2) => sgeo(k, () => new THREE.SphereGeometry(1, 20, 12, p0, pl, t0, tl));

// 얼굴: 눈·볼터치·입을 머리 앞쪽 껍질(머리와 같은 타원체의 일부)에 그림으로 입힌다.
// 공을 붙이면 둥근 얼굴 밖으로 튀어나오므로, 곡면을 따라 휘어 붙는 그림으로 그린다. 눈 감음 × 입 벌림 4가지를 미리 그려 바꿔 낀다
const FACE_R = [0.36, 0.335, 0.34], FACE_PHI = [Math.PI / 2 - 0.95, 1.9], FACE_TH = [1.0, 1.35], FACE_PX = 256;
const FACE_GEO = new THREE.SphereGeometry(1, 32, 24, FACE_PHI[0], FACE_PHI[1], FACE_TH[0], FACE_TH[1]);
/** 머리 기준 앞면의 점 (x, y) → [캔버스 u, v, 가로 px/단위, 세로 px/단위] */
function faceUV(x, y) {
  const th = Math.acos(Math.max(-1, Math.min(1, y / FACE_R[1]))), st = Math.sin(th);
  const ph = Math.acos(Math.max(-1, Math.min(1, -x / (FACE_R[0] * st))));
  return [((ph - FACE_PHI[0]) / FACE_PHI[1]) * FACE_PX, ((th - FACE_TH[0]) / FACE_TH[1]) * FACE_PX, FACE_PX / FACE_PHI[1] / (FACE_R[0] * st * Math.sin(ph)), FACE_PX / FACE_TH[1] / (FACE_R[1] * st)];
}
function drawFace(closed, open) {
  const c = document.createElement("canvas"); c.width = c.height = FACE_PX; const g = c.getContext("2d");
  /** 머리 기준 좌표계로 그리기: (x, y) 를 원점으로, 1 = 머리 단위 1 (위가 +y) */
  const at = (x, y, fn) => { const [u, v, sx, sy] = faceUV(x, y); g.save(); g.translate(u, v); g.scale(sx, -sy); fn(); g.restore(); };
  // 볼터치: 가장자리가 흐린 분홍
  for (const s of [-1, 1]) at(s * 0.215, -0.148, () => {
    g.scale(1, 0.62); const gr = g.createRadialGradient(0, 0, 0, 0, 0, 0.072);
    gr.addColorStop(0, "rgba(255,138,160,0.78)"); gr.addColorStop(0.6, "rgba(255,150,170,0.35)"); gr.addColorStop(1, "rgba(255,160,180,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 0.072, 0, Math.PI * 2); g.fill();
  });
  for (const s of [-1, 1]) at(s * 0.135, -0.062, () => {
    g.lineCap = "round"; g.strokeStyle = "#2b2238";
    if (closed) { g.lineWidth = 0.014; g.beginPath(); g.moveTo(-0.048, 0.004); g.quadraticCurveTo(0, -0.03, 0.048, 0.004); g.stroke(); return; }
    // 눈동자: 위는 진하고 아래로 갈수록 보랏빛, 아래쪽에 밝은 반달 (눈 속 빛)
    const gr = g.createLinearGradient(0, 0.07, 0, -0.07); gr.addColorStop(0, "#1f1830"); gr.addColorStop(0.55, "#2f2444"); gr.addColorStop(1, "#6a4a7e");
    g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 0.05, 0.068, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(190,150,215,0.55)"; g.beginPath(); g.ellipse(0, -0.034, 0.03, 0.022, 0, 0, Math.PI * 2); g.fill();
    // 윗눈꺼풀 선: 눈보다 살짝 넓은 둥근 선, 바깥쪽 끝이 조금 처져서 순한 눈매
    g.lineWidth = 0.012; g.beginPath(); g.moveTo(-0.05 * s, 0.05); g.quadraticCurveTo(0.004 * s, 0.09, 0.058 * s, 0.034); g.stroke();
    // 반짝임: 위쪽 큰 것, 아래쪽 작은 것
    g.fillStyle = "#ffffff"; g.beginPath(); g.ellipse(-0.016 * s, 0.024, 0.019, 0.022, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(0.017 * s, -0.03, 0.009, 0, Math.PI * 2); g.fill();
  });
  at(0, -0.15, () => {
    if (open) { g.fillStyle = "#8a3a4a"; g.beginPath(); g.ellipse(0, 0, 0.026, 0.022, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = "#ef8a98"; g.beginPath(); g.ellipse(0, -0.01, 0.016, 0.009, 0, 0, Math.PI * 2); g.fill(); return; }
    g.strokeStyle = "#6a3040"; g.lineWidth = 0.011; g.lineCap = "round"; g.beginPath(); g.moveTo(-0.028, 0.008); g.quadraticCurveTo(0, -0.024, 0.028, 0.008); g.stroke();
  });
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}
const FACE_MATS = [];
const faceMat = (closed, open) => FACE_MATS[(closed ? 1 : 0) + (open ? 2 : 0)] ??= drawFace(closed, open);

// 목도리 무늬: 민무늬는 색만, 골지 니트는 세로 골, 체크는 굵은 띠가 엇갈리고 가는 밝은 선 (색마다 한 번 만들어 같이 쓴다)
const SCARF_MATS = new Map();
function scarfMat(color, pattern) {
  if (pattern !== "knit" && pattern !== "check") return toon(palN(color));
  const key = color + "." + pattern; if (SCARF_MATS.has(key)) return SCARF_MATS.get(key);
  const P = PAL[color] || PAL.cream, c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  g.fillStyle = P[2]; g.fillRect(0, 0, 64, 64);
  if (pattern === "knit") for (let x = 0; x < 64; x += 8) { g.globalAlpha = 0.45; g.fillStyle = P[1]; g.fillRect(x, 0, 2, 64); g.globalAlpha = 0.55; g.fillStyle = P[3]; g.fillRect(x + 4, 0, 2, 64); }
  else {
    g.globalAlpha = 0.55; g.fillStyle = P[0]; g.fillRect(0, 18, 64, 14); g.fillRect(18, 0, 14, 64);
    g.globalAlpha = 0.35; g.fillStyle = P[1]; g.fillRect(0, 44, 64, 8); g.fillRect(44, 0, 8, 64);
    g.globalAlpha = 0.85; g.fillStyle = "#f6efe2"; g.fillRect(0, 39, 64, 2); g.fillRect(39, 0, 2, 64);
  }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 1);
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, map: tex, gradientMap: ramp }); SCARF_MATS.set(key, m); return m;
}

/** 사람 SD 인형 (발 = 원점, +z 를 본다). 엉덩이 0.3 · 머리 중심 1.02 (1.14배) · 키 약 1.45 */
const HEAD_K = 1.14, HAT_TOP = { none: 0.37, pompom: 0.57, cat: 0.54, bear: 0.49, rabbit: 0.84, muff: 0.39 };
function buildPerson(l) {
  if (DOLL) return buildDoll(dollKind(l));
  const root = new THREE.Group(), coat = l.outfit === "coat";
  const hair = palN(l.hairColor, 2, 0x2f2a3a), cloth = palN(l.outfitColor, 2, 0x3a3648), clothD = palN(l.outfitColor, 1, 0x26232f);
  const hairM = new THREE.MeshToonMaterial({ color: hair, gradientMap: ramp, side: THREE.DoubleSide });
  // 다리: 짧고 통통하게, 동그란 장화 (몸통이 들썩여도 발은 땅에)
  const legs = [-1, 1].map((s) => { const g = pivot(s * 0.09, 0.3, 0, root);
    part(sgeo("leg2", () => new THREE.CylinderGeometry(0.075, 0.07, 0.22, 10).translate(0, -0.11, 0)), coat ? 0x4a4560 : 0xf4ead8, 0, 0, 0, g);
    part(SPH, 0x9a6248, 0, -0.245, 0.03, g, 0.095, 0.075, 0.125); return g; });
  const body = pivot(0, 0.3, 0, root);
  if (coat) { // 동글동글 패딩: 누빔 줄 두 개 + 지퍼 + 두툼한 깃
    part(lathe("coat", [[0, -0.07], [0.24, -0.07], [0.28, 0.05], [0.275, 0.2], [0.22, 0.35], [0.12, 0.43], [0, 0.44]]), cloth, 0, 0, 0, body);
    for (const [y, r] of [[0.08, 0.28], [0.22, 0.27]]) { const q = part(sgeo("quilt", () => new THREE.TorusGeometry(1, 0.06, 5, 22)), clothD, 0, y, 0, body, r, r, 0.3); q.rotation.x = Math.PI / 2; }
    part(rboxGeo(0.03, 0.36, 0.03, 0.01), clothD, 0, 0.16, 0.268, body);
    const col = part(sgeo("collar", () => new THREE.TorusGeometry(0.14, 0.055, 8, 18)), cloth, 0, 0.41, 0, body); col.rotation.x = Math.PI / 2;
  } else { // 원피스: 아래로 퍼지는 치마 + 허리 리본
    part(lathe("dress", [[0, -0.11], [0.3, -0.11], [0.28, -0.05], [0.19, 0.15], [0.16, 0.3], [0.12, 0.42], [0, 0.43]]), cloth, 0, 0, 0, body);
    const rb = part(sgeo("belt", () => new THREE.TorusGeometry(1, 0.1, 5, 20)), clothD, 0, 0.15, 0, body, 0.19, 0.19, 0.2); rb.rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) part(SPH, clothD, s * 0.05, 0.16, 0.18, body, 0.05, 0.035, 0.03);
  }
  // 팔: 어깨 관절(공)이 몸통에 반쯤 묻혀 있어서 팔을 들어 올려도 몸과 이어져 보인다. 사람 기준 오른손 = -x
  // 패딩은 통통한 소매 + 누빔 + 소맷단, 원피스는 봉긋한 짧은 소매 + 맨팔. 손은 엄지가 있는 동그란 손. 손 끝에 간식 자리
  const arms = {}, food = {};
  for (const [side, s] of [["left", 1], ["right", -1]]) {
    const g = pivot(s * 0.225, 0.345, 0, body); g.userData.s = s;
    part(SPH, cloth, 0, 0, 0, g, 0.088, 0.085, 0.085);
    part(sgeo("upperArm", () => new THREE.CylinderGeometry(0.068, 0.062, 0.13, 12).translate(0, -0.065, 0)), coat ? cloth : SKIN, 0, -0.02, 0, g);
    const forearm = pivot(0, -0.15, 0, g);
    part(SPH, coat ? cloth : SKIN, 0, 0, 0, forearm, 0.062, 0.055, 0.06);
    part(sgeo("lowerArm", () => new THREE.CylinderGeometry(0.062, 0.058, 0.09, 12).translate(0, -0.045, 0)), coat ? cloth : SKIN, 0, 0, 0, forearm);
    if (coat) {
      const q = part(sgeo("sleeveQ", () => new THREE.TorusGeometry(0.066, 0.016, 6, 16)), clothD, 0, -0.08, 0, g); q.rotation.x = Math.PI / 2;
      const cuff = part(sgeo("cuff", () => new THREE.TorusGeometry(0.058, 0.024, 6, 16)), clothD, 0, -0.055, 0, forearm); cuff.rotation.x = Math.PI / 2;
    }
    part(SPH, SKIN, 0, -0.105, 0.008, forearm, 0.068, 0.07, 0.064);
    part(SPH, SKIN, -s * 0.042, -0.088, 0.038, forearm, 0.028, 0.03, 0.026);
    g.userData.forearm = forearm;
    arms[side] = g; food[side] = { anchor: pivot(0, -0.15, 0.09, forearm), key: "" };
  }
  // 머리: 크고 둥글게. 눈은 얼굴 아래쪽에 크게, 반짝이 두 개
  const hd = pivot(0, 0.72, 0, body); hd.scale.setScalar(HEAD_K);
  part(SPH, SKIN, 0, 0, 0, hd, 0.36, 0.335, 0.34);
  const face = part(FACE_GEO, faceMat(false, false), 0, 0, 0, hd, FACE_R[0] * 1.004, FACE_R[1] * 1.004, FACE_R[2] * 1.004); face.raycast = noRay;
  // 머리카락: 정수리 덮개 + 뒷머리 + 앞머리 (긴 머리는 등까지 늘어뜨림)
  const long = l.hair === "long";
  part(dome("cap", 0, 1.2), hairM, 0, 0.012, -0.005, hd, 0.38, 0.36, 0.365);
  part(dome(long ? "backL" : "backS", 0, long ? 2.3 : 1.95, Math.PI - 0.4, Math.PI + 0.8), hairM, 0, 0, -0.01, hd, 0.385, 0.36, 0.37);
  for (let i = -2; i <= 2; i++) part(SPH, hairM, i * 0.1, 0.19 - Math.abs(i) * 0.035, 0.265 - Math.abs(i) * 0.04, hd, 0.095, 0.08, 0.07);
  if (long) { part(rboxGeo(0.6, 0.5, 0.2, 0.09), hairM, 0, -0.3, -0.17, hd); for (const s of [-1, 1]) part(SPH, hairM, s * 0.31, -0.2, 0.05, hd, 0.08, 0.21, 0.09); }
  else for (const s of [-1, 1]) part(SPH, hairM, s * 0.33, -0.08, 0.05, hd, 0.05, 0.11, 0.07);
  // 모자
  if (l.hat === "pompom" || l.hat === "cat" || l.hat === "bear" || l.hat === "rabbit") {
    const H = palN(l.hatColor), HD = palN(l.hatColor, 1);
    part(dome("beanie", 0, 1.22), H, 0, 0.06, -0.01, hd, 0.395, 0.38, 0.385);
    const band = part(sgeo("band", () => new THREE.TorusGeometry(1, 0.13, 6, 22)), HD, 0, 0.19, -0.01, hd, 0.36, 0.36, 0.36); band.rotation.x = Math.PI / 2;
    if (l.hat === "pompom") part(SPH, palN("cream"), 0, 0.47, -0.02, hd, 0.1);
    else if (l.hat === "cat") { for (const s of [-1, 1]) { const e = part(sgeo("ear", () => new THREE.ConeGeometry(1, 1, 4)), H, s * 0.21, 0.45, -0.01, hd, 0.1, 0.18, 0.08); e.rotation.z = -s * 0.35; const n = part(sgeo("ear", null), glowM(PINK), s * 0.205, 0.44, 0.03, hd, 0.05, 0.11, 0.04); n.rotation.z = -s * 0.35; } }
    else if (l.hat === "bear") { for (const s of [-1, 1]) { part(SPH, H, s * 0.26, 0.4, -0.01, hd, 0.095); part(SPH, glowM(PINK), s * 0.26, 0.4, 0.06, hd, 0.05, 0.05, 0.03); } }
    else { for (const s of [-1, 1]) { const e = part(SPH, H, s * 0.13, 0.62, -0.02, hd, 0.075, 0.22, 0.055); e.rotation.z = -s * 0.18; const n = part(SPH, glowM(PINK), s * 0.128, 0.6, 0.03, hd, 0.038, 0.15, 0.02); n.rotation.z = -s * 0.18; } }
  } else if (l.hat === "muff") {
    part(sgeo("muffBand", () => new THREE.TorusGeometry(0.39, 0.025, 6, 20, Math.PI)), palN("ash"), 0, 0, 0, hd);
    for (const s of [-1, 1]) part(SPH, palN(l.hatColor), s * 0.37, -0.03, 0, hd, 0.075, 0.12, 0.12);
  }
  // 목도리: 두툼하게 두 번 감은 고리 + 매듭. 모양에 따라 끝을 짧게 / 길게 늘어뜨리거나, 얼굴 아래쪽까지 감싼다
  const tails = [];
  if (l.scarf !== "none") {
    const S = scarfMat(l.scarf, l.scarfPattern), style = l.scarfStyle;
    const ring = (y, R, t, sy, tilt) => { const r = part(sgeo(`sr${R}${t}`, () => new THREE.TorusGeometry(R, t, 10, 24)), S, 0, y, 0.01, body, 1.08, 1, sy); r.rotation.x = Math.PI / 2 + tilt; return r; };
    if (style === "cover") {
      // 얼굴 아래쪽(입·볼 아래)까지 덮는 큰 고리: 위아래로 늘린 두툼한 띠 + 아래 한 겹 더
      ring(0.47, 0.29, 0.105, 1, 0).scale.set(1.1, 1.06, 1.45);
      ring(0.37, 0.24, 0.08, 1, 0.12);
    } else {
      ring(0.43, 0.205, 0.078, 1, 0); ring(0.37, 0.215, 0.064, 1, 0.16);
    }
    // 매듭 (앞쪽 살짝 옆)
    const kz = style === "cover" ? 0.33 : 0.25;
    part(SPH, S, 0.07, style === "cover" ? 0.36 : 0.35, kz, body, 0.07, 0.06, 0.055);
    // 늘어뜨린 끝: 두 마디라서 걸을 때 흔들린다. 끝에 술(fringe)
    const tail = (x, len, lean) => {
      const seg = (p, y, z, rx, h) => { const g = pivot(0, y, z, p); g.rotation.x = rx; g.userData.rx = rx; part(rboxGeo(0.105, h, 0.036, 0.016), S, 0, -h / 2, 0, g); return g; };
      const a = pivot(x, style === "cover" ? 0.34 : 0.33, kz - 0.02, body);
      const s1 = seg(a, 0, 0, -0.32, 0.2 * len), s2 = seg(s1, -0.2 * len, 0, 0.32 + lean, 0.22 * len);
      if (len > 0.9) for (let i = 0; i < 5; i++) part(sgeo("fringe", () => new THREE.CylinderGeometry(0.006, 0.006, 0.05, 4)), S, -0.04 + i * 0.02, -0.22 * len - 0.025, 0, s2);
      tails.push(s1, s2);
    };
    if (style === "long") { tail(0.055, 1.25, coat ? 0 : -0.18); tail(-0.06, 1.05, coat ? 0.02 : -0.16); }
    else tail(0.07, style === "cover" ? 0.55 : 0.6, 0);
  }
  outline(root);
  return { root, body, head: hd, legs, arms, food, face, tails, blink: 2, top: 0.3 + 0.72 + (HAT_TOP[l.hat] ?? 0.37) * HEAD_K };
}
// ───────── Meshy 인형 (MESHY_DOLL): 뼈대가 든 GLB 하나를 사람마다 복제해 입힌다 ─────────
// 인형 여섯 벌(여자 meshy-mint · 남자 meshy-boy · 곱슬머리 meshy-child · 헤어롤 meshy-woman · 펭귄 meshy-penguin, 각 약 360~560KB · 알파카 meshy-alpaca 1.5MB): 텍스처 512 JPEG · 좌표 양자화 · meshopt 압축. 동작 idle · walk · run · sit(의자에 앉기) · wave(한 손 안녕).
// 곱슬머리(meshy-child)는 Meshy 웹에서 받은 동작 묶음이라 jump 가 더 있다: 폴짝은 jump 동작으로. (wave 가 없는 인형은 팔 뼈를 돌려 안녕한다)
// 어느 인형을 입을지는 꾸미기 값의 머리 모양으로 정한다 (short = 남자, curly = 곱슬머리, roller = 헤어롤, penguin = 펭귄, alpaca = 알파카, 그 밖 = 여자). 서버의 꾸미기 키 형식을 그대로 쓰려고.
// idle 은 안녕 동작의 첫 장면(정면을 보고 두 발을 나란히, 두 팔은 내림) 한 장면이다 (Meshy Idle 은 둘러보며 한 발이 앞에 있어서).
// 만들 때 손본 것: 걷기·뛰기의 엉덩이·허리 흔들림을 줄였고, 머리카락은 머리 뼈만 따라가게 했다 (팔을 들어도 옆머리가 끌려가지 않게).
// 키 1m 로 만들었고 발 = 원점, +z 를 본다. 뼈대(Armature)에 0.01 배율이 걸려 있어 뼈 좌표는 cm.
// 뼈 회전(동작 위에 더한다): 다리 x− = 앞으로 들기, 팔 x+ = 앞으로 뻗기, 팔 z = 옆으로 들기 (오른팔 −, 왼팔 +)
const DOLL_H = 1.45;
// 인형마다: 파일, 머리 뼈 배율·전체 배율·가로 배율 (남자 인형은 머리가 작고 몸이 가늘게 나와 여자 인형 비율에 맞춘다. 키는 그대로), 앉기 보정(없으면 DOLL_SIT)
const DOLL_KINDS = {
  girl: { file: "/models/meshy-mint.glb", head: 1, scale: 1, wide: 1 },
  boy: { file: "/models/meshy-boy.glb", head: 1.25, scale: 0.91, wide: 1.15 },
  // 곱슬머리: 키 1.2 로 만들어져 1 로 줄인다. 앉기(뒤돌아보고 앉는 동작의 마지막 장면)는 엉덩이가 덜 내려가고 덜 빠져서, 여자 인형 엉덩이 자리에 맞게 올리고 조금만 민다
  curly: { file: "/models/meshy-child.glb", head: 1, scale: 1 / 1.2, wide: 1, sit: { down: -0.075, fwd: 0.042 } },
  // 헤어롤(긴 머리 여자, meshy-doll-clips.mjs longhair): 키 1.2. 앉기 동작이 없어 같은 Meshy 뼈대인 곱슬머리의 앉기 자세를 빌린다(sitFrom).
  // 폴짝(Happy_jump, 9.8초 동안 여러 번 뛴다)은 0.7초부터 한 번 뛰는 만큼만 제 빠르기로
  roller: { file: "/models/meshy-woman.glb", head: 1, scale: 1 / 1.2, wide: 1, sit: { down: -0.075, fwd: 0.042 }, sitFrom: "curly", jump: { from: 0.7, speed: 1 } },
  // 펭귄(scripts/meshy-penguin.mjs): 키 0.8 그대로 (사람보다 작게). 동작을 직접 만들어 안녕 팔 보정(DOLL_WAVE)은 하지 않는다 (waveFix).
  // 앉기는 엉덩이가 거의 바닥까지 내려가 여자 인형 엉덩이 높이만큼 올리고, 몸이 둥글어 등받이에 묻히지 않게 앞으로 민다
  penguin: { file: "/models/meshy-penguin.glb", head: 1, scale: 1, wide: 1, h: 0.8, waveFix: false, sit: { down: -0.19, fwd: 0.1 } },
  // 알파카(scripts/fix-alpaca-rig.py → scripts/meshy-alpaca.py): 키 1.7 로 만들어져 여자 인형 키로 줄인다. 뼈 단위가 m (boneUnit, 다른 인형은 cm).
  // 동작은 idle · walk · sit 뿐이라 안녕은 팔 뼈를 돌려 흔든다.
  // 앉기는 좌판 높이에 맞춰 6cm 올리고, 모델의 뒤로 치우친 골반을 4cm 앞으로 맞춘다.
  alpaca: { file: "/models/meshy-alpaca.glb", head: 1, scale: 1 / 1.7, wide: 1, h: 1.7, boneUnit: 1, sit: { down: -0.06, fwd: 0.04 } },
};
const dollKind = (l) => (l.hair === "short" ? "boy" : l.hair === "curly" ? "curly" : l.hair === "roller" ? "roller" : l.hair === "penguin" ? "penguin" : l.hair === "alpaca" ? "alpaca" : "girl");
// 앉기 동작은 엉덩이를 6cm 내리고 19cm 뒤로 뺀다(키 1 기준). 예전 인형의 엉덩이 자리(벤치 + 0.46)에 맞게 인형을 내리고 앞으로 민다
const DOLL_SIT = { down: 0.03, fwd: 0.2 };
// 안녕: 동작 그대로면 든 손이 볼 옆 옆머리 위에 오므로, 위팔·아래팔을 바깥으로 펴고 고개를 반대쪽으로 살짝 기울인다 (인형 기준 축)
const DOLL_WAVE = [["RightArm", 0, 0, 1, 0.65], ["RightForeArm", 0, 0, 1, 0.45], ["RightArm", 1, 0, 0, 0.15], ["Head", 0, 0, 1, -0.12]];
// 안녕 동작(4.1초) 시간표: 팔 들기 0.2~0.8 · 흔들기 ~2.7 · 내리기 ~3.4. 게임의 손 흔들기(1.6초)가 끝나도 팔을 다 내릴 때까지(END) 두 배 빠르기로 이어서 돌린다.
// 중간에 끊으면 팔이 툭 떨어진다. 서 있기 자세가 안녕 동작의 첫 장면이라 끝에서 넘어갈 때 티가 나지 않는다
const DOLL_WAVE_T = { speed: 2, up: [0.2, 0.8], down: [2.7, 3.4], end: 3.45 };
const smooth01 = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
async function loadDoll(file) {
  const loader = new THREE.GLTFLoader(); loader.setMeshoptDecoder(window.MeshoptDecoder);
  try {
    const g = await loader.loadAsync(file), clips = {};
    for (const c of g.animations) {
      // 걷기·뛰기의 앞뒤 이동(루트 모션)은 지워서 제자리걸음 (이동은 게임이 한다)
      if (c.name === "walk" || c.name === "run") for (const t of c.tracks) if (/hips.*position$/i.test(t.name)) { const v = t.values; for (let i = 0; i < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; } }
      clips[c.name] = c;
    }
    if (!clips.idle || !clips.walk) throw new Error("동작이 모자람: " + Object.keys(clips));
    // 툰 재질에 부드러운 음영(DOLL_RAMP). 렌더러가 선형 출력이라 텍스처도 선형으로 읽어야 색이 그대로 나온다
    g.scene.traverse((o) => { if (!o.isSkinnedMesh) return; const map = o.material.map; if (map) map.encoding = THREE.LinearEncoding;
      // 양면: 팔 옷을 몸통 옷에서 떼어 낸 인형(meshy-doll-clips.mjs split)은 팔을 들면 이음매 틈으로 안쪽 면이 보인다
      o.material = new THREE.MeshToonMaterial({ map, color: 0xffffff, gradientMap: DOLL_RAMP, skinning: true, side: o.material.side }); });
    return { scene: g.scene, clips };
  } catch (err) { console.warn("[park] Meshy 인형을 불러오지 못했다", file, err); return null; }
}
/** 두 벌 모두 불러와야 Meshy 인형을 쓴다 (하나라도 없으면 기본 SD 인형) */
async function loadDolls() {
  if (!MESHY_DOLL || !THREE.GLTFLoader || !THREE.SkeletonUtils || !window.MeshoptDecoder) return null;
  const kinds = Object.keys(DOLL_KINDS), got = await Promise.all(kinds.map((k) => loadDoll(DOLL_KINDS[k].file)));
  if (!got.every(Boolean)) return null;
  const dolls = Object.fromEntries(kinds.map((k, i) => [k, got[i]]));
  // 앉기 동작이 없는 인형은 뼈 이름이 같은 인형의 앉기를 빌린다 (동작은 뼈 이름으로 찾아 움직인다)
  for (const k of kinds) dolls[k].clips.sit ??= dolls[DOLL_KINDS[k].sitFrom]?.clips.sit;
  if (kinds.some((k) => !dolls[k].clips.sit)) { console.warn("[park] 앉기 동작이 없는 인형이 있다"); return null; }
  return dolls;
}
const DOLL = await loadDolls();
function buildDoll(kind) {
  const K = DOLL_KINDS[kind], src = DOLL[kind];
  const root = new THREE.Group(), body = pivot(0, 0, 0, root), model = THREE.SkeletonUtils.clone(src.scene);
  model.scale.set(DOLL_H * K.scale * K.wide, DOLL_H * K.scale, DOLL_H * K.scale * K.wide); body.add(model);
  // Meshy 인형은 외곽선 메시를 덧씌우지 않고 원래 표면만 표시한다.
  model.traverse((o) => { if (!o.isSkinnedMesh) return; o.castShadow = true; o.frustumCulled = false; });
  const bone = (n) => model.getObjectByName(n);
  // 서 있기·앉기는 저절로 돌고, 걷기·안녕은 게임 시간(걸음·동작 시간)에 맞춰 장면을 고른다. 무게로 서로 넘어간다
  const mixer = new THREE.AnimationMixer(model), act = {};
  for (const n of ["idle", "walk", "sit", "wave", "jump"]) { if (!src.clips[n]) continue; const a = mixer.clipAction(src.clips[n]); a.play(); a.setEffectiveWeight(n === "idle" ? 1 : 0); a.paused = n === "walk" || n === "wave" || n === "jump"; act[n] = a; }
  // 손에 든 간식 자리: 손 뼈 끝(손가락 쪽 +y). 뼈 배율(DOLL_H × 뼈 단위)을 되돌려 간식은 원래 크기로. 뼈 단위는 cm(0.01), 알파카만 m(1)
  const food = {}, bu = K.boneUnit ?? 0.01;
  for (const [side, name] of [["left", "LeftHand"], ["right", "RightHand"]]) { const a = pivot(0, 0.07 / bu, 0.02 / bu, bone(name)); a.scale.setScalar(1 / (DOLL_H * K.scale * bu)); food[side] = { anchor: a, key: "" }; }
  // 안녕 동작이 있으면 그 위에 팔을 펴는 보정(DOLL_WAVE), 없으면 팔 뼈를 돌려서 흔든다 (poseDoll)
  const bones = { head: bone("Head"), headScale: K.head, arms: { left: bone("LeftArm"), right: bone("RightArm") }, fore: { left: bone("LeftForeArm"), right: bone("RightForeArm") },
    wave: act.wave && K.waveFix !== false ? DOLL_WAVE.map(([n, x, y, z, ang]) => [bone(n), new THREE.Vector3(x, y, z), ang]) : [] };
  // AnimationMixer may skip writing unchanged keyframes. Restore its last
  // unmodified pose before every update so procedural rotations never accumulate.
  const posed = [...new Set([bones.head, ...Object.values(bones.arms), bone("LeftForeArm"), bone("RightForeArm"), ...bones.wave.map(([b]) => b)])];
  const basePose = posed.map((b) => [b, b.quaternion.clone()]);
  const arm = {};
  for (const [side, sign] of [["left", 1], ["right", -1]]) arm[side] = {
    weight: 0, reach: 0, target: new THREE.Vector3(),
    solve: createArmIK(THREE, root, bones.arms[side], bone(side === "left" ? "LeftForeArm" : "RightForeArm"), food[side].anchor, sign),
  };
  return { root, body, head: pivot(0, 0, 0, body), legs: [], arms: {}, food, face: null, tails: [], blink: 2, top: DOLL_H * K.scale * (K.h || 1 / K.scale) + 0.02,
    doll: { mixer, act, bones, basePose, sit: K.sit || DOLL_SIT, jumpT: K.jump, w: { idle: 1, walk: 0, sit: 0, wave: 0, jump: 0 }, waveAct: null, waveT: Infinity, arm } };
}
const _dq = new THREE.Quaternion(), _dp = new THREE.Quaternion(), _dr = new THREE.Quaternion(), _dax = new THREE.Vector3();
/** 뼈를 인형(root) 기준 축으로 돌린다 (동작이 정한 자세 위에 더하기) */
function turnBone(b, root, axis, ang) {
  root.getWorldQuaternion(_dr); _dax.copy(axis).applyQuaternion(_dr);
  b.parent.getWorldQuaternion(_dp); _dq.setFromAxisAngle(_dax, ang);
  b.quaternion.premultiply(_dp.clone().invert().multiply(_dq).multiply(_dp));
}
// A bite has a gentle lift, a pause at the mouth, and a return to holding.
function eatingReach(eating) {
  if (eating.h.item.kind === "drink") return smooth01(eating.t, 0, 0.55);
  const phase = (eating.t % 2.4) / 2.4;
  return smooth01(phase, 0, 0.28) * (1 - smooth01(phase, 0.62, 0.95));
}
// 폴짝(jump 동작이 있는 인형): 2.3초 동작 중 웅크리기(0.35초)~착지(1.9초)를 게임의 폴짝 시간(0.76초)에 맞춰 두 배 빠르기로
const DOLL_JUMP_T = { from: 0.35, speed: 2 };
// 뼈로 하는 안녕(안녕 동작이 없는 인형): 위팔을 옆으로 드는 각 · 아래팔을 더 세우는 각 · 흔드는 폭 (라디안)
const DOLL_BONE_WAVE = { arm: 1.2, fore: 0.9, swing: 0.3 };
/** Meshy 인형 자세: 앉기 > 걷기 > (서 있기 ↔ 안녕 · 폴짝) 순으로 동작을 고르고, 들기·먹기는 팔을 더 돌린다 */
function poseDoll(c, m, dt, now, seat) {
  const d = m.doll, A = d.act, k = Math.min(1, dt * 10);
  const waving = c.act?.kind === "wave", walking = c.moving && !seat, jumping = !!A.jump && c.act?.kind === "jump" && !seat && !walking;
  // 새 손 흔들기가 오면 안녕 동작을 처음부터. 걷거나 앉으면 그만둔다. 앉아서 안녕은 앉기 동작 위에 팔만 든다 (안녕 동작은 서서 하는 동작이라)
  if (waving && c.act !== d.waveAct) { d.waveAct = c.act; d.waveT = 0; }
  if (walking || seat) d.waveT = Infinity; else if (d.waveT < DOLL_WAVE_T.end) d.waveT += dt * DOLL_WAVE_T.speed;
  const standWave = d.waveT < DOLL_WAVE_T.end;
  const want = { sit: seat ? 1 : 0, walk: walking ? 1 : 0, wave: standWave && A.wave ? 1 : 0, jump: jumping ? 1 : 0 };
  want.idle = !seat && !walking && !want.wave && !jumping ? 1 : 0;
  for (const n in want) { d.w[n] = ease(d.w[n], want[n], k); A[n]?.setEffectiveWeight(d.w[n]); }
  A.walk.time = ((c.walkT * 2) % 1) * A.walk.getClip().duration;
  if (A.wave) A.wave.time = standWave ? Math.min(d.waveT, A.wave.getClip().duration - 0.01) : 0;
  const J = d.jumpT || DOLL_JUMP_T;
  if (A.jump && jumping) A.jump.time = Math.min(J.from + c.act.t * J.speed, A.jump.getClip().duration - 0.01);
  for (const [bone, quaternion] of d.basePose) bone.quaternion.copy(quaternion);
  d.mixer.update(dt);
  for (const [bone, quaternion] of d.basePose) quaternion.copy(bone.quaternion);
  // 머리 배율은 동작이 매번 1 로 되돌리므로 동작 뒤에 다시 준다
  if (d.bones.headScale !== 1) d.bones.head.scale.setScalar(d.bones.headScale);
  // 팔 바깥으로 펴기 · 고개 기울이기는 팔을 드는 만큼만 (들 때 서서히 더하고, 내릴 때 서서히 뺀다)
  const raise = standWave ? smooth01(d.waveT, ...DOLL_WAVE_T.up) * (1 - smooth01(d.waveT, ...DOLL_WAVE_T.down)) : 0, wv = d.w.wave * raise;
  if (wv > 0.01) for (const [b, axis, ang] of d.bones.wave) turnBone(b, m.root, axis, ang * wv);
  m.body.position.set(0, -d.sit.down * d.w.sit, d.sit.fwd * d.w.sit);
  m.body.scale.y = c.moving || seat ? 1 : 1 + Math.sin(now * 2.6) * 0.012;
  m.body.rotation.z = c.act?.kind === "shiver" ? (Math.floor(c.act.t / 0.07) % 2 ? 0.04 : -0.04) : 0;
  const e = c.eating, kArm = 1 - Math.exp(-dt * 10);
  // 팔 뼈를 돌려 흔드는 손: 앉아서 안녕, 또는 안녕 동작이 없는 인형이 서서 안녕 (빈 손으로. 오른손에만 들었으면 왼손)
  const freeSide = c.hands.some((h) => h.side === "right") && !c.hands.some((h) => h.side === "left") ? "left" : "right";
  const seatWave = seat && waving ? freeSide : null, boneWave = !A.wave && raise > 0.01 ? freeSide : null;
  for (const side of ["left", "right"]) {
    const sign = side === "left" ? 1 : -1, h = c.hands.find((q) => q.side === side), f = m.food[side], a = d.arm[side];
    a.weight = ease(a.weight, h ? 1 : 0, kArm);
    const eating = h && e && e.h === h;
    a.reach = ease(a.reach, eating ? eatingReach(e) : 0, kArm);
    if (a.weight > 0.001) {
      m.root.updateWorldMatrix(true, true);
      const shoulder = m.root.worldToLocal(d.bones.arms[side].getWorldPosition(new THREE.Vector3()));
      const head = m.root.worldToLocal(d.bones.head.getWorldPosition(new THREE.Vector3()));
      // Hold in front of the chest; lift only the eating hand toward the mouth.
      a.target.set(shoulder.x + sign * 0.025, shoulder.y - 0.14, shoulder.z + 0.24);
      a.target.lerp(new THREE.Vector3(head.x + sign * 0.035, head.y, head.z + 0.29), a.reach);
      a.solve(a.target, a.weight);
    } else if (side === seatWave) {
      turnBone(d.bones.arms[side], m.root, new THREE.Vector3(0, 0, 1), sign * (1.5 + Math.sin(now * 14) * 0.25));
    } else if (side === boneWave) {
      // 서서 안녕: 팔을 옆으로 들고(드는 만큼 서서히) 아래팔을 세워 좌우로 흔든다
      turnBone(d.bones.arms[side], m.root, new THREE.Vector3(0, 0, 1), sign * raise * DOLL_BONE_WAVE.arm);
      turnBone(d.bones.fore[side], m.root, new THREE.Vector3(0, 0, 1), sign * raise * (DOLL_BONE_WAVE.fore + Math.sin(now * 14) * DOLL_BONE_WAVE.swing));
    }
    const key = h ? h.item.id + h.stage : "";
    if (key !== f.key) { f.key = key; f.anchor.clear(); if (h) f.anchor.add(buildFood(h.item.id, h.stage)); }
  }
}
// 두 인형 모두 같은 손 앵커와 섭취 단계를 사용한다.
const buildFood = await loadFoodSprites(THREE, MENU.keys());
/** 고등어 고양이 SD 인형 (발 = 원점, +z 를 본다) */
function buildCat() {
  const root = new THREE.Group(), C = 0xa9a2b8, D = 0x5f5873, W = 0xf6f1ea;
  const body = pivot(0, 0.2, 0, root);
  part(SPH, C, 0, 0, 0, body, 0.13, 0.12, 0.2);
  part(SPH, W, 0, -0.035, 0.07, body, 0.09, 0.085, 0.13);
  for (const z of [-0.11, -0.04, 0.03]) { const k = Math.sqrt(1 - (z / 0.2) ** 2); part(sgeo("stripe", () => new THREE.TorusGeometry(1, 0.13, 4, 14, Math.PI)), D, 0, 0, z, body, 0.13 * k + 0.004, 0.12 * k + 0.004, 0.12); }
  const head = pivot(0, 0.33, 0.17, root);
  part(SPH, C, 0, 0, 0, head, 0.14, 0.122, 0.125);
  part(SPH, W, 0, -0.037, 0.083, head, 0.066, 0.046, 0.05);
  part(SPH, glowM(0xe2788f), 0, -0.012, 0.127, head, 0.015, 0.01, 0.01);
  for (const x of [-0.028, 0, 0.028]) part(SPH, D, x, 0.075, 0.075, head, 0.011, 0.03, 0.02);
  const eyes = [-1, 1].map((s) => part(SPH, glowM(INK), s * 0.052, 0.012, 0.104, head, 0.018, 0.026, 0.012));
  for (const s of [-1, 1]) { const e = part(sgeo("ear", () => new THREE.ConeGeometry(1, 1, 4)), C, s * 0.085, 0.12, -0.01, head, 0.062, 0.12, 0.04); e.rotation.z = -s * 0.3; const n = part(sgeo("ear", null), glowM(PINK), s * 0.083, 0.11, 0.012, head, 0.034, 0.075, 0.02); n.rotation.z = -s * 0.3; }
  const mouth = part(SPH, glowM(0x8a3a4a), 0, -0.065, 0.1, head, 0.022, 0.001, 0.012);
  const legs = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([s, f]) => { const g = pivot(s * 0.065, 0.16, f * 0.11, root); g.userData.f = f;
    part(sgeo("catLeg", () => new THREE.CylinderGeometry(0.032, 0.03, 0.16, 8).translate(0, -0.08, 0)), C, 0, 0, 0, g);
    part(SPH, W, 0, -0.158, 0.01, g, 0.038, 0.025, 0.045); return g; });
  const tail = []; let p = pivot(0, 0.04, -0.18, body);
  for (let i = 0; i < 4; i++) { part(sgeo("tail", () => new THREE.CylinderGeometry(0.022, 0.027, 0.085, 8).translate(0, 0.042, 0)), i % 2 ? D : C, 0, 0, 0, p); tail.push(p); p = pivot(0, 0.08, 0, p); }
  head.scale.setScalar(1.12); root.scale.setScalar(1.15);
  outline(root);
  return { root, body, head, eyes, mouth, legs, tail };
}
// 고양이 자세 (y 몸 높이 · bp 몸 기울기 · hy/hz 머리 · hp/hr 머리 숙임/갸웃 · fh/bh 앞/뒷다리 뿌리 · fl/bl 다리 각도 · fs/bs 다리 길이 · tt/tc 꼬리 들기/말기 · eye 눈 뜸 · mouth · paw 앞발 들기)
const CP_STAND = { y: 0.2, bp: 0, bz: 0, hy: 0.33, hz: 0.17, hp: 0, hr: 0, fh: 0.16, bh: 0.16, fl: 0, bl: 0, fs: 1, bs: 1, tt: 0.9, tc: 0.25, eye: 1, mouth: 0, paw: 0 };
const CP_SIT = { ...CP_STAND, y: 0.2, bp: -0.6, bz: -0.05, hy: 0.4, hz: 0.1, bh: 0.08, bl: -1.4, bs: 0.6, tt: 2.3, tc: 0.35 };
const CAT_POSE = {
  stand: CP_STAND, walk: CP_STAND, run: { ...CP_STAND, hz: 0.19, tt: 1.3, tc: 0.1 }, hop: { ...CP_STAND, tt: 0.4 }, sit: CP_SIT,
  loaf: { ...CP_STAND, y: 0.13, hy: 0.25, fh: 0.06, bh: 0.06, fs: 0.3, bs: 0.3, tt: 2.1, tc: 0.55, eye: 0.85 },
  sleep: { ...CP_STAND, y: 0.11, hy: 0.16, hz: 0.15, hp: 0.6, hr: 0.4, fh: 0.05, bh: 0.05, fs: 0.25, bs: 0.25, tt: 2.4, tc: 0.75, eye: 0.12 },
  groom: { ...CP_SIT, hp: 0.5, hr: 0.35, paw: -1.6, eye: 0.4 },
  stretch: { ...CP_STAND, y: 0.18, bp: 0.35, bz: 0.02, hy: 0.19, hz: 0.25, hp: -0.15, fh: 0.1, fl: -1.1, tt: 0.5, tc: 0, eye: 0.3 },
  meow: { ...CP_SIT, hp: -0.45, mouth: 1 },
};

const LOOK_KEYS = ["hair", "outfit", "hairColor", "outfitColor", "hat", "hatColor", "scarf", "scarfStyle", "scarfPattern"]; // lookKey 순서
/** 다른 사람의 꾸미기 조합. 모르는 값은 기본값으로 */
function parseLook(key) {
  const v = String(key || "").split("."), l = { ...DEFAULT_LOOK };
  LOOK_KEYS.forEach((k, i) => { if (OPTIONS[k].some((o) => (Array.isArray(o) ? o[0] : o) === v[i])) l[k] = v[i]; });
  if (l.hair !== "long") l.outfit = "coat"; return l;
}

// 방향 이름은 서버와 같은 세계 방향 (down = +z, right = +x)
const yawOf = (f) => { const v = FACE_VEC[f] || FACE_VEC.down; return Math.atan2(v[0], v[1]); };
const turn = (a, b, k) => { const d = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI; return a + d * Math.min(1, k); };
const ease = (a, b, k) => a + (b - a) * Math.min(1, k);

/**
 * 사람 자세: 걷기(다리·팔 흔들기) · 앉기(벤치 앞을 보고 다리를 앞으로) · 들기/먹기 · 손 흔들기 · 폴짝 · 덜덜.
 * c = 나(player) 또는 다른 사람: { model, pos, facing, yaw, hop, moving, walkT, seat(벤치), hands[{item, side, stage}], eating{h, t}, act{kind, t} }
 */
function posePerson(c, dt, now) {
  const m = c.model, seat = c.seat;
  let yaw = yawOf(c.facing), y = c.pos.y;
  if (seat) { yaw = seat.yaw; y = seat.group.position.y + 0.16; }
  c.yaw = turn(c.yaw, yaw, dt * 14);
  // jump 동작이 있는 인형은 동작이 직접 뛰므로 몸 전체를 튀기지 않는다
  const [ox, oy] = c.act?.kind === "jump" && m.doll?.act.jump ? [0, 0] : actOffset(c.act, !!seat), hopY = c.hop > 0 ? Math.sin((1 - c.hop / 0.45) * Math.PI) * 0.22 : 0;
  const seatedAt = seat?.slots.reduce((best, slot) => Math.hypot(slot.x - c.pos.x, slot.z - c.pos.z) < Math.hypot(best.x - c.pos.x, best.z - c.pos.z) ? slot : best);
  m.root.position.set(seatedAt?.x ?? c.pos.x, y + hopY + oy * ART, seatedAt?.z ?? c.pos.z).addScaledVector(camRight, ox * ART * 1.5); m.root.rotation.y = c.yaw;
  if (m.doll) return poseDoll(c, m, dt, now, seat);
  const ph = c.walkT * Math.PI * 4, w = c.moving ? Math.sin(ph) : 0, k = dt * 14;
  for (const [i, g] of m.legs.entries()) g.rotation.x = ease(g.rotation.x, seat ? -1.45 : (i ? -w : w) * 0.6, k);
  // 통통 튀는 걸음: 몸이 위아래로 튀고, 내려앉을 때 살짝 눌린다
  const bounce = c.moving ? Math.abs(Math.sin(ph)) : 0;
  m.body.position.y = 0.3 + bounce * 0.05;
  m.body.rotation.x = ease(m.body.rotation.x, c.moving ? 0.08 : seat ? -0.06 : 0, k);
  m.body.scale.y = c.moving ? 0.96 + bounce * 0.05 : 1 + Math.sin(now * 2.6) * 0.012;
  m.head.rotation.z = c.moving ? Math.sin(ph) * 0.04 : Math.sin(now * 1.3) * 0.035;
  const e = c.eating, bite = e ? eatingReach(e) : 0;
  const waveSide = c.act?.kind === "wave" ? (c.hands.some((h) => h.side === "right") && !c.hands.some((h) => h.side === "left") ? "left" : "right") : null;
  for (const side of ["left", "right"]) {
    const g = m.arms[side], s = g.userData.s, h = c.hands.find((q) => q.side === side), f = m.food[side];
    let rx = (side === "left" ? -w : w) * 0.5, rz = s * 0.2;
    let elbow = 0;
    if (h) { rx = -0.4; rz = s * 0.1; elbow = -0.8; if (e && e.h === h) { rx -= bite * 1.25; elbow -= bite * 0.6; rz = s * (0.1 - bite * 0.35); } }
    // 손 흔들기: 팔을 얼굴 옆으로 비스듬히 들어 볼 옆에서 흔든다 (똑바로 들면 큰 머리에 손이 묻힘)
    if (side === waveSide && !h) { rx = -0.45; rz = s * (1.95 + Math.sin(now * 14) * 0.3); }
    if (seat && !h && side !== waveSide) { rx = -0.5; rz = s * 0.12; }
    g.rotation.x = ease(g.rotation.x, rx, k); g.rotation.z = side === waveSide && !h ? rz : ease(g.rotation.z, rz, k);
    g.userData.forearm.rotation.x = ease(g.userData.forearm.rotation.x, elbow, Math.min(1, k));
    const key = h ? h.item.id + h.stage : "";
    if (key !== f.key) { f.key = key; f.anchor.clear(); if (h) f.anchor.add(buildFood(h.item.id, h.stage)); }
  }
  // 먹을 때는 입을 벌리고, 평소엔 웃는 입. 가끔 눈을 깜빡인다
  m.blink -= dt; if (m.blink < -0.12) m.blink = 2 + Math.random() * 3;
  m.face.material = faceMat(m.blink < 0, bite > 0.15);
  // 목도리 끝: 걸을 때 몸 반대로 살랑, 서 있으면 숨쉬듯 조금. 앉으면 무릎 쪽으로 눕힌다
  // (rotation.x 가 작을수록 끝이 몸 앞쪽으로 들린다)
  const sway = c.moving ? Math.sin(ph + 0.8) * 0.12 + 0.18 : Math.sin(now * 1.6) * 0.03 + 0.02;
  for (const [i, t] of m.tails.entries()) t.rotation.x = ease(t.rotation.x, t.userData.rx - (i % 2 ? sway * 0.5 : sway) - (seat && i % 2 ? 0.5 : 0), k);
  m.body.rotation.z = c.act?.kind === "shiver" ? (Math.floor(c.act.t / 0.07) % 2 ? 0.04 : -0.04) : 0;
}
function dressPlayer() { if (player.model) scene.remove(player.model.root); player.model = buildPerson(state.look); scene.add(player.model.root); }

/** 고양이 자세: 자세값을 부드럽게 옮겨 가고, 걷기·뛰기는 대각선 다리를 함께 흔든다. c = 동물 하나 { model, pos, facing, yaw, pp, action, animT } */
function poseCat(c, dt, now) {
  const m = c.model, P = CAT_POSE[c.action] || CP_SIT, q = c.pp, k = dt * 9;
  for (const key in P) q[key] = ease(q[key], P[key], k);
  c.yaw = turn(c.yaw, yawOf(c.facing), dt * 10);
  const moving = ["walk", "run", "hop"].includes(c.action), fq = c.action === "run" ? 6.5 : c.action === "hop" ? 5 : 3.2, sw = moving ? Math.sin(c.animT * Math.PI * 2 * fq) : 0, amp = c.action === "run" ? 0.85 : 0.55;
  const hop = c.action === "hop" ? Math.abs(Math.sin(c.animT * Math.PI * 2.5)) * 0.12 : c.action === "run" ? Math.abs(sw) * 0.03 : 0;
  m.root.position.set(c.pos.x, c.pos.y + hop, c.pos.z); m.root.rotation.y = c.yaw;
  m.body.position.set(0, q.y, q.bz); m.body.rotation.x = q.bp; m.body.scale.y = 1 + (c.action === "sleep" || c.action === "loaf" ? Math.sin(now * 1.8) * 0.03 : 0);
  m.head.position.set(0, q.hy, q.hz); m.head.rotation.x = q.hp; m.head.rotation.z = q.hr + (c.action === "sit" ? Math.sin(now * 0.9) * 0.08 : 0);
  m.legs.forEach((g, i) => { const front = g.userData.f > 0, pair = i === 0 || i === 3 ? 1 : -1;
    g.position.y = front ? q.fh : q.bh; g.position.z = (front ? 0.11 : -0.11) + q.bz; g.scale.y = front ? q.fs : q.bs;
    g.rotation.x = (front ? q.fl : q.bl) + sw * amp * pair + (i === 0 ? q.paw + (c.action === "groom" ? Math.sin(now * 10) * 0.25 : 0) : 0); });
  m.tail.forEach((g, i) => { g.rotation.x = i ? -q.tc : -q.tt; g.rotation.z = i ? 0 : Math.sin(now * (c.action === "sleep" ? 0.8 : 2)) * (moving ? 0.15 : 0.3); });
  const blink = Math.sin(now * 0.7) > 0.985 ? 0.1 : 1;
  for (const e of m.eyes) e.scale.y = 0.026 * Math.min(q.eye, blink);
  m.mouth.scale.y = 0.001 + q.mouth * 0.018;
}

// ───────── 이모티콘 (5-4·5-5): 머리 위 말풍선, 안녕=손 흔들기, 하하=폴짝, 추워=덜덜. 목록·순서는 shared/data/emotes.json ─────────
const EMOTES = EMOTE_DEFS.map((e) => [e.id, localized(e.name), e.action]);
const EMOTE_IX = new Map(EMOTES.map((e, i) => [e[0], i])), ACT_SEC = { wave: 1.6, jump: 0.76, shiver: 1.5 };
const emoteFrame = (i) => `${i * 100 / (EMOTES.length - 1)}% 0`;
function showBubble(b, i) { b.style.backgroundPosition = emoteFrame(i); b.classList.remove("hidden", "out", "pop"); void b.offsetWidth; b.classList.add("pop"); }
/** 캐릭터 c 머리 위에 이모티콘 (늦게 들어와서 본 것은 남은 시간만큼만) */
function showEmote(c, id, remainingMs) {
  const i = EMOTE_IX.get(id); if (i === undefined) return;
  c.emote = { t: 0, dur: remainingMs / 1000 }; c.act = EMOTES[i][2] && remainingMs > EMOTE_SHOW_MS - 300 ? { kind: EMOTES[i][2], t: 0 } : null; showBubble(c.bubble, i);
}
function updateEmoteOf(c, dt) {
  if (c.emote && (c.emote.t += dt) >= c.emote.dur) { c.emote = null; c.bubble.classList.add("hidden"); } else if (c.emote && c.emote.t > c.emote.dur - 0.3) c.bubble.classList.add("out");
  if (c.act && (c.act.t += dt) >= ACT_SEC[c.act.kind]) c.act = null;
}
/** 동작에 따른 흔들림 (예전 도트 시트 픽셀 단위): 폴짝은 위로, 덜덜은 좌우 1px */
function actOffset(a, seated) {
  if (!a) return [0, 0];
  if (a.kind === "jump") return seated ? [0, 0] : [0, Math.round(10 * Math.sin(Math.PI * ((a.t % 0.38) / 0.38)))];
  if (a.kind === "shiver") return [Math.floor(a.t / 0.07) % 2 ? 1 : -1, 0];
  return [0, 0];
}

// ───────── 상태 ─────────
// 내 캐릭터는 서버와 같은 고정 틱(TICK_SEC)·같은 step() 으로 움직이고(px), 화면은 직전 틱~현재 틱 사이를 보간한다
const spawn = layer("spawns").objects[0];
const state = { mode: "boot", look: { ...DEFAULT_LOOK }, nick: "", idle: 0 };
try { const s = JSON.parse(localStorage.getItem("parkPixel3d") || "{}"); if (s.look && typeof s.look === "object") for (const k of Object.keys(DEFAULT_LOOK)) { const ok = OPTIONS[k].some((v) => (Array.isArray(v) ? v[0] : v) === s.look[k]); if (ok) state.look[k] = s.look[k]; } if (state.look.hair !== "long") state.look.outfit = "coat"; } catch {}
const save = () => { try { localStorage.setItem("parkPixel3d", JSON.stringify({ look: state.look })); } catch {} };
const newChar = (shadowW = 0.85) => ({ model: null, pos: new THREE.Vector3(), facing: "down", yaw: 0, hop: 0, moving: false, walkT: 0, seat: null, hands: [], handsKey: "", eating: null, act: null, emote: null, eatSaid: -1, steamT: 0, shadow: makeShadow(shadowW) });
const player = Object.assign(newChar(), { tag: $("tag"), bubble: $("emoteBubble") });
state.pos = player.pos;
const sim = { prev: { x: spawn.x, y: spawn.y }, cur: { x: spawn.x, y: spawn.y }, facing: "down", moving: false, seated: false };
const placePlayer = (alpha) => { const x = sim.prev.x + (sim.cur.x - sim.prev.x) * alpha, y = sim.prev.y + (sim.cur.y - sim.prev.y) * alpha; player.pos.set(x / 32, heightAt(x / 32, y / 32), y / 32); };
placePlayer(1); dressPlayer();

const FACE_VEC = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0], "down-left": [-1, 1], "down-right": [1, 1], "up-left": [-1, -1], "up-right": [1, -1] };
const toFacing = (v) => (FACINGS.includes(v) ? v : "down");
const toCatAction = (v) => (CAT_ACTIONS.includes(v) ? v : "stand");

// ───────── 서버 연결: 로그인 토큰으로 채널(ParkRoom)에 들어가 상태를 받는다. 다른 사람·고양이는 서버 시간 기준으로 조금 과거를 보간해서 그린다 ─────────
const net = { room: null, user: null, token: "", status: "off", leaveReason: undefined, leaveCode: undefined, clock: new ServerClock(), lag: new LagSim(LAG_MS), prediction: new Prediction(), corrections: 0, lastCorrection: 0, health: "checking" };
const remotes = new Map(), animals = new Map();
const myView = () => net.room?.state?.players?.get(net.room.sessionId);
const serverTick = () => net.room?.state?.tick ?? 0;
const othersLatest = () => [...remotes.values()].map((r) => r.latest);
const online = () => net.status === "online";
function send(type, payload) { const room = net.room; if (online()) net.lag.run(() => room.send(type, payload)); }

/** 플레이어 한 명의 이모티콘 변화 감지. emoteTick 이 바뀌면 새 이모티콘 (늦게 들어왔으면 남은 시간만큼) */
function emoteWatcher(room) {
  let seen = 0;
  return (p) => {
    if (p.emoteTick === seen) return null; seen = p.emoteTick;
    const remainingMs = EMOTE_SHOW_MS - (room.state.tick - p.emoteTick) * TICK_MS;
    return p.emote && remainingMs > 0 ? { id: p.emote, remainingMs } : null;
  };
}
function addRemote(sessionId, p) {
  const tag = document.createElement("div"), bubble = document.createElement("div"); tag.className = "tag other"; bubble.className = "ebub other hidden"; document.body.append(tag, bubble);
  const r = Object.assign(newChar(), { sessionId, look: null, nickname: p.nickname, tag, bubble, buffer: new SnapshotBuffer(), latest: { x: p.x, y: p.y }, px: { x: p.x, y: p.y } });
  r.pos.set(p.x / 32, heightAt(p.x / 32, p.y / 32), p.y / 32); tag.textContent = p.nickname;
  remotes.set(sessionId, r); return r;
}
function setRemoteLook(r, key) {
  if (key === r.look) return; r.look = key;
  if (r.model) scene.remove(r.model.root);
  r.model = buildPerson(parseLook(key)); r.model.root.userData.remote = r; scene.add(r.model.root);
}
function removeRemote(id) { const r = remotes.get(id); if (!r) return; if (r.model) scene.remove(r.model.root); scene.remove(r.shadow); r.tag.remove(); r.bubble.remove(); remotes.delete(id); }
function addAnimal(id, a) {
  const c = { id, name: a.name, model: buildCat(), pos: new THREE.Vector3(a.x / 32, heightAt(a.x / 32, a.y / 32), a.y / 32), px: { x: a.x, y: a.y }, facing: toFacing(a.facing), yaw: 0, pp: { ...CP_SIT }, action: "sit", animT: 0, zzz: 0, shadow: makeShadow(0.7),
    buffer: new SnapshotBuffer((s) => s), shownFx: a.fxTick };
  scene.add(c.model.root); animals.set(id, c); return c;
}
function removeAnimal(id) { const c = animals.get(id); if (!c) return; scene.remove(c.model.root); scene.remove(c.shadow); animals.delete(id); }
function clearWorld() { for (const id of [...remotes.keys()]) removeRemote(id); for (const id of [...animals.keys()]) removeAnimal(id); }

function attachRoom(room) {
  Object.assign(net, { room, status: "online", leaveReason: undefined, leaveCode: undefined, clock: new ServerClock(), prediction: new Prediction() });
  console.info(`[net] 채널 ${room.roomId} 접속 (${room.sessionId})`);
  const mine = () => net.room === room;
  const cb = stateCallbacks(room);
  cb.onAdd("players", (p, sessionId) => {
    if (!mine()) return;
    const emote = emoteWatcher(room);
    if (sessionId === room.sessionId) {
      let first = true;
      const emit = () => {
        if (!mine()) return;
        const e = emote(p); if (e) net.lag.run(() => { showEmote(player, e.id, e.remainingMs); sound.play("pop", 0.6); });
        // 콜백 시점의 값을 복사해 두고 지연 후 전달
        const st = { pos: { x: p.x, y: p.y }, seq: p.seq }, isFirst = first; first = false;
        net.lag.run(() => mine() && onOwnState(st, isFirst));
      };
      emit(); cb.onChange(p, emit); return;
    }
    const r = addRemote(sessionId, p);
    const push = () => {
      if (!mine()) return;
      const e = emote(p); if (e) net.lag.run(() => showEmote(r, e.id, e.remainingMs));
      const snap = { t: room.state.tick * TICK_MS, x: p.x, y: p.y, facing: toFacing(p.facing), moving: p.moving, seated: p.seatId !== "", seatId: p.seatId };
      const look = p.look, nickname = p.nickname;
      net.lag.run(() => { r.latest = { x: snap.x, y: snap.y }; r.buffer.push(snap); r.nickname = nickname; setRemoteLook(r, look); });
    };
    push(); cb.onChange(p, push);
  });
  // 매 틱 도착 시각으로 서버 시계를 맞춘다 (다른 사람 보간 기준)
  cb.listen("tick", (tick) => { const st = tick * TICK_MS; net.lag.run(() => mine() && net.clock.observe(st, performance.now())); });
  cb.onAdd("animals", (a, id) => {
    if (!mine()) return;
    const c = addAnimal(id, a);
    const push = () => { const snap = { t: room.state.tick * TICK_MS, x: a.x, y: a.y, facing: toFacing(a.facing), action: toCatAction(a.action), fx: a.fx, fxTick: a.fxTick }; net.lag.run(() => c.buffer.push(snap)); };
    push(); cb.onChange(a, push);
  });
  cb.onRemove("animals", (_a, id) => net.lag.run(() => mine() && removeAnimal(id)));
  cb.onRemove("players", (_p, id) => net.lag.run(() => mine() && removeRemote(id)));
  room.onMessage(MSG.notice, (n) => net.lag.run(() => mine() && onNotice(n)));
  room.onMessage(MSG.announce, (m) => mine() && typeof m?.text === "string" && showAnnouncement(m.text));
  room.onLeave((code) => {
    if (!mine()) return;
    const leaveReason = code === CLOSE_CODE.duplicateLogin ? "duplicateLogin" : code === CLOSE_CODE.kicked ? "kicked" : "disconnected";
    Object.assign(net, { status: "offline", leaveCode: code, leaveReason });
    clearWorld(); closeMenu(); closeHandMenu();
  });
}

/** 서버가 확인해 준 내 위치: 처음이면 그 자리로(입장 위치는 서버가 정함), 아니면 남은 입력을 다시 적용해 예측 위치를 바로잡는다 */
let ghost = null;
function onOwnState(st, first) {
  if (ghost) ghost.position.set(st.pos.x / 32, heightAt(st.pos.x / 32, st.pos.y / 32) + 0.5, st.pos.y / 32);
  if (first) { sim.prev = { ...st.pos }; sim.cur = { ...st.pos }; follower.cancel(); return; }
  const c = net.prediction.reconcile(st.pos, st.seq, GRID, othersLatest()), err = Math.hypot(c.x - sim.cur.x, c.y - sim.cur.y);
  if (err > 0) { net.lastCorrection = err; net.corrections++; sim.prev = { x: sim.prev.x + c.x - sim.cur.x, y: sim.prev.y + c.y - sim.cur.y }; sim.cur = { ...c }; }
}

/** 서버 알림: 손이 꽉 참·자리 다 참은 머리 위 말풍선, 나머지는 화면 안내 */
function onNotice(n) {
  const item = n.item ? localized(MENU.get(n.item)?.name ?? { ko: n.item }) : "";
  const text = t(`notice.${n.code}`, { item });
  if (n.code === "HANDS_FULL" || n.code === "SEAT_FULL") say(text); else toast(text, 3000);
  if (n.code === "ORDER_READY") { popText("야호!", player.pos, 1.9); sound.play("ready", 0.8); }
}

// 관리자 공지 (7-2): 화면 위 가운데 10초
let announceTimer = 0;
function showAnnouncement(text) {
  setText("announce", t("announce.prefix", { text })).classList.remove("hidden");
  clearTimeout(announceTimer); announceTimer = setTimeout(() => $("announce").classList.add("hidden"), 10_000);
}

// 소리 (6-2): 배경 음악(입장 후), 가까운 트럭 조리 소리, 간식 완성 띵동, 내 이모티콘 뽁. 음소거는 오른쪽 위 스피커 버튼
const sound = new ParkSound();
const SIZZLE_RANGE_PX = 320, SIZZLE_MAX = 0.6;
function applySound() { const s = getSettings(); sound.setVolume(s.volume, s.muted); $("muteBtn").textContent = s.muted ? "🔇" : "🔊"; }
function updateSound(dt) {
  let target = 0;
  if (state.mode === "play") for (const tr of trucks) {
    if (!net.room?.state?.trucks?.get(tr.id)?.cookingItem) continue;
    const b = tr.place.box, dx = Math.max(b.left - sim.cur.x, 0, sim.cur.x - b.right), dy = Math.max(b.top - sim.cur.y, 0, sim.cur.y - b.bottom);
    target = Math.max(target, (1 - Math.hypot(dx, dy) / SIZZLE_RANGE_PX) * SIZZLE_MAX);
  }
  sound.updateSizzle(target, dt);
}

// 오늘의 공원 (7-3): 미니맵 왼쪽, 오늘 방문자 수 + 인기 간식 3위. 1분마다 (좁은 화면은 한 줄)
async function refreshToday() {
  let s; try { s = await fetchStatsToday(); } catch { return; }
  const name = (id) => localized(MENU.get(id)?.name ?? { ko: id });
  const rows = s.topSnacks.map((x, i) => `<div class="row"><span class="ic" style="${foodIcon(x.item)}"></span><span>${t("stats.snackRow", { rank: i + 1, item: name(x.item), count: x.count })}</span></div>`).join("");
  const top = s.topSnacks[0];
  $("today").innerHTML = `<div class="full"><header>${t("stats.title")}</header><div>${t("stats.visitors", { visitors: s.visitors })}</div><small>${t("stats.topSnacks")}</small>${rows || `<small>${t("stats.noSnacks")}</small>`}</div>
    <div class="compact">${top ? t("stats.compact", { visitors: s.visitors, item: name(top.item) }) : t("stats.compactNoSnack", { visitors: s.visitors })}</div>`;
  $("today").classList.remove("hidden");
}
const say = (text) => popAt(text, player.pos, (player.model?.top ?? 1.4) + 0.45, "bub");

/** 손에 든 간식(서버 HeldFoodView 목록)을 화면용으로. 바뀌었으면 이전 목록을 돌려준다 */
function syncHands(c, hands) {
  const list = hands ? Array.from(hands) : [], sig = list.map((h) => `${h.hand}:${h.item}:${h.stage}:${h.eating ? 1 : 0}`).join(",");
  if (sig === c.handsKey) return null;
  const before = c.hands; let eatH = null; c.handsKey = sig;
  c.hands = list.map((h) => { const item = MENU.get(h.item); if (!item) return null; const o = { item, side: h.hand === "left" ? "left" : "right", stage: h.stage, eating: h.eating }; if (h.eating) eatH = o; return o; }).filter(Boolean);
  const same = eatH && c.eating && c.eating.h.item === eatH.item && c.eating.h.side === eatH.side;
  c.eating = eatH ? { h: eatH, t: same ? c.eating.t : 0 } : null; if (!same) c.eatSaid = -1;
  if (c.hands.length > before.length) c.hop = 0.45;
  return before;
}
/** 먹는 동안 '냠'·'호록', 뜨거운 간식은 김. 다 먹으면 폴짝 */
function foodFx(c, dt, before) {
  if (before && before.some((h) => h.eating) && c.hands.length < before.length) { c.hop = 0.45; popText("맛있다 ♥", c.pos, 1.9); }
  for (const h of c.hands) if (h.item.hot && (c.steamT -= dt) <= 0) { c.steamT = 0.6; puff(new THREE.Vector3(c.pos.x, c.pos.y + 0.85, c.pos.z), { size: 0.05, life: 1, rise: 0.4, op: 0.6 }); }
  const e = c.eating; if (!e) return;
  e.t += dt; const bite = Math.floor(e.t);
  if (bite !== c.eatSaid && e.t % 1 > 0.5) { c.eatSaid = bite; popText(t(e.h.item.kind === "drink" ? "eat.sip" : "eat.bite"), c.pos, 1.8, 0.4); }
}

// ───────── 이동: 서버와 같은 step()·발밑 충돌·A* (shared). 클릭은 경로를 따라 8방향 입력으로 바꿔 보낸다 ─────────
const follower = new PathFollower();
const PITCH = [0.3, 1.2];
const view = { yawT: Math.PI / 4, pitchT: 0.62, distT: 13 }, DIST = [6, 26];
const VIEW_T = new THREE.Vector2(Math.SQRT1_2, Math.SQRT1_2), VIEW_R = new THREE.Vector2(Math.SQRT1_2, -Math.SQRT1_2);
const keys = new Set();
let tickAcc = 0, standRequested = false, afterStand = null, pending = null;
/** 세계 방향 벡터 → 8방향 입력 (22.5° 기준으로 나눔) */
const axisOf = (mx, mz) => { const l = Math.hypot(mx, mz); if (l < 1e-6) return NO_INPUT; mx /= l; mz /= l; return { x: Math.abs(mx) > 0.38 ? Math.sign(mx) : 0, y: Math.abs(mz) > 0.38 ? Math.sign(mz) : 0 }; };
/** WASD·방향키는 지금 시점 기준 (앞 = 화면 위쪽) */
function readKeys() {
  const f = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0), rg = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  return f || rg ? axisOf(-VIEW_T.x * f + VIEW_R.x * rg, -VIEW_T.y * f + VIEW_R.y * rg) : NO_INPUT;
}
/** 누른 채 끌기: 손가락이 가리키는 땅 쪽으로 계속 걷는다 */
function steerInput() {
  if (!steer?.active) return NO_INPUT;
  setRay(steer.x, steer.y); const g = groundPoint(); if (!g) return NO_INPUT;
  const dx = g.x * 32 - sim.cur.x, dy = g.z * 32 - sim.cur.y; return Math.hypot(dx, dy) < 6 ? NO_INPUT : axisOf(dx, dy);
}
function simTick(input) {
  const next = step(sim.cur, input, TICK_SEC, GRID, othersLatest());
  sim.facing = facingFromInput(input, sim.facing);
  sim.moving = isMoving(input) && (next.x !== sim.cur.x || next.y !== sim.cur.y);
  sim.prev = sim.cur; sim.cur = next;
}
function sendInput(input) { if (!online()) return; const msg = net.prediction.nextInput(input); if (msg) send(MSG.input, msg); }
function fixedTick() {
  if (state.mode !== "play") { simTick(NO_INPUT); sendInput(NO_INPUT); return; }
  const kb = readKeys(), drag = steerInput();
  if (sim.seated) {
    // 앉아 있는 동안은 움직이지 않고, 방향키·끌기를 하면 일어나기를 요청한다 (서버가 자리 앞에 세움)
    if (isMoving(kb) || isMoving(drag)) requestStand();
    simTick(NO_INPUT); sendInput(NO_INPUT); return;
  }
  const manual = isMoving(kb) ? kb : drag;
  // 키보드·끌기로 움직이면 클릭 이동(트럭·자리·고양이로 걸어가기 포함)은 취소
  if (isMoving(manual) && follower.active) { follower.cancel(); pending = null; }
  const input = isMoving(manual) ? manual : follower.next(sim.cur, TICK_MS / 1000);
  simTick(input); sendInput(input);
}
/** 그 지점(px)이 있는 칸으로 길을 찾아 걸어간다. 막힌 곳·갈 수 없는 곳이면 false */
function walkTo(target) {
  const goal = tileOf(target, TILE_SIZE);
  if (isBlockedTile(GRID, goal.col, goal.row)) return false;
  const path = findPath(GRID, tileOf(sim.cur, TILE_SIZE), goal);
  if (!path) return false;
  const wps = path.length > 0 ? path.map((s) => tileCenter(s, TILE_SIZE)) : [tileCenter(goal, TILE_SIZE)];
  follower.start(wps); const d = wps[wps.length - 1]; dest.position.set(d.x / 32, heightAt(d.x / 32, d.y / 32) + 0.03, d.y / 32);
  return true;
}
function requestStand() { if (standRequested) return; standRequested = true; send(MSG.stand); }
/** 앉기는 서버 상태를 따른다 (앉으면 서버가 칸으로 옮겨서 보정으로 들어온다) */
function syncSeat() {
  const me = myView(), seat = me?.seatId ? SEATS.find((s) => s.id === me.seatId) : null;
  sim.seated = !!seat; player.seat = seat || null;
  if (seat) { sim.facing = toFacing(me.facing); sim.moving = false; }
  else { standRequested = false; const next = afterStand; afterStand = null; next?.(); }
}
/** 클릭해서 걸어가던 곳(트럭·자리·고양이)에 도착하면 할 일 */
function arrivePending() {
  if (!pending || follower.active) return;
  const p = pending; pending = null;
  if (p.kind === "truck" && isAtTruckFront(sim.cur, p.truck.place)) interactTruck(p.truck, false);
  else if (p.kind === "seat" && !sim.seated && seatsInRange(sim.cur, SEAT_LIST).includes(p.seat)) send(MSG.sit, { seat: p.seat.id });
  else if (p.kind === "animal") { const a = animals.get(p.id); if (a && Math.hypot(a.px.x - sim.cur.x, a.px.y - sim.cur.y) <= PET_RANGE_PX) send(MSG.pet, { animal: p.id }); }
}

// ───────── 간식 트럭 (4-1~4-4): 트럭 앞에서 메뉴 → 주문 → 대기열·조리는 서버. 손은 최대 2개 ─────────
for (const tr of trucks) tr.place = TRUCK_PLACES.get(tr.id);
const truckInFront = () => trucks.find((tr) => tr.place && isAtTruckFront(sim.cur, tr.place));
const foodIcon = (id) => `background-image:url(/sprites/food-hd/${id}.png)`;
let menuTruck = null;
const canOrderHere = () => !menuTruck && !myView()?.orderTruck && !!truckInFront();
function interactTruck(tr, fromClick) {
  if (!isAtTruckFront(sim.cur, tr.place)) { if (fromClick && walkTo(truckFrontPoint(tr.place))) pending = { kind: "truck", truck: tr }; return; }
  if ((myView()?.hands.length ?? 0) >= HANDS_MAX) { say(t("notice.HANDS_FULL")); return; }
  openMenu(tr);
}
function openMenu(tr) {
  closeMenu(); closeHandMenu(); menuTruck = tr; follower.cancel();
  $("menuTitle").textContent = tr.name; $("foods").innerHTML = "";
  for (const id of tr.def.menu) { const m = MENU.get(id); if (!m) continue; const b = document.createElement("button"); b.className = "food"; b.innerHTML = `<span class="ic" style="${foodIcon(id)}"></span><span>${localized(m.name)}</span>`; b.onclick = () => order(tr, m); $("foods").append(b); }
  $("menu").classList.remove("hidden");
}
function closeMenu() { menuTruck = null; $("menu").classList.add("hidden"); }
function order(tr, m) { closeMenu(); send(MSG.order, { truck: tr.id, item: m.id }); }
const orderHere = () => { const tr = truckInFront(); if (tr) interactTruck(tr, false); };
/** 내 주문 상태 (화면 위 가운데). 주문이 없으면 "" */
function orderText() {
  const me = myView(); if (!me?.orderTruck) return "";
  const item = localized(MENU.get(me.orderItem)?.name ?? { ko: me.orderItem });
  if (me.orderQueuePos > 0) return t("order.waiting", { item, pos: me.orderQueuePos });
  const tr = net.room.state.trucks?.get(me.orderTruck);
  if (!tr?.cookingItem) return t("order.ordering", { item });
  return t("order.cooking", { item, sec: Math.max(0, Math.ceil(((tr.readyTick - serverTick()) * TICK_MS) / 1000)) });
}
/** 트럭마다: 만드는 중이면 김, 위에 '만드는 중 · 대기 N명'. 트럭 앞을 벗어나면 메뉴를 닫는다 */
const truckLabels = new Map(trucks.map((tr) => { const el = document.createElement("div"); el.className = "tag truckTag hud"; document.body.append(el); return [tr.id, el]; }));
function updateTrucks(dt) {
  for (const tr of trucks) {
    const s = net.room?.state?.trucks?.get(tr.id), el = truckLabels.get(tr.id);
    if (s?.cookingItem && (tr.puffT = (tr.puffT ?? 0) - dt) <= 0) { tr.puffT = 0.22; puff(tr.steam); }
    const hint = !menuTruck && !myView()?.orderTruck && state.mode === "play" && isAtTruckFront(sim.cur, tr.place) && FINE ? t("truck.hint") : "";
    const text = [s?.cookingItem ? t("truck.cooking") : "", s?.waiting ? t("truck.waiting", { count: s.waiting }) : "", hint].filter(Boolean).join(" · ");
    const [x, y, ok] = project(tr.group.position, 2.75);
    el.style.display = text && ok ? "" : "none"; if (text && ok) { if (el.textContent !== text) el.textContent = text; el.style.left = x + "px"; el.style.top = y + "px"; }
  }
  if (menuTruck && !isAtTruckFront(sim.cur, menuTruck.place)) closeMenu();
}

// ───────── 먹기 (4-4): 하나면 바로, 둘이면 무엇을 먹을지 고른다. 내 캐릭터를 누르면 손에 든 간식 ─────────
let handSig = null;
function eat() {
  const hands = myView()?.hands ?? [];
  if (hands.length === 0 || Array.from(hands).some((h) => h.eating)) return;
  if (hands.length === 1) send(MSG.eat, { hand: 0 }); else openHandMenu();
}
function openHandMenu() {
  if (handSig !== null) return closeHandMenu();
  const hands = Array.from(myView()?.hands ?? []);
  if (!hands.length) { say(t("hands.empty")); return; }
  closeMenu(); handSig = player.handsKey;
  const busy = hands.some((h) => h.eating);
  $("handTitle").textContent = t(busy ? "hands.titleBusy" : "hands.title"); $("handList").innerHTML = "";
  hands.forEach((h, i) => {
    const name = `${t(h.hand === "left" ? "hands.left" : "hands.right")} · ${localized(MENU.get(h.item)?.name ?? { ko: h.item })}`;
    const b = document.createElement("button"); b.className = "food"; b.disabled = busy;
    b.innerHTML = `<span class="ic" style="${foodIcon(h.item)};background-position:${h.stage * 50}% 0"></span><span>${h.eating ? `${name} · ${t("hands.eating")}` : busy ? name : `${i + 1}  ${name}`}</span>`;
    b.onclick = () => { send(MSG.eat, { hand: i }); closeHandMenu(); }; $("handList").append(b);
  });
  $("handMenu").classList.remove("hidden");
}
function closeHandMenu() { handSig = null; $("handMenu").classList.add("hidden"); }

// ───────── 앉기 (5-2·5-3): 벤치를 누르면 누른 쪽 칸 앞까지 걸어가 앉는다. 빈 칸 확인과 자리 옮기기는 서버 ─────────
function toggleSeat() {
  if (sim.seated) return requestStand();
  if (!seatsInRange(sim.cur, SEAT_LIST).length) return;
  follower.cancel(); pending = null; send(MSG.sit);
}
function goSit(def, click) {
  if (seatsInRange(sim.cur, SEAT_LIST).includes(def)) { follower.cancel(); send(MSG.sit, { seat: def.id }); return; }
  if (walkTo(seatStandPoint(def, nearestSlot(def, click), GRID))) pending = { kind: "seat", seat: def };
}

// ───────── 고양이 (5A): 행동은 서버, 화면은 보간해서 인형으로. 가까우면 쓰다듬고, 멀면 걸어간다 ─────────
function animalNear(range) { let best = null, bd = range; for (const [id, a] of animals) { const d = Math.hypot(a.px.x - sim.cur.x, a.px.y - sim.cur.y); if (d <= bd) { bd = d; best = id; } } return best; }
function petNearby() { const id = animalNear(PET_RANGE_PX); if (id) send(MSG.pet, { animal: id }); }
function petAnimal(id) {
  const a = animals.get(id); if (!a) return;
  closeHandMenu(); pending = null;
  if (Math.hypot(a.px.x - sim.cur.x, a.px.y - sim.cur.y) <= PET_RANGE_PX) { follower.cancel(); send(MSG.pet, { animal: id }); return; }
  if (sim.seated) return;
  if (walkTo(a.px)) pending = { kind: "animal", id };
}
function catFx(c, kind) {
  if (kind === "meow") popAt(t("cat.meow"), c.pos, 0.95, "bub");
  else if (kind === "startle") popAt("!", c.pos, 0.9, "ex");
  else if (kind === "curious") popAt("?", c.pos, 0.9, "q");
  else if (kind === "purr") { popAt(t("cat.purr"), c.pos, 0.95, "purr", -0.3); for (let i = 0; i < 3; i++) setTimeout(() => popAt("♥", c.pos, 0.8, "heart", 0.15 + i * 0.12), i * 260); }
}

// ───────── 이모티콘 보내기: 쿨다운은 서버가 받아 준 내 마지막 이모티콘 틱 기준 (서버도 다시 확인) ─────────
function emoteCooldown() { const me = myView(); if (!me?.emoteTick) return 0; return Math.max(0, EMOTE_COOLDOWN_SEC - ((serverTick() - me.emoteTick) * TICK_MS) / 1000); }
function sendEmote(i) { const e = EMOTES[i]; closeEmotes(); if (!e || emoteCooldown() > 0) return; send(MSG.emote, { emote: e[0] }); }
function openEmotes() { $("emotePal").classList.toggle("hidden"); }
function closeEmotes() { $("emotePal").classList.add("hidden"); }
EMOTES.forEach(([, name], i) => { const b = document.createElement("button"); b.innerHTML = `<i style="background-position:${emoteFrame(i)}"></i><span>${name}</span>`; b.onclick = () => sendEmote(i); $("emotePal").append(b); });

// ───────── 렌더링: 원근 카메라 + 툰 음영 + 안개. 카메라는 걷는 쪽을 조금 앞서 보며 부드럽게 따라온다 ─────────
const camera = new THREE.PerspectiveCamera(30, 1, 0.3, 220);
const CAM_DIR = new THREE.Vector3();
const camTarget = state.pos.clone();
const ART = 0.75 / 32; // 폴짝·덜덜 흔들림 단위 (예전 도트 시트 1픽셀)
scene.background = new THREE.Color(0xdde2f2); scene.fog = new THREE.Fog(0xdde2f2, 30, 70);
const camS = { yaw: Math.PI / 4, pitch: 0.62, dist: 13, off: 0 };
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, QUAL.dpr)); renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w < h ? 40 : 30; camera.updateProjectionMatrix(); snow.uPx.value = renderer.getPixelRatio();
}
addEventListener("resize", resize);
sun.shadow.mapSize.set(QUAL.shadow, QUAL.shadow);
const camRight = new THREE.Vector3(), camUp = new THREE.Vector3(), tmp = new THREE.Vector3(), want = new THREE.Vector3(), lastPos = state.pos.clone(), vel = new THREE.Vector3();
let shadowTick = 0;
function updateCamera(dt) {
  if (dt > 0) { tmp.subVectors(state.pos, lastPos).divideScalar(dt).setY(0); if (tmp.lengthSq() > 36) tmp.set(0, 0, 0); vel.lerp(tmp, 1 - Math.exp(-dt * 3)); } lastPos.copy(state.pos);
  const pick = state.mode === "pick", k = 1 - Math.exp(-dt * 6);
  // 고르는 동안은 얼굴 앞 가까이, 들어가면 저장한 시점으로 물러난다
  want.set(state.pos.x, state.pos.y + (pick ? 0.8 : 0.6), state.pos.z); if (!pick) want.addScaledVector(vel, 0.35);
  camTarget.lerp(want, 1 - Math.exp(-dt * (pick ? 6 : 4.5)));
  camS.yaw = turn(camS.yaw, pick ? yawOf("down") : view.yawT, k * 1.2); camS.pitch = ease(camS.pitch, pick ? 0.14 : view.pitchT, k * 1.2);
  camS.dist = ease(camS.dist, pick ? 5.6 : view.distT, k); camS.off = ease(camS.off, pick ? 0.14 : 0, k);
  CAM_DIR.set(Math.sin(camS.yaw) * Math.cos(camS.pitch), Math.sin(camS.pitch), Math.cos(camS.yaw) * Math.cos(camS.pitch));
  VIEW_T.set(Math.sin(camS.yaw), Math.cos(camS.yaw)); VIEW_R.set(Math.cos(camS.yaw), -Math.sin(camS.yaw));
  camera.position.copy(camTarget).addScaledVector(CAM_DIR, camS.dist); camera.lookAt(camTarget);
  // 고르는 화면은 아래 판이 가리지 않게 인형을 화면 위쪽에 둔다
  if (camS.off > 0.002) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * camS.off, innerWidth, innerHeight); else if (camera.view?.enabled) camera.clearViewOffset();
  camera.updateMatrixWorld(); camRight.setFromMatrixColumn(camera.matrixWorld, 0); camUp.setFromMatrixColumn(camera.matrixWorld, 1);
  scene.fog.near = camS.dist * 1.8 + 6; scene.fog.far = camS.dist * 4.5 + 22;
  // 그림자: 보이는 만큼만 좁게 잡고, 그림자 지도 한 칸 단위로 맞춰 걸을 때 떨리지 않게. '보통'은 두 프레임에 한 번 다시 그린다
  const R = Math.min(22, Math.max(9, camS.dist * 1.15)), sc = sun.shadow.camera;
  if (sc.right !== R) { Object.assign(sc, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 34 + R }); sc.updateProjectionMatrix(); }
  const st = 2 * R / QUAL.shadow, sx = Math.round(camTarget.x / st) * st, sz = Math.round(camTarget.z / st) * st, sy = Math.round(camTarget.y);
  sun.position.set(sx - 7, sy + 14, sz + 6); sun.target.position.set(sx, sy, sz); sun.target.updateMatrixWorld();
  if (++shadowTick % QUAL.every === 0) renderer.shadowMap.needsUpdate = true;
}

// ───────── 입력 ─────────
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function setRay(x, y) { ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); }
function groundPoint() { const o = ray.ray.origin, d = ray.ray.direction; if (d.y >= 0) return null; let tt = -o.y / d.y; for (let k = 0; k < 8; k++) tt = (heightAt(o.x + d.x * tt, o.z + d.z * tt) - o.y) / d.y; return new THREE.Vector3(o.x + d.x * tt, 0, o.z + d.z * tt); }
const scr = new THREE.Vector3();
/** 세계 위치 + 높이 → 화면 좌표 [x, y, 보이는지] */
function project(p, h) { scr.set(p.x, p.y + h, p.z).project(camera); return [(scr.x + 1) / 2 * innerWidth, (1 - scr.y) / 2 * innerHeight, scr.z < 1 && Math.abs(scr.x) < 1.1 && Math.abs(scr.y) < 1.1]; }
const nearScreen = (p, h, x, y, r) => { const [sx, sy, ok] = project(p, h); return ok && Math.hypot(x - sx, y - sy) < r; };
/**
 * 화면을 누름: 내 캐릭터 → 손에 든 간식, 고양이 → 쓰다듬기, 다른 사람 → 숨기기 메뉴, 트럭 → 주문, 벤치 → 앉기, 땅 → 걸어가기.
 * 앉아 있으면 먼저 일어나고(서버 응답 뒤) 그다음 할 일을 한다
 */
function tapAt(x, y) {
  if (state.mode !== "play") return;
  closeEmotes(); closePanels(); setRay(x, y);
  if (nearScreen(player.pos, 0.7, x, y, 34)) return openHandMenu();
  closeHandMenu();
  for (const [id, a] of animals) if (nearScreen(a.pos, 0.3, x, y, 36)) return petAnimal(id);
  for (const r of remotes.values()) if (!r.hidden && r.model && nearScreen(r.pos, 0.7, x, y, 30)) return openPlayerMenu(r.nickname, x, y);
  pending = null;
  const hits = ray.intersectObjects([...trucks.map((tr) => tr.group), ...SEATS.map((s) => s.group)], true);
  let seat = null, tr = null, at = null;
  if (hits.length) { let o = hits[0].object; while (o && !o.userData.truck && !o.userData.seat) o = o.parent; seat = o?.userData.seat || null; tr = trucks.find((k) => k.group === o) || null; at = hits[0].point; }
  if (tr) { if (sim.seated) { afterStand = () => interactTruck(tr, true); requestStand(); } else interactTruck(tr, true); return; }
  const g = at || groundPoint(); if (!g) return;
  const click = { x: g.x * 32, y: g.z * 32 }, def = seat ? SEAT_DEFS.get(seat.id) : null;
  const go = () => (def ? goSit(def, click) : walkTo(click) || toast(t("move.blocked"), 1400));
  if (sim.seated) { if (def && def.id === myView()?.seatId) return; afterStand = go; requestStand(); return; }
  go();
}
let steer = null, orbit = null;
const touches = new Map();
const clampPitch = (p) => Math.max(PITCH[0], Math.min(PITCH[1], p));
function rotateView(dYaw, dPitch) { view.yawT += dYaw; view.pitchT = clampPitch(view.pitchT + dPitch); saveView(); }
function zoomBy(f) { view.distT = Math.max(DIST[0], Math.min(DIST[1], view.distT * f)); saveView(); }
const saveView = () => { try { localStorage.setItem("parkSdView", JSON.stringify({ yaw: view.yawT, pitch: view.pitchT, dist: view.distT })); } catch {} };
try { const v = JSON.parse(localStorage.getItem("parkSdView") || "null"); if (v && isFinite(v.yaw) && isFinite(v.pitch)) { view.yawT = v.yaw; view.pitchT = clampPitch(v.pitch); if (isFinite(v.dist)) view.distT = Math.max(DIST[0], Math.min(DIST[1], v.dist)); } } catch {}
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("wheel", (e) => { e.preventDefault(); if (state.mode === "play") zoomBy(Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * 0.0015)))); }, { passive: false });
const pair = () => { const [a, b] = [...touches.values()]; return { ang: Math.atan2(b.y - a.y, b.x - a.x), my: (a.y + b.y) / 2, dist: Math.hypot(b.x - a.x, b.y - a.y) }; };
let swipe = null;
canvas.addEventListener("pointerdown", (e) => {
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  if (state.mode === "pick") { swipe = { id: e.pointerId, x: e.clientX }; return; }
  if (state.mode !== "play") return;
  if (e.pointerType === "touch") { touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (touches.size === 2) { steer = null; orbit = { touch: true, ...pair() }; orbit.d0 = orbit.dist; return; } }
  if (e.button === 1 || e.button === 2) { orbit = { id: e.pointerId, x: e.clientX, y: e.clientY }; return; }
  if (orbit) return;
  steer = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), active: false }; });
canvas.addEventListener("pointermove", (e) => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (orbit?.touch && touches.size === 2) { const q = pair(); let d = q.ang - orbit.ang; d = Math.atan2(Math.sin(d), Math.cos(d)); rotateView(-d, (q.my - orbit.my) * 0.004); Object.assign(orbit, q); zoomBy(orbit.d0 / q.dist); orbit.d0 = q.dist; return; }
  if (orbit && orbit.id === e.pointerId) { rotateView(-(e.clientX - orbit.x) * 0.008, (e.clientY - orbit.y) * 0.004); orbit.x = e.clientX; orbit.y = e.clientY; return; }
  if (!steer || steer.id !== e.pointerId) return; steer.x = e.clientX; steer.y = e.clientY;
  if (!steer.active && Math.hypot(steer.x - steer.sx, steer.y - steer.sy) > 12) startSteer(); });
function startSteer() { steer.active = true; follower.cancel(); pending = null; closeHandMenu(); }
function up(e) {
  if (swipe && swipe.id === e.pointerId) { const dx = e.clientX - swipe.x; swipe = null; if (Math.abs(dx) > 40) choosePreset(state.preset + (dx < 0 ? 1 : -1)); return; }
  touches.delete(e.pointerId); if (orbit && (orbit.id === e.pointerId || (orbit.touch && touches.size < 2))) { orbit = null; return; }
  if (!steer || steer.id !== e.pointerId) return; if (!steer.active) tapAt(steer.x, steer.y); steer = null; }
canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
function updateSteer() { if (steer && !steer.active && performance.now() - steer.t > 250 && !nearScreen(player.pos, 0.7, steer.x, steer.y, 34)) startSteer(); }
addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  const k = e.key.toLowerCase();
  if (state.mode === "pick") { if (k === "arrowleft") choosePreset(state.preset - 1); if (k === "arrowright") choosePreset(state.preset + 1); if (k === "enter") enterPark(); return; }
  if (state.mode !== "play") return;
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault(); // 페이지가 스크롤되지 않게
  keys.add(k);
  if (k === "escape") { closeMenu(); closeHandMenu(); closeMap(); closeHelp(); closePanels(); closeEmotes(); $("dress").classList.add("hidden"); }
  if (k === " ") orderHere(); if (k === "q") eat(); if (k === "m") openMap(); if (k === "e") toggleSeat(); if (k === "f") petNearby();
  if (k === "z") rotateView(-Math.PI / 4, 0); if (k === "x") rotateView(Math.PI / 4, 0); if (k === "=" || k === "+") zoomBy(0.8); if (k === "-") zoomBy(1.25);
  if (k === "f1" && DEV_KEYS) { e.preventDefault(); toggleCollisionView(); }
  // 숫자키 하나에 처리를 하나만: 트럭 메뉴 → 간식 고르기 → 이모티콘
  if (/^[1-9]$/.test(k)) { const i = +k - 1; if (menuTruck) $("foods").children[i]?.click(); else if (handSig !== null) $("handList").children[i]?.click(); else sendEmote(i); } });
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
// 휴대폰은 입력창 키보드·주소창 때문에 페이지가 스크롤된 채 남을 수 있다. 터치 좌표가 어긋나지 않게 되돌린다
for (const target of [window, window.visualViewport].filter(Boolean)) for (const ev of ["resize", "scroll"]) target.addEventListener(ev, () => { if (scrollX || scrollY) scrollTo(0, 0); });

// 클릭 이동 목적지 표시 (주황 고리)
const dest = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 6, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8823a, transparent: true, opacity: 0.9 })); dest.visible = false; scene.add(dest);

// ───────── 지도 (가게 8곳 표시, 누르면 걸어감) + 오른쪽 위 작은 지도 (6-3) ─────────
const LANDMARKS = layer("landmarks").objects.map((o) => ({ name: prop(o, "label") || o.name, x: o.x / 32, z: o.y / 32 }));
const mapCv = $("mapCanvas"), MS = 4;
mapCv.width = MW * MS; mapCv.height = MH * MS;
const mapBase = document.createElement("canvas"); mapBase.width = MW * MS; mapBase.height = MH * MS;
{
  const g = mapBase.getContext("2d"), col = { [G.snow]: "#f2f5fb", [G.snow2]: "#eaeff8", [G.path]: "#d9cfc6", [G.plaza]: "#e6d9cc", [G.ice]: "#a9d3ee", [G.outside]: "#8f9bbd", [G.bridge]: "#b69b72", [G.stage]: "#c9c2b6" };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const o = OBST[y * MW + x]; let c = window.ParkGround.byId.get(MAP.editor3d?.groundStyles?.[y * MW + x])?.color || col[groundAt(x, y)] || col[G.snow];
    if (o === G.tree) c = "#4f9b7c"; else if (o === G.garden) c = "#79b596"; else if (o === G.rock) c = "#a9a6b8"; else if (o === G.fence) c = "#b89070"; else if (o >= G.benchDown && o <= G.benchLeft) c = "#c8946a"; else if (o === G.wall && inside[y * MW + x]) c = "#f2786a";
    g.fillStyle = c; g.fillRect(x * MS, y * MS, MS, MS);
    // 높낮이 음영: 해가 비치는 서쪽·남쪽 비탈은 밝게, 반대쪽은 어둡게, 높은 곳은 조금 더 밝게
    const v = (heightAt(x + 1, y + 0.5) - heightAt(x, y + 0.5) + heightAt(x + 0.5, y) - heightAt(x + 0.5, y + 1)) * 1.4 + (heightAt(x + 0.5, y + 0.5) - 0.3) * 0.05;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${Math.min(0.4, v)})` : `rgba(40,30,80,${Math.min(0.3, -v)})`; g.fillRect(x * MS, y * MS, MS, MS);
  }
}
function drawMap() {
  const g = mapCv.getContext("2d"); g.drawImage(mapBase, 0, 0);
  g.textAlign = "center"; g.textBaseline = "middle";
  g.font = '15px Jua, sans-serif'; g.fillStyle = "rgba(58,53,80,.55)";
  for (const l of LANDMARKS) g.fillText(l.name, l.x * MS, l.z * MS);
  for (const tr of trucks) {
    const x = tr.front.x * MS, y = (tr.front.z - 1.6) * MS;
    g.font = '17px Jua, sans-serif'; const tw = g.measureText(tr.name).width + 14;
    g.fillStyle = "#" + tr.color.toString(16).padStart(6, "0"); g.strokeStyle = "#3a3550"; g.lineWidth = 2;
    g.beginPath(); g.roundRect ? g.roundRect(x - tw / 2, y - 30, tw, 24, 8) : g.rect(x - tw / 2, y - 30, tw, 24); g.fill(); g.stroke();
    g.fillStyle = "#3a3550"; g.fillText(tr.name, x, y - 17);
    g.beginPath(); g.moveTo(x - 5, y - 6); g.lineTo(x + 5, y - 6); g.lineTo(x, y); g.fill();
  }
  g.fillStyle = "#5568b0"; g.strokeStyle = "#fff"; g.lineWidth = 2; for (const r of remotes.values()) { if (r.hidden) continue; g.beginPath(); g.arc(r.pos.x * MS, r.pos.z * MS, 5, 0, 7); g.fill(); g.stroke(); }
  g.fillStyle = "#e2584f"; g.strokeStyle = "#fff"; g.lineWidth = 3; g.beginPath(); g.arc(state.pos.x * MS, state.pos.z * MS, 7, 0, 7); g.fill(); g.stroke();
  g.fillStyle = "#3a3550"; g.font = '14px Jua, sans-serif'; g.fillText("나", state.pos.x * MS, state.pos.z * MS - 16);
}
function openMap() { drawMap(); $("mapModal").classList.remove("hidden"); }
function closeMap() { $("mapModal").classList.add("hidden"); }
mapCv.addEventListener("click", (e) => {
  const r = mapCv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * MW, z = (e.clientY - r.top) / r.height * MH;
  let best = null, bd = 6; for (const tr of trucks) { const d = Math.hypot(x - tr.front.x, z - (tr.front.z - 1.2)); if (d < bd) { bd = d; best = tr; } }
  closeMap(); if (state.mode !== "play") return;
  const go = () => { if (best) { toast(`${best.name}(으)로 가는 중`, 1600); interactTruck(best, true); } else if (walkTo({ x: x * 32, y: z * 32 })) toast("걸어가는 중", 1200); else toast(t("move.blocked"), 1400); };
  pending = null; if (sim.seated) { afterStand = go; requestStand(); } else go();
});
$("mapModal").addEventListener("click", (e) => { if (e.target.id === "mapModal") closeMap(); });
// 작은 지도: 공원 전체 + 나(깜빡이는 빨간 점) + 간식 트럭. 누르면 큰 지도
const mini = $("miniCanvas"), miniG = mini.getContext("2d");
function drawMini(now) {
  if ($("side").classList.contains("collapsed")) return;
  const h = Math.round(Math.max(100, Math.min(176, Math.min(innerWidth, innerHeight) * 0.3))), w = Math.round(h * MW / MH);
  if (mini.width !== w * 2) { mini.width = w * 2; mini.height = h * 2; mini.style.width = w + "px"; mini.style.height = h + "px"; }
  const sx = mini.width / MW, sz = mini.height / MH; miniG.drawImage(mapBase, 0, 0, mini.width, mini.height);
  for (const tr of trucks) { const b = tr.place.box, x = b.left / 32 * sx, y = b.top / 32 * sz, bw = Math.max(8, (b.right - b.left) / 32 * sx), bh = Math.max(6, (b.bottom - b.top) / 32 * sz); miniG.fillStyle = "#5a3200"; miniG.fillRect(x - 1, y - 1, bw + 2, bh + 2); miniG.fillStyle = "#ffb020"; miniG.fillRect(x, y, bw, bh); }
  const px = state.pos.x * sx, pz = state.pos.z * sz, pulse = 0.5 + 0.5 * Math.sin(now * 5);
  miniG.strokeStyle = `rgba(255,255,255,${0.4 + 0.6 * pulse})`; miniG.lineWidth = 3; miniG.beginPath(); miniG.arc(px, pz, 8 + pulse * 2, 0, 7); miniG.stroke();
  miniG.fillStyle = "#e84545"; miniG.beginPath(); miniG.arc(px, pz, 5, 0, 7); miniG.fill();
}
$("mini").onclick = openMap;

// ───────── UI ─────────
const FINE = matchMedia("(pointer: fine)").matches; // 키보드·마우스가 있는 기기
let toastTimer;
function toast(text, ms, bar) { const el = $("toast"); el.textContent = text; if (bar) el.insertAdjacentHTML("beforeend", '<div class="barp"><i></i></div>'); el.classList.remove("off"); clearTimeout(toastTimer); if (ms) toastTimer = setTimeout(() => el.classList.add("off"), ms); }
const toScreen = (p, h) => { const [x, y] = project(p, h); return [x, y]; };
function popAt(text, pos, h, cls, dx = 0) { const [x, y] = toScreen(pos, h); const el = document.createElement("div"); el.className = "pop " + cls; el.textContent = text; el.style.left = x + dx * 40 + "px"; el.style.top = y + "px"; document.body.append(el); setTimeout(() => el.remove(), 1600); }
function popText(text, pos, h, dx = 0) { const [x, y] = toScreen(pos, h); const el = document.createElement("div"); el.className = "pop"; el.textContent = text; el.style.left = x + dx * 40 + "px"; el.style.top = y + "px"; document.body.append(el); setTimeout(() => el.remove(), 1300); }
const ui = {};
function setText(id, text) { const el = $(id); if (ui[id] !== text) { ui[id] = text; el.textContent = text; } return el; }
function updateUI() {
  const me = myView(), hands = me ? Array.from(me.hands) : [];
  const tr = truckInFront(), shop = state.mode === "play" && canOrderHere() ? tr : null;
  if (shop !== ui.shop) { ui.shop = shop; $("btnShop").classList.toggle("hidden", !shop); if (shop) $("btnShop").lastChild.textContent = shop.name.replace(" 트럭", "") + " " + t("action.order"); }
  const h = hands.length && !hands.some((q) => q.eating) ? hands[0] : null, key = h ? h.item : "";
  if (key !== ui.eat) { ui.eat = key; $("btnEat").classList.toggle("hidden", !h); if (h) { $("btnEat").children[0].setAttribute("style", foodIcon(h.item)); $("btnEat").children[1].textContent = t("action.eat"); } }
  let near = null, nd = 9; for (const l of LANDMARKS) { const d = Math.hypot(state.pos.x - l.x, state.pos.z - l.z); if (d < nd) { nd = d; near = l; } }
  const where = tr ? tr.name : near ? near.name : ""; setText("where", where).classList.toggle("hidden", !where);
  const sitS = sim.seated ? "stand" : seatsInRange(sim.cur, SEAT_LIST).length ? "sit" : ""; if (sitS !== ui.sit) { ui.sit = sitS; $("btnSit").classList.toggle("hidden", !sitS); if (sitS) $("btnSit").lastChild.textContent = t(`action.${sitS}`); }
  const pet = !!animalNear(PET_RANGE_PX); if (pet !== ui.pet) { ui.pet = pet; $("btnPet").classList.toggle("hidden", !pet); }
  // 주문 상태 + 취소
  const ot = online() ? orderText() : ""; setText("orderText", ot); $("order").classList.toggle("hidden", !ot);
  // 이모티콘 쿨다운 중이면 흐리게
  const ready = emoteCooldown() <= 0; if (ready !== ui.ready) { ui.ready = ready; $("btnEmote").style.opacity = ready ? 1 : 0.5; document.querySelectorAll("#emotePal button").forEach((b) => (b.disabled = !ready)); }
  // 손에 든 간식이 바뀌었거나(받음·다 먹음·먹기 시작) 트럭 메뉴가 열리면 간식 고르기를 닫는다
  if (handSig !== null && (menuTruck || handSig !== player.handsKey)) closeHandMenu();
  updateStatus();
  // 이름표·말풍선
  const showNames = getSettings().showNicknames;
  placeTag(player, showNames);
  for (const r of remotes.values()) placeTag(r, showNames && !r.hidden, r.hidden);
}
function placeTag(c, showName, hideAll = false) {
  if (!c.model) return;
  const [x, y, ok] = project(c.pos, c.model.top + 0.14 + (c.seat ? 0.1 : 0)), far = c !== player && c.pos.distanceTo(camTarget) > 32;
  c.tag.style.display = showName && ok && !far ? "" : "none"; c.bubble.style.display = !hideAll && ok && !far ? "" : "none";
  if (ok) { c.tag.style.left = c.bubble.style.left = x + "px"; c.tag.style.top = y + "px"; c.bubble.style.top = (showName ? y - 22 : y) + "px"; }
}
$("btnShop").onclick = orderHere; $("btnEat").onclick = eat; $("btnSit").onclick = toggleSeat; $("btnPet").onclick = petNearby; $("btnEmote").onclick = openEmotes; $("menuClose").onclick = closeMenu;
$("handClose").onclick = closeHandMenu; $("handMenu").addEventListener("click", (e) => { if (e.target.id === "handMenu") closeHandMenu(); });
$("orderCancel").onclick = () => send(MSG.cancelOrder);
$("menu").addEventListener("click", (e) => { if (e.target.id === "menu") closeMenu(); });
$("rotL").onclick = () => rotateView(-Math.PI / 4, 0); $("rotR").onclick = () => rotateView(Math.PI / 4, 0); $("zoomIn").onclick = () => zoomBy(0.8); $("zoomOut").onclick = () => zoomBy(1.25); $("mapClose").onclick = closeMap;

// 접속 상태 (왼쪽 위): 채널 번호·인원, 끊겼으면 이유. 누르면 채널 목록 (6-4)
async function refreshHealth() { net.health = await checkHealth(); }
setInterval(() => void refreshHealth(), 3000); void refreshHealth();
function updateStatus() {
  let text = "", cls = "";
  if (!net.room) text = "";
  else if (online()) { text = t("status.channel", { channel: net.room.state?.channel || "…", players: remotes.size + 1 }); cls = "ok"; }
  else if (net.leaveReason === "duplicateLogin") { text = t("status.duplicateLogin"); cls = "bad"; }
  else if (net.leaveReason === "kicked") { text = t("status.kicked"); cls = "bad"; }
  else { text = t(net.health === "disconnected" ? "status.serverDown" : "status.disconnected"); cls = "bad"; }
  const el = setText("status", text); el.classList.toggle("hidden", !text); el.dataset.state = cls;
}
let channelTimer = 0, channelBusy = false;
function toggleChannels() { if ($("channels").classList.contains("hidden")) { closePanels(); $("channels").classList.remove("hidden"); void refreshChannels(); channelTimer = setInterval(() => void refreshChannels(), 3000); } else closePanels(); }
async function refreshChannels() {
  let list;
  try { list = await fetchChannels(); } catch { $("channels").innerHTML = `<small>${t("channels.error")}</small>`; return; }
  if ($("channels").classList.contains("hidden")) return;
  const here = net.room?.roomId, total = list.reduce((s, c) => s + c.players, 0);
  const box = $("channels"); box.innerHTML = `<small>${channelBusy ? t("channels.moving") : t("channels.title", { total })}</small>`;
  for (const c of list) {
    const isHere = c.id === here, full = c.players >= c.max, b = document.createElement("button");
    b.textContent = t(isHere ? "channels.rowHere" : full ? "channels.rowFull" : "channels.row", { channel: c.channel, players: c.players, max: c.max });
    b.className = isHere ? "here" : full ? "full" : ""; b.disabled = isHere || full || channelBusy || !net.token;
    b.onclick = () => void switchChannel(c.id); box.append(b);
  }
}
/**
 * 채널 목록에서 고른 채널로 옮긴다. 새 채널에 먼저 들어간 뒤 지금 채널을 떠난다.
 * 들어가지 못하면(꽉 참·없어진 채널·토큰 만료) 지금 채널에 그대로 있고 안내만. 손에 든 간식·주문은 이전 채널에 남는다(없어짐)
 */
async function switchChannel(roomId) {
  if (channelBusy || roomId === net.room?.roomId) return;
  channelBusy = true; void refreshChannels();
  let room;
  try { room = await joinChannel(net.token, roomId, lookKey(state.look)); }
  catch (err) { console.warn("[net] 채널 옮기기 실패", err); toast(t("channels.failed"), 3000); channelBusy = false; void refreshChannels(); return; }
  const old = net.room; clearWorld(); closeMenu(); closeHandMenu(); follower.cancel(); pending = afterStand = null; tickAcc = 0;
  attachRoom(room); void old?.leave(); channelBusy = false; closePanels();
}
$("status").onclick = toggleChannels;

// 설정 (6-5): 닉네임 표시·소리 크기·숨긴 사람 다시 보기 (6-6). 바꾸면 바로 적용되고 브라우저에 저장된다
function buildSettings() {
  const s = getSettings(), box = $("settings");
  box.innerHTML = `<header>${t("settings.title")}</header>
    <div class="srow"><span>${t("settings.nicknames")}</span><button data-act="names" class="${s.showNicknames ? "on" : ""}">${t(s.showNicknames ? "settings.on" : "settings.off")}</button></div>
    <div class="srow"><span>${t("settings.volume")}</span><span class="vol"><button data-act="vol-">−</button><b>${Math.round(s.volume * 100)}%</b><button data-act="vol+">+</button></span></div>
    <small>${t("settings.hidden", { count: s.hidden.length })}</small>`;
  if (!s.hidden.length) box.insertAdjacentHTML("beforeend", `<small class="none">${t("settings.hiddenNone")}</small>`);
  for (const n of s.hidden) { const row = document.createElement("div"); row.className = "srow"; row.innerHTML = `<span></span><button>${t("settings.unhide")}</button>`; row.firstChild.textContent = n; row.lastChild.onclick = () => { unhidePlayer(n); buildSettings(); }; box.append(row); }
  box.querySelector('[data-act="names"]').onclick = () => { updateSettings({ showNicknames: !s.showNicknames }); buildSettings(); };
  const vol = (d) => { updateSettings({ volume: Math.round(Math.max(0, Math.min(1, s.volume + d)) * 10) / 10 }); applySound(); buildSettings(); };
  box.querySelector('[data-act="vol-"]').onclick = () => vol(-0.1); box.querySelector('[data-act="vol+"]').onclick = () => vol(0.1);
}
$("settingsBtn").onclick = () => { const open = $("settings").classList.contains("hidden"); closePanels(); if (open) { buildSettings(); $("settings").classList.remove("hidden"); } };
// 다른 사람을 누르면 닉네임 + 숨기기 (내 화면에서만 사라짐. 설정에서 다시 볼 수 있다)
let menuNick = "";
function openPlayerMenu(nickname, x, y) {
  closePanels(); menuNick = nickname; $("pmName").textContent = nickname;
  const el = $("playerMenu"); el.classList.remove("hidden");
  el.style.left = Math.max(8, Math.min(innerWidth - el.offsetWidth - 8, x + 8)) + "px"; el.style.top = Math.max(8, Math.min(innerHeight - el.offsetHeight - 8, y - el.offsetHeight / 2)) + "px";
}
$("pmHide").onclick = () => { if (!menuNick) return; hidePlayer(menuNick); toast(t("player.hidden", { nickname: menuNick }), 3000); closePanels(); };
function closePanels() { for (const id of ["channels", "settings", "playerMenu"]) $(id).classList.add("hidden"); clearInterval(channelTimer); }
$("helpLine").textContent = "WASD·클릭 이동 · Space 주문 · Q 먹기 (내 캐릭터 클릭: 고르기) · E·자리 클릭 앉기/일어나기 · 1–8 이모티콘 · F 고양이 쓰다듬기 · M 지도 · Z/X 돌리기";
$("helpLine").classList.toggle("hidden", !FINE);

// 꾸미기: 고를 때마다 바로 입어 보고, 미리보기는 네 방향으로 돈다
const DRESS_ROWS = [["hair", "머리"], ["hairColor", "머리색"], ["outfit", "옷"], ["outfitColor", "옷 색"], ["hat", "모자"], ["hatColor", "모자 색"], ["scarf", "목도리"], ["scarfStyle", "두르기"], ["scarfPattern", "무늬"]];
function setLook(l) { state.look = l; if (l.hair !== "long") l.outfit = "coat"; save(); dressPlayer(); player.hop = 0.45; buildDress(); send(MSG.look, { look: lookKey(state.look) }); }
function buildDress() {
  const box = $("dressRows"); box.textContent = "";
  for (const [k, label] of DRESS_ROWS) {
    if (k === "hatColor" && state.look.hat === "none") continue;
    if ((k === "scarfStyle" || k === "scarfPattern") && state.look.scarf === "none") continue;
    const row = document.createElement("div"); row.className = "drow"; row.innerHTML = `<span>${label}</span><div class="chips"></div>`;
    for (const v of OPTIONS[k]) {
      const [id, name] = Array.isArray(v) ? v : [v, null], b = document.createElement("button");
      if (name) { b.className = "chip"; b.textContent = name; } else { b.className = "sw" + (id === "none" ? " none" : ""); b.style.background = id === "none" ? "" : SWATCH(id); b.setAttribute("aria-label", id); }
      const off = k === "outfit" && id === "dress" && state.look.hair !== "long";
      b.disabled = off; b.classList.toggle("on", state.look[k] === id);
      b.onclick = () => setLook({ ...state.look, [k]: id }); row.lastChild.append(b);
    }
    box.append(row);
  }
}
let dressSpin = 0, prevModel = null, prevKey = "";
const prevScene = new THREE.Scene(), prevSun = new THREE.DirectionalLight(0xfff0dc, 0.75); prevSun.position.set(-3, 6, 6); prevScene.add(new THREE.HemisphereLight(0xe8ecff, 0x9a8fc0, 0.62), prevSun);
const prevCam = new THREE.PerspectiveCamera(26, 1, 0.5, 20); prevCam.position.set(0, 0.85 + Math.sin(0.25) * 4.2, Math.cos(0.25) * 4.2); prevCam.lookAt(0, 0.8, 0);
const prevOut = new THREE.WebGLRenderTarget(128, 128), prevBuf = new Uint8Array(128 * 128 * 4), prevImg = new ImageData(128, 128);
function drawDressPreview(dt) {
  if ($("dress").classList.contains("hidden")) return; dressSpin += dt;
  const key = lookKey(state.look); if (key !== prevKey) { prevKey = key; if (prevModel) prevScene.remove(prevModel.root); prevModel = buildPerson(state.look); prevScene.add(prevModel.root); }
  prevModel.root.rotation.y = Math.sin(dressSpin * 0.9) * 1.1; prevModel.body.scale.y = 1 + Math.sin(dressSpin * 2.6) * 0.012;
  renderer.setRenderTarget(prevOut); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(prevScene, prevCam);
  renderer.readRenderTargetPixels(prevOut, 0, 0, 128, 128, prevBuf); renderer.setRenderTarget(null);
  for (let y = 0; y < 128; y++) prevImg.data.set(prevBuf.subarray((127 - y) * 512, (128 - y) * 512), y * 512);
  $("dressPrev").getContext("2d").putImageData(prevImg, 0, 0);
}
document.body.style.setProperty("--emotes", `url(${SPR.emotes})`); document.body.style.setProperty("--emote-btn", `url(${SPR["emote-button"]})`);
$("top").innerHTML = `<button id="dressBtn" aria-label="꾸미기">👕<span class="lbl"> 꾸미기</span></button><button id="diceBtn" aria-label="랜덤">🎲</button><button id="pickBtn" aria-label="친구 바꾸기">🧸<span class="lbl"> 친구</span></button><button id="helpBtn" aria-label="조작 안내">?</button>`;
const openHelp = () => $("help").classList.remove("hidden"), closeHelp = () => { $("help").classList.add("hidden"); try { localStorage.setItem("parkSdHelp", "1"); } catch {} };
$("helpBtn").onclick = openHelp; $("helpClose").onclick = closeHelp; $("helpGo").onclick = closeHelp;
$("dressBtn").onclick = () => { buildDress(); $("dress").classList.remove("hidden"); };
$("diceBtn").onclick = () => setLook(randomLook());
$("dressRand").onclick = () => setLook(randomLook());
$("dressClose").onclick = () => $("dress").classList.add("hidden");
$("dress").addEventListener("click", (e) => { if (e.target.id === "dress") $("dress").classList.add("hidden"); });
$("pickBtn").onclick = () => openPick("change");
// Meshy 인형은 남/녀 두 벌뿐: 꾸미기 · 랜덤 · 친구 바꾸기를 숨기고, 처음 화면의 친구 고르기는 남/녀 단추로 바꾼다
if (DOLL) {
  for (const id of ["dressBtn", "diceBtn", "pickBtn", "pickDots"]) $(id).style.display = "none";
  $("pickPrev").parentElement.style.display = "none"; $("genderTabs").hidden = false;
  $("pick").querySelector(".ptitle").textContent = "누구로 놀러 갈까요?";
}

// ───────── 입장 (3-6): 친구(꾸미기 묶음) 고르기 + 로그인(닉네임·PIN) / 처음이에요(가입) → 받은 토큰으로 채널 접속 ─────────
// 들어온 뒤 '친구' 단추로 다시 열면 모습만 바꾼다 (닉네임은 계정이라 그대로)
const profile = loadProfile();
const lobby = { mode: profile.nickname ? "login" : "signup", busy: false, checkTimer: 0, checkAbort: null, signedUp: false };
// Meshy 인형: 여자 · 남자 · 곱슬머리 · 헤어롤 · 펭귄 · 알파카 여섯 가지 (머리 모양으로 인형이 정해진다. 지난번에 고른 쪽을 기억한다)
const DOLL_PICKS = [
  { name: "여자", note: "", look: { ...DEFAULT_LOOK, hair: "long" } },
  { name: "남자", note: "", look: { ...DEFAULT_LOOK, hair: "short", outfit: "coat" } },
  { name: "곱슬머리", note: "", look: { ...DEFAULT_LOOK, hair: "curly", outfit: "coat" } },
  { name: "헤어롤", note: "", look: { ...DEFAULT_LOOK, hair: "roller", outfit: "coat" } },
  { name: "펭귄", note: "", look: { ...DEFAULT_LOOK, hair: "penguin", outfit: "coat" } },
  { name: "알파카", note: "", look: { ...DEFAULT_LOOK, hair: "alpaca", outfit: "coat" } },
];
const custom = !DOLL && PRESETS.every((p) => lookKey(p.look) !== lookKey(state.look)) ? { name: "내 꾸미기", note: "지난번에 꾸민 모습", look: { ...state.look } } : null;
const pickList = DOLL ? DOLL_PICKS : custom ? [custom, ...PRESETS] : PRESETS;
state.preset = DOLL ? Math.max(0, DOLL_PICKS.findIndex((p) => dollKind(p.look) === dollKind(state.look))) : custom ? 0 : Math.max(0, PRESETS.findIndex((p) => lookKey(p.look) === lookKey(state.look)));
$("pickDots").innerHTML = pickList.map(() => "<i></i>").join("");
function choosePreset(i) {
  state.preset = (i + pickList.length) % pickList.length; const p = pickList[state.preset];
  $("pickName").textContent = p.name; $("pickNote").textContent = p.note; [...$("pickDots").children].forEach((d, k) => d.classList.toggle("on", k === state.preset));
  for (const b of $("genderTabs").children) b.setAttribute("aria-checked", String(Number(b.dataset.i) === state.preset));
  if (lookKey(p.look) !== lookKey(state.look)) { state.look = { ...p.look }; dressPlayer(); player.hop = 0.45; }
}
function setLobbyMode(mode) {
  if (lobby.busy) return; lobby.mode = mode; lobbyError("");
  for (const b of document.querySelectorAll("#lobbyTabs button")) b.setAttribute("aria-selected", String(b.dataset.mode === mode));
  $("nickDice").hidden = mode !== "signup"; $("pin2Row").hidden = mode !== "signup"; $("pin2").value = "";
  $("pinHint").textContent = mode === "signup" ? t("lobby.pinHintSignup") : ""; $("pin").autocomplete = mode === "signup" ? "new-password" : "current-password";
  setEnterLabel(); scheduleNickCheck(0);
}
const setEnterLabel = () => { $("enter").disabled = lobby.busy; $("enter").textContent = state.mode === "pick" && lobby.changing ? "이 친구로 할게요" : lobby.busy ? t("lobby.entering") : t(lobby.mode === "signup" ? "lobby.signupEnter" : "lobby.enter"); };
function nickHint(text, bad = false) { $("nickMsg").textContent = text; $("nickMsg").classList.toggle("bad", bad); }
function lobbyError(text) { $("lobbyMsg").textContent = text; }
/** 입력이 멈추면 형식을 확인하고 서버에 있는 닉네임인지 물어본다. 가입: 이미 있으면 안내. 로그인: 없으면 안내 */
function scheduleNickCheck(delay = 400) {
  clearTimeout(lobby.checkTimer); lobby.checkAbort?.abort(); nickHint("");
  const name = normalizeNickname($("nick").value); $("tag").textContent = name || "나"; if (!name) return;
  const mode = lobby.mode;
  lobby.checkTimer = setTimeout(async () => {
    const fe = checkNicknameFormat(name); if (fe) return nickHint(t(`error.${fe}`), true);
    lobby.checkAbort = new AbortController();
    try {
      const { exists } = await checkNickname(name, lobby.checkAbort.signal);
      if (mode === "signup") nickHint(exists ? t("error.NICKNAME_TAKEN") : t("lobby.nicknameAvailable"), exists);
      else if (!exists) nickHint(t("error.NICKNAME_NOT_FOUND"), true);
    } catch (err) { if (err?.code === "NICKNAME_BANNED") nickHint(t("error.NICKNAME_BANNED"), true); }
  }, delay);
}
function errorMessage(err) {
  if (err?.message === JOIN_ERROR_BANNED) return t("error.BANNED");
  if (!(err instanceof ApiFailure)) { console.warn("[lobby] 채널 접속 실패", err); return t("error.JOIN_FAILED"); }
  if (err.code === "LOCKED") return t("error.LOCKED", { minutes: Math.max(1, Math.ceil((err.detail.retryAfterSec ?? 600) / 60)) });
  return translate(`error.${err.code}`, { remaining: err.detail.remaining ?? 0 }) ?? t("error.SERVER_ERROR");
}
function openPick(kind) {
  lobby.changing = kind === "change";
  state.mode = "pick"; document.body.classList.add("picking"); $("pick").classList.remove("hidden"); $("lobby").hidden = lobby.changing;
  follower.cancel(); pending = null; keys.clear(); closeMenu(); closeHandMenu(); closePanels(); closeEmotes();
  if (!lobby.changing && ACCOUNT_FORM) { $("nick").value = profile.nickname || ""; setLobbyMode(lobby.mode); }
  choosePreset(state.preset); setEnterLabel();
}
async function enterPark() {
  if (lobby.changing) {
    // 모습만 바꾸기: 저장하고 서버에 알린다
    save(); send(MSG.look, { look: lookKey(state.look) }); return startPlay();
  }
  if (lobby.busy) return;
  if (!ACCOUNT_FORM) return enterAsGuest();
  const nickname = normalizeNickname($("nick").value), pin = $("pin").value, fe = checkNicknameFormat(nickname);
  if (fe) { lobbyError(t(`error.${fe}`)); return $("nick").focus(); }
  if (!PIN_PATTERN.test(pin)) { lobbyError(t("error.PIN_FORMAT")); return $("pin").focus(); }
  if (lobby.mode === "signup" && $("pin2").value !== pin) { lobbyError(t("error.PIN_MISMATCH")); return $("pin2").focus(); }
  lobbyError(""); lobby.busy = true; setEnterLabel(); save();
  try {
    // 계정의 2D 외형(성별·얼굴·옷)은 그대로 둔다. 가입할 때는 저장된 값(없으면 기본값)으로 만든다
    const appearance = { gender: profile.gender, face: profile.face, outfit: profile.outfit };
    const res = lobby.mode === "signup" ? await signup({ nickname, pin, ...appearance }) : await login({ nickname, pin });
    lobby.signedUp = res.created;
    Object.assign(profile, { nickname: res.user.nickname, gender: res.user.gender, face: res.user.face, outfit: res.user.outfit }); saveProfile(profile);
    const room = await joinPark(res.token, lookKey(state.look));
    Object.assign(net, { user: res.user, token: res.token }); state.nick = res.user.nickname; $("tag").textContent = state.nick;
    attachRoom(room);
  } catch (err) {
    // 계정은 만들어졌는데 채널 접속만 실패: 다시 시도는 로그인으로 (가입을 또 누르면 '이미 있는 닉네임')
    lobby.busy = false; if (lobby.signedUp) setLobbyMode("login");
    lobbyError(errorMessage(err)); setEnterLabel(); $("pin").select(); return;
  }
  lobby.busy = false; $("pin").value = $("pin2").value = ""; $("nick").blur(); startPlay();
  let seen = false; try { seen = !!localStorage.getItem("parkSdHelp"); } catch {}
  if (!seen) openHelp(); else toast(`${state.nick}, 어서 와요! 바닥을 누르면 걸어요`, 3000);
}
// 손님 입장 (ACCOUNT_FORM 이 꺼져 있을 때): 처음엔 무작위 닉네임 + PIN 으로 가입해 이 기기에 기억해 두고, 다음부터는 그걸로 로그인한다.
// 기억한 계정이 서버에 없거나 PIN 이 맞지 않으면(서버 자료를 지운 경우) 새로 만든다
const GUEST_KEY = "parkGuest";
async function guestLogin() {
  let g = null; try { g = JSON.parse(localStorage.getItem(GUEST_KEY) || "null"); } catch {}
  if (g && typeof g.nickname === "string" && PIN_PATTERN.test(String(g.pin))) {
    try { return await login({ nickname: g.nickname, pin: g.pin }); }
    catch (err) { if (!(err instanceof ApiFailure) || (err.code !== "NICKNAME_NOT_FOUND" && err.code !== "WRONG_PIN")) throw err; }
  }
  const appearance = { gender: profile.gender, face: profile.face, outfit: profile.outfit };
  for (let tries = 0; ; tries++) {
    const nickname = await fetchRandomNickname(), pin = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    try {
      const res = await signup({ nickname, pin, ...appearance });
      try { localStorage.setItem(GUEST_KEY, JSON.stringify({ nickname: res.user.nickname, pin })); } catch {}
      return res;
    } catch (err) { if (tries >= 4 || !(err instanceof ApiFailure) || err.code !== "NICKNAME_TAKEN") throw err; }
  }
}
async function enterAsGuest() {
  lobbyError(""); lobby.busy = true; setEnterLabel(); save();
  try {
    const res = await guestLogin();
    Object.assign(profile, { nickname: res.user.nickname, gender: res.user.gender, face: res.user.face, outfit: res.user.outfit }); saveProfile(profile);
    const room = await joinPark(res.token, lookKey(state.look));
    Object.assign(net, { user: res.user, token: res.token }); state.nick = res.user.nickname; $("tag").textContent = state.nick;
    attachRoom(room);
  } catch (err) { lobby.busy = false; lobbyError(errorMessage(err)); setEnterLabel(); return; }
  lobby.busy = false; startPlay();
  let seen = false; try { seen = !!localStorage.getItem("parkSdHelp"); } catch {}
  if (!seen) openHelp(); else toast(`${state.nick}, 어서 와요! 바닥을 누르면 걸어요`, 3000);
}
function startPlay() { state.mode = "play"; document.body.classList.remove("picking"); $("pick").classList.add("hidden"); player.hop = 0.45; sound.start(); }
$("muteBtn").onclick = () => { updateSettings({ muted: !getSettings().muted }); applySound(); };
applySound(); void refreshToday(); setInterval(() => void refreshToday(), 60_000);
for (const b of document.querySelectorAll("#lobbyTabs button")) b.onclick = () => setLobbyMode(b.dataset.mode);
$("pickPrev").onclick = () => choosePreset(state.preset - 1); $("pickNext").onclick = () => choosePreset(state.preset + 1);
for (const b of $("genderTabs").children) b.onclick = () => choosePreset(Number(b.dataset.i));
$("nick").maxLength = NICKNAME_MAX_LENGTH + 4;
// 닉네임·PIN 입력을 끄면 안내 문구(오류)만 남긴다
if (!ACCOUNT_FORM) {
  lobby.mode = "login";
  for (const el of $("lobby").children) if (el.id !== "lobbyMsg") el.style.display = "none";
  $("privacy").textContent = "이 기기에 손님 이름을 하나 만들어 기억해요";
}
$("nickDice").onclick = async () => { try { $("nick").value = await fetchRandomNickname(); scheduleNickCheck(0); $("pin").focus(); } catch { lobbyError(t("error.NETWORK")); } };
$("nick").addEventListener("input", () => scheduleNickCheck());
for (const id of ["pin", "pin2"]) $(id).addEventListener("input", () => ($(id).value = $(id).value.replace(/\D/g, "").slice(0, 4)));
$("lobbyForm").addEventListener("submit", (e) => { e.preventDefault(); void enterPark(); });

// ───────── 개발용: ?debug=1 오버레이(FPS·좌표·네트워크) + 서버 위치 고스트, F1 막힌 칸·자리·경로 표시 ─────────
if (DEBUG) { ghost = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0x80c0ff, transparent: true, opacity: 0.6 })); scene.add(ghost); $("debug").classList.remove("hidden"); }
let collisionView = null, fps = 0;
function toggleCollisionView() {
  if (collisionView) { scene.remove(collisionView.group); collisionView = null; return; }
  const group = new THREE.Group(), tiles = [];
  for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) if (GRID.blocked[r * GRID.cols + c]) tiles.push([c, r]);
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.35, depthWrite: false }), tiles.length), m4 = new THREE.Matrix4();
  tiles.forEach(([c, r], i) => im.setMatrixAt(i, m4.makeTranslation(c + 0.5, heightAt(c + 0.5, r + 0.5) + 0.06, r + 0.5))); im.frustumCulled = false; group.add(im);
  const line = (pts, color) => group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color })));
  const rect = (l, tp, r, b, color) => line([[l, tp], [r, tp], [r, b], [l, b]].map(([x, z]) => new THREE.Vector3(x / 32, heightAt(x / 32, z / 32) + 0.08, z / 32)), color);
  for (const s of SEAT_LIST) { rect(s.box.left, s.box.top, s.box.right, s.box.bottom, 0xffd400); rect(s.box.left - SIT_RANGE_PX, s.box.top - SIT_RANGE_PX, s.box.right + SIT_RANGE_PX, s.box.bottom + SIT_RANGE_PX, 0x998000); }
  const path = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x3080ff })); group.add(path);
  collisionView = { group, path }; scene.add(group);
}
function updateDebug(dt) {
  if (collisionView) { const pts = [sim.cur, ...follower.remaining].map((p) => new THREE.Vector3(p.x / 32, heightAt(p.x / 32, p.y / 32) + 0.1, p.y / 32)); collisionView.path.geometry.setFromPoints(pts); }
  if (!DEBUG) return;
  fps = fps * 0.95 + (dt > 0 ? 1 / dt : 0) * 0.05;
  const tile = tileOf(sim.cur, TILE_SIZE), r = net.room;
  $("debug").textContent = [
    `FPS    ${Math.round(fps)}`, `view   ${innerWidth}x${innerHeight}  dist ${view.distT.toFixed(1)}`,
    `pos    ${sim.cur.x.toFixed(1)}, ${sim.cur.y.toFixed(1)}`, `tile   ${tile.col}, ${tile.row}  ground=${GROUND[tile.row * MW + tile.col]} obstacle=${OBST[tile.row * MW + tile.col]}`,
    `facing ${sim.facing}${sim.moving ? " (moving)" : ""}${sim.seated ? " (seated)" : ""}`, `path   남은 경유점 ${follower.remaining.length}`, `F1     충돌·경로 표시 ${collisionView ? "켜짐" : "꺼짐"}`,
    `net    ${net.status} room=${r?.roomId ?? "-"} me=${r?.sessionId ?? "-"}${net.leaveCode !== undefined ? ` (code ${net.leaveCode})` : ""}`,
    `sync   lag=${LAG_MS}ms 대기입력=${net.prediction.pendingCount} 보정=${net.corrections}회 (마지막 ${net.lastCorrection.toFixed(2)}px)`,
    `interp 다른 사람 지연 ${Math.round(net.clock.interpolationDelay)}ms (자동)`,
  ].join("\n");
}

// ───────── 루프 ─────────
const clock = new THREE.Clock();
let pickWave = 0, miniT = 0;
/** 다른 사람·고양이: 서버 시간 기준으로 조금 과거(보간 지연)를 그린다 */
function renderOthers(now, dt) {
  const serverNow = net.clock.toServer(now), at = serverNow === null ? null : serverNow - net.clock.interpolationDelay;
  for (const [id, r] of remotes) {
    const s = at === null ? null : r.buffer.sample(at);
    if (s) { r.px = { x: s.x, y: s.y }; r.facing = s.facing; r.moving = s.moving && !s.seated; r.seat = s.seated ? SEATS.find((q) => q.id === s.seatId) || null : null; }
    r.pos.set(r.px.x / 32, heightAt(r.px.x / 32, r.px.y / 32), r.px.y / 32);
    r.walkT = r.moving ? r.walkT + dt : 0; r.hop = Math.max(0, r.hop - dt);
    r.hidden = isHidden(r.nickname);
    if (r.model) { r.model.root.visible = !r.hidden; r.shadow.visible = !r.hidden; }
    // 손에 든 간식은 위치처럼 보간할 필요가 없어서 최신 상태를 그대로
    const before = syncHands(r, net.room?.state?.players?.get(id)?.hands); if (!r.hidden) foodFx(r, dt, before);
    updateEmoteOf(r, dt);
  }
  for (const a of animals.values()) {
    const s = at === null ? null : a.buffer.sample(at);
    if (s) {
      a.px = { x: s.x, y: s.y }; a.facing = s.facing;
      if (s.action !== a.action) { a.action = s.action; a.animT = 0; }
      if (s.fxTick > a.shownFx) { a.shownFx = s.fxTick; if (CAT_FX.includes(s.fx)) catFx(a, s.fx); }
    }
    a.pos.set(a.px.x / 32, heightAt(a.px.x / 32, a.px.y / 32), a.px.y / 32); a.animT += dt;
    if (a.action === "sleep" && (a.zzz -= dt) <= 0) { a.zzz = 1.4; popAt("z", a.pos, 0.7, "zz", 0.25); }
  }
}
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt, clock.elapsedTime, performance.now());
  renderer.setRenderTarget(null); renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
/** 한 프레임의 게임 진행 (그리기 전까지) */
function update(dt, now, nowMs) {
  world.update(now);
  // 고정 틱: 서버와 같은 간격으로 입력을 읽고, 예측 이동하고, 서버로 보낸다 (탭이 멈췄다 돌아와도 한 번에 5틱까지만)
  tickAcc = Math.min(tickAcc + dt * 1000, TICK_MS * 5);
  while (tickAcc >= TICK_MS) { tickAcc -= TICK_MS; fixedTick(); }
  // 고르는 동안 가끔 손을 흔든다
  if (state.mode === "pick" && !player.act && (pickWave += dt) > 3.2) { pickWave = 0; player.act = { kind: "wave", t: 0 }; }
  syncSeat(); arrivePending(); updateSteer(); drawDressPreview(dt);
  placePlayer(tickAcc / TICK_MS);
  Object.assign(player, { facing: sim.facing, moving: sim.moving });
  player.walkT = sim.moving ? player.walkT + dt : 0; player.hop = Math.max(0, player.hop - dt);
  foodFx(player, dt, syncHands(player, myView()?.hands)); updateEmoteOf(player, dt);
  renderOthers(nowMs, dt); updateTrucks(dt); updateUI(); updateSound(dt);
  dest.visible = follower.active && state.mode === "play";
  if ((miniT -= dt) <= 0) { miniT = 0.1; drawMini(now); }
  for (const p of puffs) { if (!p.alive) continue; p.t += dt; const k = p.t / p.life; if (k >= 1) { p.alive = false; p.m.visible = false; continue; } p.m.position.x += p.dx * dt; p.m.position.y += p.rise * dt; p.m.scale.setScalar(p.size * (0.6 + k)); p.m.material.opacity = p.op * (1 - k); }
  snow.uTime.value = now; snow.uCenter.value.set(camTarget.x, camTarget.y - 1, camTarget.z);
  updateCamera(dt);
  posePerson(player, dt, now);
  for (const r of remotes.values()) if (r.model && !r.hidden) posePerson(r, dt, now);
  for (const a of animals.values()) poseCat(a, dt, now);
  placeShadow(player); for (const r of remotes.values()) placeShadow(r); for (const a of animals.values()) placeShadow(a);
  updateDebug(dt);
}
resize(); openPick("enter");
await loadImages();
requestAnimationFrame(frame);
// 첫 그림이 나온 뒤 불러오는 화면을 걷는다
requestAnimationFrame(() => { $("boot").classList.add("done"); setTimeout(() => $("boot").remove(), 500); });
// 개발 서버에서만: 콘솔·자동 시험에서 상태를 볼 수 있게
if (import.meta.env.DEV) window.__park = { advance: (sec) => { for (let i = 0; i < sec / 0.05; i++) update(0.05, clock.elapsedTime, performance.now()); }, project, state, sim, net, player, dressPlayer, remotes, animals, trucks, SEATS, heightAt, view, walkTo, enterPark, choosePreset, openPick, switchChannel, myView };
}
