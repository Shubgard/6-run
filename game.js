(() => {
  'use strict';
  // An original, fictional South-Florida-inspired region—not a recreation of a commercial game's map.
  const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
  const mapCanvas=document.getElementById('map'),mapCtx=mapCanvas.getContext('2d');
  const $=id=>document.getElementById(id);
  const weapons=[
    {name:'Trailblazer',type:'SIDEARM',mag:12,reserve:84,rate:300,speed:900,pellets:1,spread:.035,color:'#f2d89b'},
    {name:'Ranger 9',type:'SUBMACHINE GUN',mag:30,reserve:180,rate:105,speed:820,pellets:1,spread:.09,color:'#e9cd83'},
    {name:'Longshot',type:'RIFLE',mag:8,reserve:48,rate:670,speed:1300,pellets:1,spread:.012,color:'#b9d1e1'},
    {name:'Scatter',type:'SHOTGUN',mag:6,reserve:36,rate:750,speed:680,pellets:7,spread:.32,color:'#f1b18a'}
  ];
  const player={x:0,y:0,angle:0,hp:100,stamina:100,speed:190};
  let W=innerWidth,H=innerHeight,dpr=1,camera={x:0,y:0},keys={},mouse={x:innerWidth/2,y:innerHeight/2,down:false};
  let selected=0,shots=[],lastShot=0,paused=false,wheelOpen=false,raytracing=true,lightLevel=.78,last=performance.now(),explored=false,toastTimer=0,expandedMap=false;
  let seed=81203;function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
  const objects=[];
  // A deliberately authored-feeling starting district, followed by procedural neighborhoods and wetlands.
  function add(type,x,y,extra={}){objects.push({type,x,y,...extra})}
  // The starting neighborhood: small shops, homes, yards, and a palm-lined boulevard.
  add('landmark',-70,-120,{w:112,h:75,name:'PALMETTO MOTEL',color:'#bd8b69'});
  add('landmark',150,-120,{w:88,h:62,name:'SUNSET MARKET',color:'#d2b77d'});
  add('landmark',210,130,{w:125,h:78,name:'LITTLE HAVANA CAFE',color:'#c77b5c'});
  add('landmark',-165,145,{w:84,h:68,name:'CORAL COURT',color:'#d5b98b'});
  for(let x=-480;x<=480;x+=110){add('palm',x,-290,{r:13});add('palm',x,290,{r:13})}
  for(let y=-480;y<=480;y+=110){add('palm',-450,y,{r:13});add('palm',450,y,{r:13})}
  // Urban blocks: buildings are kept between a street grid, with little parks and parking lots.
  for(let gx=-8;gx<=8;gx++)for(let gy=-8;gy<=8;gy++){
    const cx=gx*250+(rand()-.5)*24,cy=gy*235+(rand()-.5)*22;
    if(Math.hypot(cx,cy)<510)continue;
    if(cx>1300&&cy<500&&cy>-1400)continue; // open water beyond the eastern bay
    if(cy>1250+cx*.12)continue; // beach / coastal edge
    if(cx< -1750&&rand()<.48)continue; // wetlands become less developed
    if(rand()<.15){add('park',cx,cy,{w:105+rand()*55,h:80+rand()*45});for(let i=0;i<5;i++)add('palm',cx+(rand()-.5)*85,cy+(rand()-.5)*65,{r:10+rand()*5});continue}
    const count=1+(rand()>.52?1:0);
    for(let n=0;n<count;n++){
      const x=cx+(n? (rand()-.5)*55:0),y=cy+(n? (rand()-.5)*55:0);
      const downtown=cx>350&&cx<1450&&cy<350&&cy>-1450;
      add('building',x,y,{w:(downtown?48:54)+rand()*(downtown?45:42),h:(downtown?52:45)+rand()*(downtown?45:42),tone:Math.floor(rand()*5),style:downtown?'tower':'low'});
    }
    if(rand()<.68){add('palm',cx-75,cy+55,{r:9+rand()*4});add('palm',cx+75,cy-50,{r:9+rand()*4})}
  }
  // Long causeway, beach promenade, and a few small islands to give the coast a readable silhouette.
  for(let x=-500;x<1450;x+=130)add('palm',x,1150+Math.sin(x/260)*75,{r:12});
  for(let i=0;i<42;i++){let x=1600+rand()*650,y=-1500+rand()*2500;add('palm',x,y,{r:10+rand()*6})}
  // Everglades edge: cypress hammocks, reeds, and water pockets west of the city.
  for(let i=0;i<280;i++){let x=-1900-rand()*2100,y=-2200+rand()*4400;if(rand()<.56)add('cypress',x,y,{r:12+rand()*15});else add('reed',x,y,{r:8+rand()*13})}
  for(let i=0;i<85;i++){let x=-2100-rand()*1850,y=-2100+rand()*4200;add('pond',x,y,{w:45+rand()*130,h:25+rand()*90})}
  function resize(){dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;canvas.width=Math.floor(W*dpr);canvas.height=Math.floor(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);camera.x=W/2-player.x;camera.y=H/2-player.y}
  addEventListener('resize',resize);resize();
  const near=()=>objects.filter(o=>Math.abs(o.x-player.x)<700&&Math.abs(o.y-player.y)<700);
  function path(points){ctx.beginPath();ctx.moveTo(points[0][0]+camera.x,points[0][1]+camera.y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0]+camera.x,points[i][1]+camera.y)}
  function road(x1,y1,x2,y2,width,color='#56554a'){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='butt';ctx.beginPath();ctx.moveTo(x1+camera.x,y1+camera.y);ctx.lineTo(x2+camera.x,y2+camera.y);ctx.stroke();ctx.strokeStyle='rgba(231,213,159,.28)';ctx.lineWidth=1;ctx.setLineDash([12,12]);ctx.stroke();ctx.setLineDash([])}
  function drawWorld(){
    ctx.fillStyle='#84946c';ctx.fillRect(0,0,W,H);
    const left=player.x-W/2,top=player.y-H/2;
    // Subtly textured tropical land, with a large bay to the east and warm Atlantic shoreline to the south.
    for(let x=Math.floor(left/110)*110;x<left+W+110;x+=110)for(let y=Math.floor(top/110)*110;y<top+H+110;y+=110){let n=Math.sin(x*.017+y*.013)*.5+.5;ctx.fillStyle=n>.76?'rgba(214,190,126,.13)':n<.19?'rgba(27,65,46,.13)':'rgba(139,157,103,.13)';ctx.fillRect(x+camera.x,y+camera.y,110,110)}
    // Bay and Atlantic water shapes.
    ctx.fillStyle='#537f83';ctx.beginPath();ctx.moveTo(1320+camera.x,-2400+camera.y);ctx.lineTo(4600+camera.x,-2400+camera.y);ctx.lineTo(4600+camera.x,2600+camera.y);ctx.lineTo(2030+camera.x,2600+camera.y);ctx.lineTo(1820+camera.x,1700+camera.y);ctx.lineTo(1680+camera.x,800+camera.y);ctx.lineTo(1510+camera.x,300+camera.y);ctx.closePath();ctx.fill();
    ctx.fillStyle='#567f7c';ctx.beginPath();ctx.moveTo(-4600+camera.x,2550+camera.y);ctx.lineTo(4600+camera.x,2550+camera.y);ctx.lineTo(4600+camera.x,4600+camera.y);ctx.lineTo(-4600+camera.x,4600+camera.y);ctx.closePath();ctx.fill();
    // Mangrove wetland water to the west.
    ctx.fillStyle='rgba(49,101,82,.6)';ctx.beginPath();ctx.moveTo(-4600+camera.x,-2400+camera.y);ctx.lineTo(-2550+camera.x,-2400+camera.y);ctx.lineTo(-2270+camera.x,-1500+camera.y);ctx.lineTo(-2500+camera.x,-580+camera.y);ctx.lineTo(-2250+camera.x,300+camera.y);ctx.lineTo(-2620+camera.x,1200+camera.y);ctx.lineTo(-2400+camera.x,2550+camera.y);ctx.lineTo(-4600+camera.x,2550+camera.y);ctx.closePath();ctx.fill();
    // Coastal sand strip.
    ctx.fillStyle='#cbb88a';ctx.beginPath();ctx.moveTo(-1200+camera.x,1210+camera.y);ctx.quadraticCurveTo(100+camera.x,1000+camera.y,1420+camera.x,1190+camera.y);ctx.lineTo(1880+camera.x,1640+camera.y);ctx.lineTo(1700+camera.x,1850+camera.y);ctx.quadraticCurveTo(200+camera.x,1380+camera.y,-1050+camera.x,1510+camera.y);ctx.closePath();ctx.fill();
    // Road grid, with a broad diagonal coastal highway.
    for(let x=-2200;x<1800;x+=250)road(x,-2400,x,2700,19);
    for(let y=-2100;y<1800;y+=235)road(-2800,y,2100,y,18);
    road(-2300,800,1540,-1150,38,'#4b4d43');road(-2300,800,1540,-1150,2,'#d1b768');
    // Coastal causeway and bridge to the barrier island.
    road(-600,1390,2050,1510,32,'#57574a');
    // Water shimmer.
    ctx.save();ctx.strokeStyle='rgba(205,228,207,.18)';ctx.lineWidth=2;for(let i=0;i<22;i++){let x=1500+((i*149)%700),y=-1300+i*116;ctx.beginPath();ctx.moveTo(x+camera.x,y+camera.y);ctx.lineTo(x+55+camera.x,y+camera.y);ctx.stroke()}ctx.restore();
    for(const o of near())drawObject(o);
  }
  function drawObject(o){const x=o.x+camera.x,y=o.y+camera.y;if(x<-100||y<-100||x>W+100||y>H+100)return;
    if(o.type==='pond'){ctx.fillStyle='rgba(50,103,87,.82)';ctx.beginPath();ctx.ellipse(x,y,o.w,o.h,-.25,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(190,205,157,.22)';ctx.stroke();return}
    if(o.type==='reed'){ctx.fillStyle='rgba(38,76,49,.55)';ctx.beginPath();ctx.ellipse(x,y,o.r,o.r*.65,0,0,Math.PI*2);ctx.fill();return}
    if(o.type==='palm'||o.type==='cypress'){let r=o.r;ctx.fillStyle='rgba(20,33,23,.25)';ctx.beginPath();ctx.ellipse(x+5,y+8,r*1.25,r*.65,0,0,7);ctx.fill();ctx.fillStyle=o.type==='palm'?'#66533a':'#344b35';ctx.beginPath();ctx.ellipse(x,y+3,r*.2,r*.65,.2,0,7);ctx.fill();ctx.fillStyle=o.type==='palm'?'#31583d':'#3e5b3e';ctx.beginPath();ctx.arc(x,y-r*.25,r,0,7);ctx.fill();ctx.fillStyle='rgba(128,157,82,.48)';ctx.beginPath();ctx.arc(x-r*.25,y-r*.38,r*.57,0,7);ctx.fill();if(o.type==='palm'){ctx.strokeStyle='#557d4b';ctx.lineWidth=2;for(let i=0;i<7;i++){let a=i*Math.PI/3.5;ctx.beginPath();ctx.moveTo(x,y-r*.2);ctx.quadraticCurveTo(x+Math.cos(a)*r*.55,y-r*.6+Math.sin(a)*r*.4,x+Math.cos(a)*r*1.4,y-r*.25+Math.sin(a)*r*.8);ctx.stroke()}}return}
    if(o.type==='park'){ctx.fillStyle='#657c52';ctx.fillRect(x-o.w/2,y-o.h/2,o.w,o.h);ctx.strokeStyle='rgba(210,205,164,.35)';ctx.strokeRect(x-o.w/2,y-o.h/2,o.w,o.h);return}
    let w=o.w,h=o.h;
    if(o.type==='landmark'||o.type==='building'){
      ctx.fillStyle='rgba(22,28,21,.27)';ctx.fillRect(x-w/2+6,y-h/2+8,w,h);
      const palette=o.type==='landmark'?o.color:['#b8aa87','#c1b596','#9f9b82','#d0b38d','#a9ae9a'];ctx.fillStyle=palette;ctx.fillRect(x-w/2,y-h/2,w,h);
      ctx.fillStyle=o.type==='landmark'?'#765f4b':(o.style==='tower'?'#677878':'#897d67');ctx.fillRect(x-w/2-3,y-h/2-4,w+6,7);
      if(o.style==='tower'){ctx.fillStyle='rgba(101,164,166,.55)';for(let wx=x-w/2+8;wx<x+w/2-4;wx+=13)for(let wy=y-h/2+14;wy<y+h/2-5;wy+=14)ctx.fillRect(wx,wy,5,7)}else{ctx.fillStyle='rgba(62,77,64,.72)';for(let wx=x-w/2+9;wx<x+w/2-4;wx+=17)ctx.fillRect(wx,y-h/2+13,7,9);ctx.fillStyle='rgba(53,57,44,.65)';ctx.fillRect(x-5,y+h/2-16,10,16)}
      if(o.type==='landmark'){ctx.fillStyle='#f0da9a';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText(o.name,x,y-h/2-9)}
      ctx.strokeStyle='rgba(44,48,37,.35)';ctx.strokeRect(x-w/2,y-h/2,w,h);
    }
  }
  function rayHit(ox,oy,dx,dy,o){let x=o.x,y=o.y;if(['palm','cypress','reed','pond'].includes(o.type)){let r=o.r||o.w*.5,rx=ox-x,ry=oy-y,b=rx*dx+ry*dy,c=rx*rx+ry*ry-r*r,d=b*b-c;if(d<0)return Infinity;let t=-b-Math.sqrt(d);return t>1?t:Infinity}let minX=x-o.w/2,maxX=x+o.w/2,minY=y-o.h/2,maxY=y+o.h/2,t1=(minX-ox)/dx,t2=(maxX-ox)/dx,t3=(minY-oy)/dy,t4=(maxY-oy)/dy,a=Math.max(Math.min(t1,t2),Math.min(t3,t4)),b=Math.min(Math.max(t1,t2),Math.max(t3,t4));return b>=Math.max(a,0)&&a>1?a:Infinity}
  function lightAndShadows(){if(!raytracing)return;const list=near().filter(o=>['building','landmark','palm','cypress'].includes(o.type)&&Math.hypot(o.x-player.x,o.y-player.y)<520),radius=600,ox=W/2,oy=H/2,rays=[];for(let i=0;i<300;i++)rays.push(i/300*Math.PI*2);for(const o of list){let a=Math.atan2(o.y-player.y,o.x-player.x);rays.push(a);for(const dx of [-1,1])for(const dy of [-1,1]){let ax=Math.atan2(o.y+dy*(o.h||o.r)-player.y,o.x+dx*(o.w||o.r)-player.x);rays.push(ax-.012,ax,ax+.012)}}let pts=[];for(const a of rays){let dx=Math.cos(a),dy=Math.sin(a),dist=radius;for(const o of list){let t=rayHit(player.x,player.y,dx,dy,o);if(t<dist)dist=t}pts.push([ox+dx*dist,oy+dy*dist])}ctx.save();ctx.fillStyle=`rgba(5,9,7,${1-lightLevel*.34})`;ctx.fillRect(0,0,W,H);ctx.globalCompositeOperation='destination-out';let g=ctx.createRadialGradient(ox,oy,20,ox,oy,radius);g.addColorStop(0,'rgba(0,0,0,.96)');g.addColorStop(.72,'rgba(0,0,0,.78)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(ox,oy);for(const p of pts)ctx.lineTo(...p);ctx.closePath();ctx.fill();ctx.restore()}
  function drawPlayer(){ctx.save();ctx.translate(W/2,H/2);ctx.rotate(player.angle);ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(2,7,17,9,0,0,7);ctx.fill();ctx.fillStyle='#c1bd9f';ctx.beginPath();ctx.ellipse(0,0,11,14,0,0,7);ctx.fill();ctx.fillStyle='#4b5c3a';ctx.beginPath();ctx.ellipse(0,2,8,10,0,0,7);ctx.fill();ctx.fillStyle='#d2c8a9';ctx.beginPath();ctx.arc(0,-8,5.5,0,7);ctx.fill();ctx.fillStyle='#393d30';ctx.fillRect(5,-3,19,5);ctx.fillStyle=weapons[selected].color;ctx.fillRect(21,-2,3,2);ctx.restore()}
  function drawShots(dt){for(let i=shots.length-1;i>=0;i--){let s=shots[i];s.life-=dt;s.x+=s.dx*dt;s.y+=s.dy*dt;ctx.strokeStyle=s.color;ctx.globalAlpha=Math.max(0,s.life/.12);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(s.px+camera.x,s.py+camera.y);ctx.lineTo(s.x+camera.x,s.y+camera.y);ctx.stroke();ctx.globalAlpha=1;s.px=s.x;s.py=s.y;if(s.life<=0)shots.splice(i,1)}}
  function drawMap(){let w=mapCanvas.width,h=mapCanvas.height,s=.075;mapCtx.fillStyle='#426b64';mapCtx.fillRect(0,0,w,h);mapCtx.fillStyle='#b9aa7d';mapCtx.fillRect(0,h*.79,w,h*.21);mapCtx.fillStyle='#76885f';mapCtx.fillRect(0,0,w,h*.79);mapCtx.fillStyle='#4c776f';mapCtx.fillRect(w*.84,0,w*.16,h*.79);mapCtx.fillStyle='#476b4d';mapCtx.fillRect(0,0,w*.18,h*.79);for(let x=0;x<w;x+=20){mapCtx.fillStyle='rgba(67,66,55,.75)';mapCtx.fillRect(x,0,2,h*.78)}for(let y=0;y<h*.8;y+=19){mapCtx.fillStyle='rgba(67,66,55,.75)';mapCtx.fillRect(0,y,w*.84,2)}for(const o of objects){let x=w/2+(o.x-player.x)*s,y=h/2+(o.y-player.y)*s;if(x<0||y<0||x>w||y>h)continue;if(['building','landmark'].includes(o.type)){mapCtx.fillStyle=o.type==='landmark'?'#e7c786':'#9a9b83';mapCtx.fillRect(x-2,y-2,4,4)}else if(o.type==='pond'){mapCtx.fillStyle='#3f7770';mapCtx.fillRect(x-3,y-2,6,4)}}mapCtx.fillStyle='#f0e9ce';mapCtx.beginPath();mapCtx.arc(w/2,h/2,4,0,7);mapCtx.fill();mapCtx.fillStyle='#d4e08b';mapCtx.beginPath();mapCtx.moveTo(w/2,h/2-10);mapCtx.lineTo(w/2-4,h/2+2);mapCtx.lineTo(w/2+4,h/2+2);mapCtx.fill();mapCtx.strokeStyle='rgba(230,235,220,.2)';mapCtx.strokeRect(0,0,w,h)}
  function updateHud(){const sx=Math.floor(player.x/500),sy=Math.floor(player.y/500);$('coords').textContent=`SECTOR ${String(Math.abs(sx)).padStart(2,'0')}, ${String(Math.abs(sy)).padStart(2,'0')}`;const dirs=['N','NE','E','SE','S','SW','W','NW'];$('heading').textContent=`${dirs[Math.round(((player.angle+Math.PI/2+Math.PI*2)%(Math.PI*2))/(Math.PI/4))%8]} · ${String(Math.round((player.angle*180/Math.PI+360)%360)).padStart(3,'0')}°`;$('health').style.width=player.hp+'%';$('health-value').textContent=`${Math.round(player.hp)} / 100`;$('stamina').style.width=player.stamina+'%';$('stamina-value').textContent=`${Math.round(player.stamina)} / 100`;$('ammo-current').textContent=weapons[selected].mag;$('ammo-reserve').textContent=weapons[selected].reserve;$('weapon-name').textContent=weapons[selected].name;$('weapon-type').textContent=weapons[selected].type;document.querySelectorAll('.slot').forEach((el,i)=>el.classList.toggle('active',i===selected));drawMap()}
  function showToast(text){const t=$('interaction');t.innerHTML='<span>◎</span> '+text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2500)}
  function shoot(){const gun=weapons[selected],now=performance.now();if(now-lastShot<gun.rate||gun.mag<=0){if(gun.mag<=0&&gun.reserve>0)reload();return}lastShot=now;gun.mag--;for(let i=0;i<gun.pellets;i++){let a=player.angle+(Math.random()-.5)*gun.spread;shots.push({x:player.x+Math.cos(a)*20,y:player.y+Math.sin(a)*20,px:player.x+Math.cos(a)*15,py:player.y+Math.sin(a)*15,dx:Math.cos(a)*gun.speed,dy:Math.sin(a)*gun.speed,life:.13,color:gun.color})}updateHud()}
  function reload(){let gun=weapons[selected],capacity=[12,30,8,6][selected];if(gun.reserve<=0||gun.mag===capacity)return;let n=Math.min(capacity-gun.mag,gun.reserve);gun.mag+=n;gun.reserve-=n;updateHud();showToast('Magazine reloaded')}
  function selectWeapon(i){selected=(i+weapons.length)%weapons.length;document.querySelectorAll('.wheel-choice').forEach((b,j)=>b.classList.toggle('selected',i===j));updateHud()}
  function openWheel(){wheelOpen=true;$('weapon-wheel').classList.add('open');$('weapon-wheel').setAttribute('aria-hidden','false');selectWeapon(selected)}function closeWheel(){wheelOpen=false;$('weapon-wheel').classList.remove('open');$('weapon-wheel').setAttribute('aria-hidden','true')}
  function togglePause(){if(wheelOpen)closeWheel();paused=!paused;$('pause-screen').classList.toggle('open',paused);$('pause-screen').setAttribute('aria-hidden',String(!paused))}
  function region(){let d=Math.hypot(player.x,player.y);if(player.x< -1700)return 'The Cypress Marsh';if(player.y>950)return 'Sundown Beach';if(player.x>350&&player.y< -250)return 'Glasswater District';if(d>1000)return 'Palmline County';return 'Little Palmetto'}
  function frame(now){let dt=Math.min(.04,(now-last)/1000);last=now;if(!paused){let dx=(keys.KeyD?1:0)-(keys.KeyA?1:0),dy=(keys.KeyS?1:0)-(keys.KeyW?1:0);if(touchMove.active){dx+=touchMove.x;dy+=touchMove.y}let len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len}let sprint=(keys.ShiftLeft||keys.ShiftRight||touchMove.sprint)&&player.stamina>0;if(sprint&&len)player.stamina=Math.max(0,player.stamina-27*dt);else player.stamina=Math.min(100,player.stamina+16*dt);let speed=player.speed*(sprint?1.55:1);player.x+=dx*speed*dt;player.y+=dy*speed*dt;player.x=Math.max(-3800,Math.min(3800,player.x));player.y=Math.max(-3800,Math.min(3800,player.y));camera.x=W/2-player.x;camera.y=H/2-player.y;player.angle=Math.atan2(mouse.y-H/2,mouse.x-W/2);if(mouse.down&&!wheelOpen)shoot();drawWorld();drawShots(dt);lightAndShadows();drawPlayer();if(!explored&&Math.hypot(player.x,player.y)>160){explored=true;$('questText').textContent='Explore Sundown Coast';$('objective-distance').textContent='Find your way along the coast';showToast('Welcome to Sundown Coast')}$('region-name').textContent=region();updateHud()}requestAnimationFrame(frame)}requestAnimationFrame(frame);
  addEventListener('keydown',e=>{keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='KeyQ'&&!wheelOpen&&!paused)openWheel();if(e.code==='Escape')togglePause();if(e.code==='Digit1')selectWeapon(0);if(e.code==='Digit2')selectWeapon(1);if(e.code==='Digit3')selectWeapon(2);if(e.code==='Digit4')selectWeapon(3);if(e.code==='KeyR')reload();if(e.code==='KeyF')showToast('Nothing nearby to interact with')});addEventListener('keyup',e=>{keys[e.code]=false;if(e.code==='KeyQ')closeWheel()});
  canvas.addEventListener('pointermove',e=>{mouse.x=e.clientX;mouse.y=e.clientY;if(wheelOpen){const x=e.clientX-W/2,y=e.clientY-H/2;if(Math.hypot(x,y)>38){let a=(Math.atan2(y,x)+Math.PI/2+Math.PI*2)%(Math.PI*2);selectWeapon(Math.floor((a+Math.PI/4)/(Math.PI/2))%4)}}});canvas.addEventListener('pointerdown',e=>{if(e.button===0){mouse.down=true;canvas.setPointerCapture?.(e.pointerId)}});addEventListener('pointerup',()=>mouse.down=false);canvas.addEventListener('contextmenu',e=>e.preventDefault());
  document.querySelectorAll('.wheel-choice').forEach(b=>b.addEventListener('click',()=>{selectWeapon(+b.dataset.weapon);closeWheel()}));document.querySelectorAll('.slot').forEach(b=>b.addEventListener('click',()=>selectWeapon(+b.dataset.weapon)));$('weapon-button').onclick=()=>wheelOpen?closeWheel():openWheel();$('pause-button').onclick=togglePause;$('resume-button').onclick=togglePause;$('ray-toggle').onclick=()=>{raytracing=!raytracing;$('ray-toggle').classList.toggle('on',raytracing);$('ray-toggle').setAttribute('aria-pressed',String(raytracing))};$('light-slider').oninput=e=>lightLevel=+e.target.value/100;$('map-expand').onclick=()=>{expandedMap=!expandedMap;mapCanvas.style.transform=expandedMap?'scale(1.35)':'scale(1)';mapCanvas.style.transformOrigin='top right';mapCanvas.style.zIndex=expandedMap?'3':'auto'};
  const touchMove={active:false,x:0,y:0,sprint:false};const stick=$('stick'),knob=$('knob');stick.addEventListener('pointerdown',e=>{touchMove.active=true;stick.setPointerCapture(e.pointerId)});stick.addEventListener('pointermove',e=>{if(!touchMove.active)return;let r=stick.getBoundingClientRect(),x=e.clientX-(r.left+r.width/2),y=e.clientY-(r.top+r.height/2),d=Math.hypot(x,y),m=32;if(d>m){x=x/d*m;y=y/d*m}touchMove.x=x/m;touchMove.y=y/m;knob.style.transform=`translate(${x}px,${y}px)`});const stopStick=()=>{touchMove.active=false;touchMove.x=touchMove.y=0;knob.style.transform=''};stick.addEventListener('pointerup',stopStick);stick.addEventListener('pointercancel',stopStick);$('sprint').addEventListener('pointerdown',()=>touchMove.sprint=true);$('sprint').addEventListener('pointerup',()=>touchMove.sprint=false);$('sprint').addEventListener('pointercancel',()=>touchMove.sprint=false);$('fire-button').addEventListener('pointerdown',e=>{e.preventDefault();mouse.down=true});$('fire-button').addEventListener('pointerup',()=>mouse.down=false);$('mobile-weapon').onclick=()=>wheelOpen?closeWheel():openWheel();
  $('objective-distance').textContent='A neighborhood by the water';$('questText').textContent='Explore Sundown Coast';$('region-name').textContent='Little Palmetto';updateHud();
})();
