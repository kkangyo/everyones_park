import grips from './character-art-grips.json';
import { handOffset, type Facing } from '@park/shared';
/** Authored per-frame palm positions in the new 64px artwork, in 32px world coordinates. */
export function artHandOffset(bodyId:string,facing:Facing,hand:'left'|'right',seated=false,column=0):{x:number;y:number}{
 const directions=['down','left','right','up','down-left','down-right','up-left','up-right'];
 const row=(seated?20:8)+directions.indexOf(facing);
 const table=grips as Record<string,Record<string,Record<string,{x:number;y:number}>>>;
 return table[bodyId]?.[`${row}:${column}`]?.[hand]??handOffset(facing,hand,seated,column);
}
