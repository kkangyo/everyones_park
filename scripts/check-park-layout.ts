/** Navigation and interaction checks against the stored map, using runtime readers. */
import assert from "node:assert/strict";
import { readFileSync,writeFileSync,mkdirSync } from "node:fs";
import { collisionGridFromTiled,boxHitsWall,footBox } from "../packages/shared/src/collision";
import { findPath,tileOf,tileCenter } from "../packages/shared/src/pathfinding";
import { truckPlacementsFromTiled,truckFrontPoint,TRUCKS } from "../packages/shared/src/food";
import { seatsFromTiled,seatStandPoint,distanceToSeat,SIT_RANGE_PX } from "../packages/shared/src/seats";
import { WINTER_TILE as T,MAIN_LOOP,buildWinterParkLayout } from "./lib/winter-park-layout";
const raw=JSON.parse(readFileSync("assets/maps/park.json","utf8"));
const rebuilt=buildWinterParkLayout(),again=buildWinterParkLayout();
assert.deepEqual(rebuilt.ground,again.ground,"Terrain generation is not deterministic");
assert.deepEqual(rebuilt.obstacles,again.obstacles,"Obstacle generation is not deterministic");
assert.deepEqual(raw.layers.find((l:{name:string})=>l.name==="ground").data,rebuilt.ground.map(n=>n+1),"Stored terrain differs from generator");
assert.deepEqual(raw.layers.find((l:{name:string})=>l.name==="obstacles").data,rebuilt.obstacles.map(n=>n<0?0:n+1),"Stored obstacles differ from generator");
const grid=collisionGridFromTiled(raw,"obstacles"),spawn=raw.layers.find((l:{name:string})=>l.name==="spawns").objects.find((o:{name:string})=>o.name==="entrance");
assert.equal(raw.tilewidth,32);assert.equal(raw.tileheight,32);
assert.notEqual(raw.width,raw.height);assert.ok(raw.width>0&&raw.height>0);
for(const l of raw.layers.filter((l:{type:string})=>l.type==="tilelayer")){assert.equal(l.data.length,raw.width*raw.height);assert.ok(l.data.every((n:number)=>Number.isInteger(n)&&n>=0&&n<=16));}
assert.ok(!boxHitsWall(grid,footBox(spawn)),"Spawn blocked");
const start=tileOf(spawn,32);let checkedRoutes=0;
function reachable(point:{x:number;y:number},label:string){
  assert.ok(!boxHitsWall(grid,footBox(point)),`${label}: standing footbox blocked`);
  const path=findPath(grid,start,tileOf(point,32));assert.ok(path,`${label}: unreachable`);
  let prev=tileCenter(start,32);
  for(const t of path){const next=tileCenter(t,32);for(let k=1;k<=4;k++){const pos={x:prev.x+(next.x-prev.x)*k/4,y:prev.y+(next.y-prev.y)*k/4};assert.ok(!boxHitsWall(grid,footBox(pos)),`${label}: path clips obstacle`);}prev=next;}
  checkedRoutes++;return path.length;
}
const trucks=truckPlacementsFromTiled(raw,"trucks");assert.equal(trucks.length,TRUCKS.size);assert.equal(new Set(trucks.map(t=>t.def.id)).size,trucks.length);
const truckRoutes=trucks.map(t=>({id:t.def.id,tiles:reachable(truckFrontPoint(t),`truck ${t.def.id}`)}));
const seats=seatsFromTiled(raw,"seats");let slots=0;
for(const s of seats)for(let i=0;i<s.slots.length;i++){const point=seatStandPoint(s,i,grid);assert.ok(distanceToSeat(point,s)<=SIT_RANGE_PX,`${s.id}: too far to sit`);reachable(point,`seat ${s.id}/${i}`);slots++;}
const landmarks=raw.layers.find((l:{name:string})=>l.name==="landmarks").objects as {name:string;properties:{name:string;value:number}[]}[];
const landmarkRoutes=landmarks.map(p=>{const get=(key:string)=>p.properties.find(x=>x.name===key)!.value;return{id:p.name,tiles:reachable({x:get("accessX"),y:get("accessY")},p.name)};});
const ground=raw.layers.find((l:{name:string})=>l.name==="ground").data as number[];
let ice=0,bridge=0;
for(let i=0;i<ground.length;i++){
  if(ground[i]===T.ice+1){ice++;assert.equal(grid.blocked[i],1,"Unprotected ice tile");}
  if(ground[i]===T.bridge+1){bridge++;assert.equal(grid.blocked[i],0,"Bridge is blocked");}
}
assert.ok(ice>500);assert.ok(bridge>0);
const paved={...grid,blocked:Uint8Array.from(grid.blocked,(n,i)=>n||![T.path+1,T.plaza+1,T.bridge+1,T.stage+1].includes(ground[i]!)?1:0)};
let loopLength=0;
for(let i=0;i<MAIN_LOOP.length;i++){
  const a=MAIN_LOOP[i]!,b=MAIN_LOOP[(i+1)%MAIN_LOOP.length]!;
  const path=findPath(paved,{col:a[0],row:a[1]},{col:b[0],row:b[1]});
  assert.ok(path,`Main loop segment ${i} has a gap`);
  assert.ok(path.length<Math.hypot(a[0]-b[0],a[1]-b[1])*1.8+12,`Main loop ${i} needs a long detour`);
  loopLength+=path.length;
}
for(const x of [0,raw.width-1])for(let y=0;y<raw.height;y++)assert.equal(grid.blocked[y*raw.width+x],1,"Open outer map boundary");
for(const y of [0,raw.height-1])for(let x=0;x<raw.width;x++)assert.equal(grid.blocked[y*raw.width+x],1,"Open outer map boundary");
const visited=new Set<number>(),queue=[start.row*grid.cols+start.col];visited.add(queue[0]!);
for(let n=0;n<queue.length;n++){const i=queue[n]!,x=i%grid.cols,y=Math.floor(i/grid.cols);for(const[dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx!,yy=y+dy!;if(xx<0||yy<0||xx>=grid.cols||yy>=grid.rows)continue;const j=yy*grid.cols+xx;if(!grid.blocked[j]&&!visited.has(j)){visited.add(j);queue.push(j);}}}
const walkable=Array.from(grid.blocked).filter(n=>!n).length;assert.equal(visited.size,walkable,"Disconnected walkable pocket remains");
const report={dimensions:[raw.width,raw.height],pixels:[raw.width*32,raw.height*32],deterministic:true,walkableTiles:walkable,reachableWalkableTiles:visited.size,trucks:trucks.length,benches:seats.length,seats:slots,landmarks:landmarks.length,checkedRoutes,iceTiles:ice,bridgeTiles:bridge,mainLoopSegments:MAIN_LOOP.length,mainLoopConnected:true,loopLengthTiles:loopLength,truckRoutes,landmarkRoutes};
mkdirSync("docs/park-layout",{recursive:true});writeFileSync("docs/park-layout/check-report.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report));
