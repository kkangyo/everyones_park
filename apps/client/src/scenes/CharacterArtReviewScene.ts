import { CharacterView } from "../entities/CharacterView";
import { MENU, type Facing } from "@park/shared";
import Phaser from 'phaser';
import { CHARACTER, bodySheet, outfitSheet, poseAnimKey } from '../assets';
import { buildParkMap } from '../world/parkMap';

/** Front-frame art checkpoint. Uses the game's actual renderer, map and display scale. */
export class CharacterArtReviewScene extends Phaser.Scene {
 constructor(){super('CharacterArtReview');}
 preload():void{
  for(const id of ['female-longhair','male-handsome'])for(const layer of ['body','outfit'])
   this.load.image(`remake-${id}-${layer}`,`sprites/remake/${id}-front-${layer}.png`);
 }
 create():void{
  if(new URLSearchParams(location.search).get("characterArtReview")==="actions"){this.showActions();return;}
  const park=buildParkMap(this),cam=this.cameras.main;
  cam.centerOn(park.entrance.x,park.entrance.y-48).setZoom(3).setRoundPixels(true);
  const x=park.entrance.x,y=park.entrance.y;
  const ids=['female-longhair','male-handsome'];
  ids.forEach((id,i)=>{
   const outfit=i===0?'ivory-sleeveless':'black-blazer-handsome';
   for(const remake of [false,true]){
    const px=x+(i===0?-42:42),py=y+(remake?36:-36);
    const body=remake?this.add.image(0,0,`remake-${id}-body`):this.add.sprite(0,0,bodySheet(id).key,0);
    const clothing=remake?this.add.image(0,0,`remake-${id}-outfit`):this.add.sprite(0,0,outfitSheet(outfit).key,0);
    for(const layer of [body,clothing])layer.setOrigin(.5,1).setScale(1/CHARACTER.pixelRatio);
    this.add.container(px,py,[body,clothing]).setScale(CHARACTER.worldScale).setDepth(100000);
    this.add.text(px,py+3,remake?'NEW FRONT':'PREVIOUS',{fontSize:'5px',color:'#ffffff',backgroundColor:'#202936',padding:{x:2,y:1}}).setOrigin(.5,0).setDepth(100001);
   }
  });
  const label=this.add.text(12,12,'FRONT ART REVIEW - 64px art / 48px world size\nTop: previous | Bottom: new | 1/2/3: zoom | Esc: lobby',{fontSize:'14px',color:'#fff',backgroundColor:'#202936',padding:{x:10,y:8}}).setScrollFactor(0).setDepth(200000);
  // UI on a separate camera so text stays at screen resolution.
  cam.ignore(label);const ui=this.cameras.add(0,0,this.scale.width,this.scale.height);ui.ignore(this.children.list.filter(o=>o!==label));
  for(const zoom of [1,2,3])this.input.keyboard?.on(`keydown-${zoom}`,()=>cam.setZoom(zoom));
  this.input.keyboard?.on('keydown-ESC',()=>{location.search='';});
 }
 private showActions():void{
  const park=buildParkMap(this),cam=this.cameras.main,x=park.entrance.x,y=park.entrance.y;
  cam.centerOn(x+38,y-36).setZoom(2.5).setRoundPixels(true);
  const directions:Facing[]=['down','left','right','up','down-left','down-right','up-left','up-right'];
  const lies:{body:Phaser.GameObjects.Sprite;outfit:Phaser.GameObjects.Sprite;id:string}[]=[];
  const actors:{view:CharacterView;pos:{x:number;y:number};pose:number}[]=[];
  ['female','male'].forEach((gender,i)=>{
   const appearance={gender:gender as 'female'|'male',face:i?'male-handsome':'female-longhair',outfit:i?'black-blazer-handsome':'ivory-sleeveless'};
   for(let pose=0;pose<4;pose++){
    const pos={x:x+(pose-1.5)*76,y:y+i*96},view=new CharacterView(this,pos,['WALK','CARRY','SIT','SIT+CARRY'][pose]!,appearance);
    if(pose===1||pose===3)view.setHands([...MENU.keys()].slice(0,2).map((item,j)=>({item,hand:j?'left':'right',stage:0,eating:false})));
    actors.push({view,pos,pose});
   }
   const body=this.add.sprite(0,0,bodySheet(appearance.face).key,96).setOrigin(.5,1).setScale(.5),outfit=this.add.sprite(0,0,outfitSheet(appearance.outfit).key,96).setOrigin(.5,1).setScale(.5);
   this.add.container(x+190,y+i*96,[body,outfit]).setScale(CHARACTER.worldScale).setDepth(100000);
   lies.push({body,outfit,id:appearance.face});
   this.add.text(x+190,y+i*96-51,"LIE",{fontSize:"9px",color:"#fff",stroke:"#202936",strokeThickness:3}).setOrigin(.5,1).setDepth(100001);
  });
  this.events.on('update',()=>{const facing=directions[Math.floor(this.time.now/2000)%8]!;for(const l of lies){l.body.anims.play(poseAnimKey(l.id,directions[Math.floor(this.time.now/2000)%4]!, 'lie'),true);l.outfit.setFrame(l.body.frame.name);}
   for(const {view,pos,pose}of actors){view.setPose(pos,facing,pose<2,pose>=2);}});
  this.events.once('shutdown',()=>actors.forEach(a=>a.view.destroy()));
 }

}
