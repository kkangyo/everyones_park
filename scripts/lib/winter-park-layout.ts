/** Reference-inspired winter park; shared source for the generated map and overview. */
export const MAP_W=144, MAP_H=176, TILE=32;
export const WINTER_TILE={snow:0,snow2:1,path:2,plaza:3,ice:4,hill:5,tree:6,fence:7,rock:8,truck:9,benchDown:10,benchUp:11,benchLeft:12,garden:13,bridge:14,stage:15} as const;
export const EMPTY=-1;
type Point=readonly [number,number];
export const PARK_BOUNDARY:readonly Point[]=[[46,5],[70,6],[78,18],[108,12],[129,25],[136,51],[139,76],[134,100],[128,120],[126,143],[109,158],[84,162],[71,171],[48,170],[26,160],[16,144],[15,120],[24,100],[21,77],[27,59],[22,42],[29,20]];
export const MAIN_LOOP:readonly Point[]=[[51,17],[69,26],[82,48],[108,53],[126,70],[128,91],[119,106],[117,131],[103,145],[81,150],[63,154],[38,150],[26,136],[29,115],[35,98],[31,79],[37,62],[35,43]];
export const NORTH_POND:readonly Point[]=[[89,72],[100,67],[113,69],[122,77],[123,85],[118,93],[106,97],[95,94],[86,89],[83,82]];
export const SOUTH_POND:readonly Point[]=[[96,115],[105,115],[112,120],[111,128],[104,133],[95,131],[90,125],[91,119]];
export interface Landmark {id:string;name:string;english:string;center:Point;access:Point;kind:string}
export const LANDMARKS:readonly Landmark[]=[
  {id:"entrance",name:"남쪽 입구 광장",english:"South gate",center:[68,163],access:[68,163],kind:"entrance"},
  {id:"central-garden",name:"겨울 원형 정원",english:"Winter rotunda",center:[64,94],access:[64,94],kind:"garden"},
  {id:"north-pond",name:"북쪽 얼음 연못",english:"North pond",center:[104,82],access:[79,83],kind:"pond"},
  {id:"south-pond",name:"남쪽 얼음 연못",english:"South pond",center:[101,124],access:[86,124],kind:"pond"},
  {id:"amphitheater",name:"눈 덮인 야외 공연장",english:"Open-air stage",center:[52,38],access:[52,45],kind:"stage"},
  {id:"snow-meadow",name:"설원 놀이마당",english:"Snow meadow",center:[104,28],access:[104,28],kind:"meadow"},
  {id:"winter-grove",name:"겨울 수목 정원",english:"Winter grove",center:[48,131],access:[48,131],kind:"grove"},
  {id:"overlook",name:"연못 전망 언덕",english:"Pond overlook",center:[122,111],access:[121,111],kind:"hill"},
  {id:"forest-walk",name:"서쪽 소나무 숲길",english:"Pine walk",center:[30,73],access:[32,73],kind:"forest"},
  {id:"creek-bridge",name:"얼음 개울 목교",english:"Creek bridge",center:[104,109],access:[104,109],kind:"bridge"},
];
export interface TruckObject {name:string;col:number;row:number}
export const TRUCKS:readonly TruckObject[]=[
  {name:"bunsik",col:46,row:108},{name:"eomuk",col:53,row:108},
  {name:"bungeoppang",col:63,row:147},{name:"hotteok",col:76,row:147},
  {name:"goguma",col:34,row:128},{name:"gyeranppang",col:70,row:54},
  {name:"drink",col:112,row:47},{name:"kkochi",col:121,row:134},
];
export interface BenchObject {name:string;col:number;row:number;slots:number;facing:"down"|"up"|"left"}
export const BENCHES:readonly BenchObject[]=[
  {name:"bench-entrance-1",col:59,row:160,slots:2,facing:"down"},{name:"bench-entrance-2",col:77,row:160,slots:2,facing:"down"},
  {name:"bench-garden-n1",col:58,row:76,slots:2,facing:"down"},{name:"bench-garden-n2",col:68,row:76,slots:2,facing:"down"},
  {name:"bench-garden-s1",col:58,row:112,slots:2,facing:"up"},{name:"bench-garden-s2",col:68,row:112,slots:2,facing:"up"},
  {name:"bench-north-pond-1",col:127,row:79,slots:2,facing:"left"},{name:"bench-north-pond-2",col:125,row:89,slots:2,facing:"left"},
  {name:"bench-south-pond-1",col:115,row:121,slots:2,facing:"left"},{name:"bench-south-pond-2",col:114,row:128,slots:2,facing:"left"},
  {name:"bench-stage-1",col:42,row:47,slots:2,facing:"up"},{name:"bench-stage-2",col:56,row:47,slots:2,facing:"up"},
  {name:"bench-meadow-1",col:90,row:40,slots:2,facing:"up"},{name:"bench-meadow-2",col:111,row:40,slots:2,facing:"up"},
  {name:"bench-grove-1",col:42,row:137,slots:2,facing:"up"},{name:"bench-grove-2",col:52,row:137,slots:2,facing:"up"},
  {name:"bench-overlook-1",col:121,row:108,slots:2,facing:"left"},{name:"bench-overlook-2",col:121,row:115,slots:2,facing:"left"},
  {name:"bench-market-1",col:44,row:115,slots:2,facing:"down"},{name:"bench-market-2",col:56,row:115,slots:2,facing:"down"},
  {name:"bench-forest-1",col:29,row:60,slots:2,facing:"down"},{name:"bench-forest-2",col:43,row:57,slots:2,facing:"up"},
];
export const ENTRANCE={col:68,row:163};
export const benchSize=(b:BenchObject)=>b.facing==="left"?{w:1,h:b.slots}:{w:b.slots,h:1};
export function pointInPolygon(x:number,y:number,points:readonly Point[]):boolean {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i]!,b=points[j]!;
    if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside;
}
function random(seed:number):()=>number{return()=>{seed|=0;seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
export function smoothLoop(points:readonly Point[],steps=16):Point[]{
  const out:Point[]=[];
  for(let i=0;i<points.length;i++)for(let k=0;k<steps;k++){
    const p0=points[(i-1+points.length)%points.length]!,p1=points[i]!,p2=points[(i+1)%points.length]!,p3=points[(i+2)%points.length]!,t=k/steps;
    const f=(axis:0|1)=>.5*(2*p1[axis]+(-p0[axis]+p2[axis])*t+(2*p0[axis]-5*p1[axis]+4*p2[axis]-p3[axis])*t*t+(-p0[axis]+3*p1[axis]-3*p2[axis]+p3[axis])*t*t*t);
    out.push([f(0),f(1)]);
  }return out;
}
export function buildWinterParkLayout(){
  const T=WINTER_TILE,rand=random(20261113),ground=Array<number>(MAP_W*MAP_H),obstacles=Array<number>(MAP_W*MAP_H).fill(EMPTY),reserved=new Uint8Array(MAP_W*MAP_H),mask=new Uint8Array(MAP_W*MAP_H);
  const idx=(x:number,y:number)=>y*MAP_W+x,inside=(x:number,y:number)=>x>=0&&y>=0&&x<MAP_W&&y<MAP_H;
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
    const i=idx(x,y);mask[i]=pointInPolygon(x+.5,y+.5,PARK_BOUNDARY)?1:0;
    ground[i]=mask[i]?(rand()<.2?T.snow2:T.snow):T.hill;
    if(!mask[i])obstacles[i]=T.truck; // invisible perimeter collision; no truck object
  }
  const ellipse=(cx:number,cy:number,rx:number,ry:number,fn:(x:number,y:number)=>void)=>{
    for(let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++)for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++)if(inside(x,y)&&mask[idx(x,y)]&&((x-cx)/rx)**2+((y-cy)/ry)**2<=1)fn(x,y);
  };
  const paint=(x:number,y:number,t:number)=>{if(inside(x,y)&&mask[idx(x,y)]){ground[idx(x,y)]=t;reserved[idx(x,y)]=1;}};
  const solid=(x:number,y:number,t:number)=>{if(inside(x,y)&&mask[idx(x,y)]){obstacles[idx(x,y)]=t;reserved[idx(x,y)]=1;}};
  const polygon=(points:readonly Point[],fn:(x:number,y:number)=>void)=>{for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++)if(mask[idx(x,y)]&&pointInPolygon(x+.5,y+.5,points))fn(x,y);};
  const stroke=(points:readonly Point[],width=3,t:number=T.path,bridge=false,closed=false)=>{
    for(let n=0;n<points.length-(closed?0:1);n++){
      const a=points[n]!,b=points[(n+1)%points.length]!,steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2));
      for(let s=0;s<=steps;s++){
        const cx=Math.round(a[0]+(b[0]-a[0])*s/steps),cy=Math.round(a[1]+(b[1]-a[1])*s/steps),r=Math.floor(width/2);
        for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
          const x=cx+dx,y=cy+dy;if(!inside(x,y)||!mask[idx(x,y)])continue;
          const i=idx(x,y),water=obstacles[i]===T.ice;
          if(water&&!bridge)continue;
          if(bridge&&water){ground[i]=T.bridge;obstacles[i]=EMPTY;}
          else if(ground[i]!==T.bridge)ground[i]=t;
          if(obstacles[i]===T.garden)obstacles[i]=EMPTY;
          reserved[i]=1;
        }
      }
    }
  };
  const ring=(cx:number,cy:number,rx:number,ry:number,width:number,t:number=T.path)=>stroke(Array.from({length:128},(_,a)=>[cx+Math.cos(a*Math.PI/64)*rx,cy+Math.sin(a*Math.PI/64)*ry] as Point),width,t,false,true);
  // Irregular frozen ponds and a narrow channel, all blocked except the bridge.
  polygon(NORTH_POND,(x,y)=>{paint(x,y,T.ice);solid(x,y,T.ice);});
  polygon(SOUTH_POND,(x,y)=>{paint(x,y,T.ice);solid(x,y,T.ice);});
  const creek:Point[]=[[104,96],[107,101],[109,104],[105,108],[100,112],[99,117]];
  for(let n=0;n<creek.length-1;n++){
    const a=creek[n]!,b=creek[n+1]!,steps=Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])*2);
    for(let s=0;s<=steps;s++)ellipse(a[0]+(b[0]-a[0])*s/steps,a[1]+(b[1]-a[1])*s/steps,1.5,1.5,(x,y)=>{paint(x,y,T.ice);solid(x,y,T.ice);});
  }
  // Distinct program clearings. Snow meadow replaces the reference sports fields.
  ellipse(104,28,21,11,(x,y)=>paint(x,y,T.snow2));
  ring(104,28,22,12,3);
  ellipse(52,38,18,16,(x,y)=>paint(x,y,T.snow2));
  ring(52,38,20,18,3);
  for(const r of [7,10,13])for(let a=10;a<=170;a+=2){const angle=a*Math.PI/180;paint(Math.round(52+Math.cos(angle)*r),Math.round(32+Math.sin(angle)*r),T.stage);}
  for(let y=29;y<=32;y++)for(let x=46;x<=58;x++)paint(x,y,T.stage);
  stroke([[52,32],[52,50]],3,T.plaza);
  ellipse(122,111,8,14,(x,y)=>paint(x,y,T.hill));
  for(let y=103;y<=117;y++)solid(130,y,T.fence);
  ellipse(64,94,17,17,(x,y)=>paint(x,y,T.snow2));
  ring(64,94,17,17,3);
  for(let n=0;n<8;n++){
    const a=(n*45+22.5)*Math.PI/180;
    ellipse(64+Math.cos(a)*10.5,94+Math.sin(a)*10.5,2,2,(x,y)=>solid(x,y,T.garden));
    const axis=n*Math.PI/4;stroke([[64,94],[64+Math.cos(axis)*17,94+Math.sin(axis)*17]],3,T.plaza);
  }
  ellipse(64,94,4,4,(x,y)=>paint(x,y,T.plaza));
  ellipse(48,131,11,9,(x,y)=>paint(x,y,T.snow2));ring(48,131,11,9,3);
  ellipse(48,131,3,3,(x,y)=>paint(x,y,T.plaza));
  // Large outer loop + clear shortcuts; bridge is the only explicit ice crossing.
  stroke(smoothLoop(MAIN_LOOP),5,T.path,false,true);
  stroke([[68,163],[67,156],[63,154]],5);
  ellipse(68,163,14,7,(x,y)=>paint(x,y,T.plaza));
  stroke([[63,154],[64,125],[64,111]],5);
  stroke([[35,98],[47,94]],5);
  stroke([[64,77],[72,66],[76,54],[69,50]],5);
  stroke([[80,94],[82,105],[103,109],[121,109]],5,T.path,true);
  stroke([[79,83],[78,93],[81,103]],3);
  stroke([[81,103],[86,115],[86,124],[91,139],[103,145]],3);
  stroke([[82,48],[93,43],[104,40],[104,28]],5);
  stroke([[35,43],[30,60],[32,73],[31,79]],3);
  stroke([[29,115],[39,119],[48,122],[48,131],[48,142],[38,150]],3);
  stroke([[64,125],[59,128],[48,131],[35,131]],3);
  stroke([[105,109],[109,111],[121,111],[123,119],[117,131]],3);
  // Reserved, paved trading bays: queues do not occupy the full main promenade.
  for(const t of TRUCKS){
    const cx=t.col+1.5,cy=t.row+3;
    ellipse(cx,cy,5,4,(x,y)=>paint(x,y,T.plaza));
    const anchors:Record<string,Point>={bunsik:[48,113],eomuk:[59,113],bungeoppang:[63,154],hotteok:[81,150],goguma:[37,131],gyeranppang:[75,58],drink:[108,53],kkochi:[116,139]};
    stroke([[cx,cy],anchors[t.name]!],3);
  }
  stroke([[48,113],[59,113],[64,111]],3);
  stroke([[35,111],[48,113]],3);
  // Deliberate small groves, with open center walks rather than random peppering.
  for(const[x,y]of [[42,126],[43,127],[44,126],[52,126],[53,127],[54,126],[42,135],[43,136],[44,135],[52,135],[53,136],[54,135]])solid(x!,y!,T.tree);
  // Benches have clear approach/stand bays, before any trees are scattered.
  for(const b of BENCHES){
    const {w,h}=benchSize(b);ellipse(b.col+w/2,b.row+h/2,3.5,3.5,(x,y)=>{if(obstacles[idx(x,y)]!==T.ice)paint(x,y,T.plaza);});
  }
  for(let y=1;y<MAP_H-1;y++)for(let x=1;x<MAP_W-1;x++){
    const i=idx(x,y);if(!mask[i]||reserved[i]||obstacles[i]!==EMPTY)continue;
    let nearReserved=false,nearEdge=false;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      if(!inside(x+dx,y+dy))continue;
      if(reserved[idx(x+dx,y+dy)])nearReserved=true;
      if(!mask[idx(x+dx,y+dy)])nearEdge=true;
    }
    if(nearReserved)continue;
    const pine=(x<41&&y<114)||(x<59&&y>119&&y<148)
      ||((x-53)/14)**2+((y-62)/9)**2<1
      ||((x-47)/10)**2+((y-74)/12)**2<1
      ||((x-73)/10)**2+((y-133)/12)**2<1;
    const density=nearEdge ? .65 : pine ? .19 : .028;
    if(rand()<density)obstacles[i]=T.tree;
    else if(rand()<.007)obstacles[i]=T.rock;
  }
  const clear=(x:number,y:number,kind:string)=>{
    if(!inside(x,y)||!mask[idx(x,y)])throw Error(`${kind} outside park at ${x},${y}`);
    const p=obstacles[idx(x,y)];if(p===T.ice||p===T.fence||p===T.truck)throw Error(`${kind} overlaps protected tile at ${x},${y}`);
    obstacles[idx(x,y)]=EMPTY;
  };
  for(const t of TRUCKS){
    for(let y=t.row-1;y<=t.row+4;y++)for(let x=t.col-1;x<=t.col+3;x++)clear(x,y,t.name);
    for(let y=t.row;y<t.row+2;y++)for(let x=t.col;x<t.col+3;x++)obstacles[idx(x,y)]=T.truck;
  }
  for(const b of BENCHES){
    const{w,h}=benchSize(b);
    for(let y=b.row-1;y<=b.row+h;y++)for(let x=b.col-1;x<=b.col+w;x++)clear(x,y,b.name);
    for(let n=1;n<=2;n++)for(let y=b.row;y<b.row+h;y++)for(let x=b.col;x<b.col+w;x++)clear(x+(b.facing==="left"?-n:0),y+(b.facing==="up"?-n:b.facing==="down"?n:0),b.name);
    const tile=b.facing==="left"?T.benchLeft:b.facing==="up"?T.benchUp:T.benchDown;
    for(let y=b.row;y<b.row+h;y++)for(let x=b.col;x<b.col+w;x++)obstacles[idx(x,y)]=tile;
  }
  // Remove inaccessible tiny pockets caused by tree clusters, never gameplay POIs.
  const reachable=new Uint8Array(MAP_W*MAP_H),queue=[idx(ENTRANCE.col,ENTRANCE.row)];reachable[queue[0]!]=1;
  for(let n=0;n<queue.length;n++){
    const at=queue[n]!,x=at%MAP_W,y=Math.floor(at/MAP_W);
    for(const[dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx!,yy=y+dy!;if(!inside(xx,yy))continue;const j=idx(xx,yy);if(!reachable[j]&&obstacles[j]===EMPTY){reachable[j]=1;queue.push(j);}}
  }
  let sealedPockets=0;
  for(let i=0;i<obstacles.length;i++)if(mask[i]&&obstacles[i]===EMPTY&&!reachable[i]){obstacles[i]=T.garden;sealedPockets++;}
  return{ground,obstacles,mask,reserved,trucks:TRUCKS,benches:BENCHES,sealedPockets};
}
