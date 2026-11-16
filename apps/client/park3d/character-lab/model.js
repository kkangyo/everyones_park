/* Independent, procedural 3D study. All face details are attached to the head. */
window.createMintCharacter = function(T) {
 const root=new T.Group(), body=new T.Group();root.add(body);
 const mat=(color,roughness=.5)=>new T.MeshStandardMaterial({color:new T.Color(color).convertSRGBToLinear(),roughness,metalness:0});
 const skin=mat('#ffc1a5'),hair=mat('#a55c35',.34),hairLight=mat('#bc7848',.36),mint=mat('#9ed7c2'),cream=mat('#fff1df',.85),boot=mat('#ad7060',.32),pink=mat('#ed9cad'),gold=new T.MeshStandardMaterial({color:new T.Color('#e8b76b').convertSRGBToLinear(),metalness:.65,roughness:.26}),dark=mat('#4b2c36');
 const sphere=new T.SphereGeometry(1,32,20);
 function ell(p,m,x,y,z,a,b,c){const o=new T.Mesh(sphere,m);o.position.set(x,y,z);o.scale.set(a,b,c);o.castShadow=true;o.receiveShadow=true;p.add(o);return o}
 function group(p,x,y,z){const g=new T.Group();g.position.set(x,y,z);p.add(g);return g}
 function line(p,pts,r,m){const curve=new T.CatmullRomCurve3(pts.map(v=>new T.Vector3(...v)));const o=new T.Mesh(new T.TubeGeometry(curve,40,r,8,false),m);o.castShadow=true;p.add(o);return o}
 function heart(p,x,y,z,s,m){const sh=new T.Shape();sh.moveTo(0,-.6);sh.bezierCurveTo(-1,-.05,-.85,.65,-.4,.65);sh.bezierCurveTo(-.15,.65,0,.45,0,.35);sh.bezierCurveTo(.2,.85,1,.7,.8,.15);sh.bezierCurveTo(.7,-.1,.2,-.5,0,-.6);const geo=new T.ExtrudeGeometry(sh,{depth:.13,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.08,bevelThickness:.06,curveSegments:20});const o=new T.Mesh(geo,m);o.position.set(x,y,z);o.scale.setScalar(s);p.add(o);return o}
 const legs=[];for(const s of [-1,1]){const leg=group(body,s*.27,.65,0);legs.push(leg);ell(leg,cream,0,-.13,0,.19,.36,.18);ell(leg,boot,0,-.46,.11,.245,.26,.34);ell(leg,cream,0,-.63,.12,.25,.075,.34);ell(leg,cream,0,-.29,.02,.23,.12,.23);heart(leg,0,-.43,.425,.095,gold);}
 ell(body,mint,0,1.20,0,.65,.48,.41);
 for(let i=0;i<3;i++)ell(body,mint,0,.91+i*.23,.01,.66-i*.035,.20,.43);
 // Quilted stitching over the lower coat, following its curved surface.
 const seam=mat('#86bda9',.9);for(let i=-3;i<=3;i++)for(const sign of [-1,1]){const pts=[];for(let j=0;j<=20;j++){const y=.76+j*.017,x=i*.24+sign*(y-.9);if(Math.abs(x)<.58){const z=.436*Math.sqrt(Math.max(.02,1-x*x/.44));pts.push([x,y,z]);}}if(pts.length>1)line(body,pts,.004,seam);}
 ell(body,cream,0,.705,.01,.65,.045,.42);ell(body,mint,0,.75,.01,.66,.04,.43);
 const arms=[];for(const s of [-1,1]){const a=group(body,s*.49,1.47,0);arms.push(a);a.rotation.z=s*.28;ell(a,mint,s*.08,-.18,0,.225,.32,.25);ell(a,cream,s*.13,-.4,.025,.23,.11,.25);ell(a,skin,s*.14,-.55,.065,.16,.20,.16);ell(a,skin,s*.04,-.53,.19,.065,.1,.07);}
 // Hood and individually rounded fleece beads.
 ell(body,cream,0,1.63,-.10,.63,.22,.39);
 for(let i=0;i<=28;i++){const a=i/28*Math.PI;ell(body,cream,Math.cos(a)*.56,1.62-Math.sin(a)*.17,.15+Math.sin(a)*.23,.095,.09,.09);}
 for(const s of [-1,1]){line(body,[[s*.22,1.55,.39],[s*.25,1.32,.46],[s*.29,1.12,.47]],.024,cream);ell(body,cream,s*.29,1.1,.47,.09,.095,.085);const bow=ell(body,pink,s*.115,1.49,.47,.15,.11,.055);bow.rotation.z=s*.3;const tail=ell(body,pink,s*.08,1.35,.46,.065,.14,.035);tail.rotation.z=-s*.4;}
 heart(body,0,1.49,.53,.13,gold);heart(body,0,1.49,.554,.098,cream);heart(body,.47,.92,.33,.09,cream);
 const head=group(body,0,2.27,0);
 ell(head,hair,0,.10,-.21,.91,.94,.61);
 const locks=[];for(const s of [-1,1])for(let i=0;i<3;i++){const lock=group(head,s*(.66+i*.075),-.05-i*.07,-.16-i*.11);locks.push(lock);const o=ell(lock,i%2?hair:hairLight,s*.02,-.35,0,.20,.65-i*.05,.24);o.rotation.z=-s*(.18+i*.13);ell(lock,hairLight,s*.015,-.77,.08,.20,.17,.20);}
 ell(head,skin,0,-.04,.15,.79,.65,.60);
 // Eye texture: painted radial iris on a real curved eye surface, plus physical highlights.
 const c=document.createElement('canvas');c.width=256;c.height=256;const ctx=c.getContext('2d');const gr=ctx.createRadialGradient(128,175,4,128,128,130);gr.addColorStop(0,'#cf8bdc');gr.addColorStop(.35,'#9455ac');gr.addColorStop(.7,'#48305f');gr.addColorStop(1,'#251e36');ctx.fillStyle=gr;ctx.fillRect(0,0,256,256);const iris=new T.MeshStandardMaterial({map:(()=>{const tex=new T.CanvasTexture(c);tex.encoding=T.sRGBEncoding;return tex;})(),roughness:.22});const white=new T.MeshBasicMaterial({color:'#fffaff'});
 const eyes=[];for(const s of [-1,1]){const eye=group(head,s*.32,-.045,.665);eyes.push(eye);eye.rotation.y=s*.13;ell(eye,dark,0,.035,-.025,.239,.292,.083);ell(eye,cream,0,0,0,.222,.265,.075);const pupil=ell(eye,iris,s*.012,.005,.052,.184,.244,.04);pupil.geometry=sphere.clone();const pos=pupil.geometry.attributes.position,uv=pupil.geometry.attributes.uv;for(let j=0;j<pos.count;j++)uv.setXY(j,(pos.getX(j)+1)/2,(pos.getY(j)+1)/2);uv.needsUpdate=true;ell(eye,white,-.056,.112,.104,.061,.067,.015);ell(eye,white,.074,-.105,.104,.028,.036,.012);const star=new T.Shape();for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i%2?.014:.044;const x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)star.moveTo(x,y);else star.lineTo(x,y);}star.closePath();const st=new T.Mesh(new T.ShapeGeometry(star),white);st.position.set(-.04,-.12,.116);eye.add(st);line(eye,[[s*.12,.23,0],[s*.22,.20,0],[s*.26,.24,-.015]],.022,dark);
 // Soft blush with transparency, instead of hard cheek disks.
 const cv=document.createElement('canvas');cv.width=cv.height=64;const cx=cv.getContext('2d'),g=cx.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(244,130,145,.65)');g.addColorStop(1,'rgba(244,130,145,0)');cx.fillStyle=g;cx.fillRect(0,0,64,64);const blush=new T.Mesh(new T.PlaneGeometry(.32,.19),new T.MeshBasicMaterial({map:new T.CanvasTexture(cv),transparent:true,depthWrite:false}));blush.position.set(s*.51,-.29,.674);blush.rotation.y=s*.30;head.add(blush);eye.traverse(o=>{o.castShadow=false;});}
 ell(head,skin,0,-.20,.751,.047,.038,.036);line(head,[[-.115,-.335,.718],[-.06,-.38,.741],[0,-.392,.75],[.07,-.375,.74],[.115,-.33,.718]],.018,mat('#b75250'));
 // Sculpted fringe lobes taper into rounded tips; no flat billboard hair.
 function fringe(x,index){
 const path=new T.CatmullRomCurve3([new T.Vector3(x*.55,.86,.28),new T.Vector3(x*.9,.72,.52),new T.Vector3(x,.48,.63),new T.Vector3(x+.035,.27+Math.abs(index)*.025,.58)]);
 const positions=[],indices=[],rings=24,sides=20;
 for(let j=0;j<=rings;j++){const u=j/rings,p=path.getPoint(u),width=.19*Math.pow(Math.sin(Math.PI*u),.38)+.007,depth=.105*Math.pow(Math.sin(Math.PI*u),.5)+.006;for(let k=0;k<=sides;k++){const a=k/sides*Math.PI*2;positions.push(p.x+Math.cos(a)*width,p.y,p.z+Math.sin(a)*depth);}}
 for(let j=0;j<rings;j++)for(let k=0;k<sides;k++){const a=j*(sides+1)+k,b=a+sides+1;indices.push(a,b,a+1,b,b+1,a+1);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();const mesh=new T.Mesh(geo,index%2?hair:hairLight);mesh.castShadow=true;head.add(mesh);
 }
 for(let i=-3;i<=3;i++)fringe(i*.205,i);
 const curl=[];for(let i=0;i<=24;i++){const a=1.95-i/24*3.8;curl.push([.20+Math.cos(a)*.19,.59+Math.sin(a)*.23,.735]);}line(head,curl,.052,hairLight);
 for(const s of [-1,1]){const lock=ell(head,hairLight,s*.75,.18,.25,.17,.47,.28);lock.rotation.z=-s*.23;}
 return {root,body,head,arms,legs,locks,eyes};
};
