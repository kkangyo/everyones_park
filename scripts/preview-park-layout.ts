/** Review artifacts from the actual generated Tiled map, not a separate mock layout. */
import { readFileSync,writeFileSync,mkdirSync } from "node:fs";
import { Canvas,encodePng,hex } from "./lib/png";
import { MAP_W,MAP_H,WINTER_TILE as T,LANDMARKS,PARK_BOUNDARY,MAIN_LOOP,smoothLoop } from "./lib/winter-park-layout";
const map=JSON.parse(readFileSync("assets/maps/park.json","utf8"));
if(map.width!==MAP_W||map.height!==MAP_H)throw Error("Map and layout dimensions differ");
const ground=map.layers.find((l:{name:string})=>l.name==="ground").data as number[];
const obstacle=map.layers.find((l:{name:string})=>l.name==="obstacles").data as number[];
const S=6,c=new Canvas(MAP_W*S,MAP_H*S);
const colors:Record<number,string>={
  [T.snow]:"#edf3f7",[T.snow2]:"#e2ebf0",[T.path]:"#c8b597",[T.plaza]:"#c9d0d3",[T.ice]:"#97bfce",[T.hill]:"#c1d0dc",[T.bridge]:"#aa8760",[T.stage]:"#b9b6aa",
};
for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
  const i=y*MAP_W+x,g=ground[i]!-1;c.rect(x*S,y*S,S,S,hex(colors[g]??"#e6edf2"));
  if(g===T.ice){if((x*7+y*3)%19===0)c.rect(x*S+1,y*S+3,4,1,hex("#d8eff7"));if(y>0&&ground[i-MAP_W]!==T.ice+1)c.rect(x*S,y*S,S,1,hex("#f8fbff"));}
  if(g===T.bridge){c.rect(x*S+1,y*S,1,S,hex("#735b43"));c.rect(x*S+4,y*S,1,S,hex("#d5bd9b"));}
  if(g===T.stage)c.rect(x*S,y*S,S,1,hex("#f4f6f4"));
}
// Canopies rendered after terrain, with a short northward overhang like the game.
for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
  const t=obstacle[y*MAP_W+x]!-1,ox=x*S,oy=y*S;
  if(t===T.tree){
    c.rect(ox+3,oy+2,1,4,hex("#705943"));
    for(let k=0;k<3;k++)for(let yy=0;yy<5;yy++){
      const half=Math.min(k+1,1+Math.floor(yy/2));
      c.rect(ox+3-half,oy-5+k*2+yy,half*2,1,hex(yy===0?"#f5fbfc":k===0?"#3e6659":"#365d51"));
    }
  }else if(t===T.rock){c.rect(ox+1,oy+2,4,3,hex("#8e9eab"));c.rect(ox+1,oy+1,4,2,hex("#f7fafc"));}
  else if(t===T.garden){c.rect(ox,oy,S,S,hex("#a99a7a"));c.rect(ox+1,oy+1,4,3,hex("#84927c"));c.rect(ox,oy,S,1,hex("#f9fbfc"));}
  else if(t===T.fence){c.rect(ox+2,oy,2,S,hex("#8d7559"));c.rect(ox+2,oy,1,S,hex("#f8fcff"));}
  else if([T.benchDown,T.benchUp,T.benchLeft].includes(t as 10|11|12)){
    c.rect(ox+1,oy+2,4,3,hex("#9c704e"));c.rect(ox,oy+1,S,1,hex("#f7fafc"));
  }
}
const trucks=map.layers.find((l:{name:string})=>l.name==="trucks").objects as {name:string;x:number;y:number;width:number;height:number}[];
for(const [i,t]of trucks.entries()){
  const x=t.x/32*S,y=t.y/32*S;
  c.rect(x,y,18,12,hex(i%2?"#ba704b":"#9d654b"));c.rect(x,y,18,3,hex("#f8f5ea"));c.rect(x+2,y+8,14,2,hex("#efc789"));
}
const out="docs/park-layout";mkdirSync(out,{recursive:true});
const png=encodePng(c);writeFileSync(`${out}/winter-overview.png`,png);
const poly=PARK_BOUNDARY.map(([x,y])=>`${x*S},${y*S}`).join(" ");
const route=smoothLoop(MAIN_LOOP).map(([x,y],i)=>`${i?"L":"M"}${x*S},${y*S}`).join(" ")+"Z";
const tags=LANDMARKS.map((p,i)=>`<g><circle cx="${p.center[0]*S}" cy="${p.center[1]*S}" r="10" fill="#fffaf0" stroke="#58756f" stroke-width="2"/><text x="${p.center[0]*S}" y="${p.center[1]*S+4}" text-anchor="middle" font-size="11" font-weight="700" fill="#28443c">${i+1}</text></g>`).join("");
const legend=LANDMARKS.map((p,i)=>`<g transform="translate(940 ${170+i*66})"><text fill="#9a6742" font-size="13" font-weight="700">${String(i+1).padStart(2,"0")}</text><text x="27" fill="#2f4b43" font-size="15" font-weight="600">${p.english}</text><text x="27" y="21" fill="#7d8b88" font-size="11">${p.kind.toUpperCase()}</text></g>`).join("");
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1240" viewBox="0 0 1200 1240"><rect width="1200" height="1240" fill="#f4f6f3"/><g font-family="Arial,sans-serif"><text x="34" y="38" font-size="13" letter-spacing="4" fill="#8a6f50">ONE PARK / WINTER STUDY 01</text><text x="32" y="75" font-size="30" font-weight="700" fill="#28443c">A loop through the winter gardens</text><text x="34" y="99" font-size="13" fill="#758780">144 × 176 tiles · 4,608 × 5,632 px · 32 px tiles</text><g transform="translate(32 125)"><image href="data:image/png;base64,${png.toString("base64")}" width="864" height="1056" style="image-rendering:pixelated"/><polygon points="${poly}" fill="none" stroke="#68877c" stroke-width="2" stroke-opacity=".6"/><path id="loop" d="${route}" fill="none" stroke="#ba704c" stroke-width="2" stroke-dasharray="5 5" visibility="hidden"/><g id="labels">${tags}</g></g><text x="938" y="138" font-size="12" letter-spacing="2" fill="#82938b">THE WALK</text>${legend}<g transform="translate(938 896)"><path d="M0 0H218" stroke="#d0d8d2"/><text y="32" font-size="13" font-weight="700" fill="#28443c">8 snack trucks · 44 seats</text><text y="60" font-size="12" fill="#758780">5-tile main promenade</text><text y="82" font-size="12" fill="#758780">Two frozen ponds + footbridge</text><text y="104" font-size="12" fill="#758780">South gate → gardens → stage</text><path d="M18 150V125M12 134L18 125L24 134" fill="none" stroke="#58756f" stroke-width="2"/><text x="13" y="174" font-size="13" fill="#58756f">N</text></g><text x="34" y="1214" font-size="12" fill="#758780">Snow-covered woodland boundary, curved promenades, protected ice, and warm places to pause.</text></g></svg>`;
writeFileSync(`${out}/winter-layout.svg`,svg);
writeFileSync(`${out}/review.html`,`<!doctype html><html lang="ko"><meta charset="utf-8"><title>One Park 겨울 공원 레이아웃</title><style>body{margin:24px;background:#e7ece7;font:15px system-ui;color:#28443c}label{margin-right:20px}.map{max-width:1200px}svg{width:100%;height:auto}p{max-width:1100px}</style><h1>겨울 공원 전체 레이아웃</h1><p>참고 이미지의 유기적인 순환로, 중앙 원형 정원, 북·남 연못 구성을 게임의 겨울 공원에 맞춰 재배치했습니다. 지도는 실제 park.json의 지면·장애물·트럭 배치를 그립니다.</p><label><input id="route" type="checkbox">주 순환로 강조</label><label><input id="markers" type="checkbox" checked>구역 번호</label><div class="map">${svg}</div><script>document.querySelector('#route').onchange=e=>document.querySelector('#loop').setAttribute('visibility',e.target.checked?'visible':'hidden');document.querySelector('#markers').onchange=e=>document.querySelector('#labels').setAttribute('visibility',e.target.checked?'visible':'hidden')</script></html>`);
console.log(`${out}/winter-overview.png; winter-layout.svg; review.html`);
