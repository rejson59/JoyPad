/** Offline capture only. Never imported by the app. Requires Playwright + FFmpeg.
 * Run Vite first. BASE_URL, FFMPEG_PATH and optional CHROMIUM_PATH select local tools.
 * CAPTURE_SPARTICUZ=1 enables the optional sandbox Chromium package.
 * CAPTURE_SECONDS=4 shortens an excerpt; CAPTURE_FPS=30 smooths it; CAPTURE_GAME=tanks|race|orbit|snake|league|pizza records one engine.
 *
 * Full HD (1920×1080) masters: the engine canvas is rendered at native size and frames are
 * grabbed through the compositor, which stays fast for WebGL scenes where encoding the
 * canvas in page context would take seconds per frame. Nothing is upscaled afterwards.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const sandbox = process.env.CAPTURE_SPARTICUZ ? (await import('@sparticuz/chromium')).default : null;
const browser = await chromium.launch({ headless: true, executablePath: sandbox ? await sandbox.executablePath() : process.env.CHROMIUM_PATH, args: sandbox ? sandbox.args : ['--no-sandbox'] });
const base = process.env.BASE_URL || 'http://localhost:5173';
const width = 1920, height = 1080, fps = Number(process.env.CAPTURE_FPS || 24), seconds = Number(process.env.CAPTURE_SECONDS || 8), frames = fps * seconds;
try {
 const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor:1 });
 // Software rendering in CI/sandboxes can take seconds per frame; never fail a long recording early.
 page.setDefaultTimeout(Number(process.env.CAPTURE_TIMEOUT || 180000));
 await page.route('**/capture-frame', route => route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 for (const id of (process.env.CAPTURE_GAME ? [process.env.CAPTURE_GAME] : ['tanks','race','orbit','snake','league','pizza'])) {
  await page.goto(base+'/capture-frame');
  await page.evaluate(async ({ id, width, height, fps }) => {
   // Isolated canvas and manual simulation clock; no network, input or results side effects.
   document.body.innerHTML=`<div id="capture" style="width:${width}px;height:${height}px;position:relative"><canvas></canvas></div>`;
   document.body.style.margin='0'; window.requestAnimationFrame=()=>0;
   const root=document.getElementById('capture'), canvas=root.querySelector('canvas');
   const {gameAudio}=await import('/src/game/audio.ts');gameAudio.setMuted(true);
   let step;
   if(id==='tanks') {
    const {TankGame}=await import('/src/game/engine.ts');const {PLAYER_DEFS}=await import('/src/game/types.ts');
    const g=new TankGame(canvas,{players:PLAYER_DEFS.map(p=>({...p,enabled:true,isBot:true})),mapId:'desert',mode:'deathmatch',killLimit:99,lives:99,timeLimit:300,onHud(){},onKill(){},onGameOver(){}});
    g.fitCanvas();g.countdown=0;
    for(let n=0;n<180;n++)g.update(1/60,1/60);
    step=()=>{g.update(1/(fps*2),1/(fps*2));g.update(1/(fps*2),1/(fps*2));g.render(1/fps);return canvas;};
   } else if(id==='race') {
    const {NeonRushScene}=await import('/src/arcade/neon/NeonRushScene.ts');
    const g=new NeonRushScene(root,{name:'BOT',colorIdx:0,difficulty:1,quality:1,laps:4,rain:true,playerCount:1,aiCount:3,displayMode:'shared'},()=>{});
    // Reuse built-in bot driving for the camera's kart too. No fabricated player input.
    g.karts.forEach(k=>k.cfg.isPlayer=false);g.phase='race';g.phaseTime=4;g.readInput=()=>{};
    for(let n=0;n<120;n++)g.update(1/60);
    step=()=>{g.update(1/(fps*2));g.update(1/(fps*2));g.composer.render(1/fps);return g.renderer.domElement;};
   } else if(id==='snake') {
    const {SnakeRound}=await import('/src/arcade/games/Snake.ts');
    canvas.style.width=width+'px';canvas.style.height=height+'px';
    const bots=Array.from({length:4},(_,i)=>({slot:i,name:`BOT ${i+1}`,color:['#4ade80','#38bdf8','#fbbf24','#fb7185'][i],isBot:true}));
    const round=new SnakeRound(canvas,{players:bots,padInputs:[],primary:1,secondary:0,displayMode:'shared',quality:'quality',language:'en',onHud(){},onFinish(){},onFx(){}});
    // Four arena bots play each other; the real frame loop draws, so nothing is faked here.
    round.resize();round.active=true;round.countdown=0;round.timeLeft=600;round.target=999;
    // CanvasRound clamps dt to 1/25 s, so two half-steps keep the excerpt in real time.
    step=()=>{for(let k=0;k<2;k++){round.lastFrame=performance.now()-1000/(fps*2);round.frame(performance.now());}return canvas;};
    for(let n=0;n<90;n++)step();
   } else if(id==='league') {
    const {LeagueGame}=await import('/src/arcade/league-next/LeagueGame.ts');const {assignTeams}=await import('/src/arcade/league-next/bridge.ts');
    canvas.style.width=width+'px';canvas.style.height=height+'px';
    const roster=assignTeams(Array.from({length:4},(_,i)=>({slot:i,name:`BOT ${i+1}`,color:['#4ade80','#38bdf8','#fbbf24','#fb7185'][i],isBot:true})));
    const g=new LeagueGame(canvas,null,roster,{quality:1,language:'en',goalLimit:5,matchSeconds:600,readInput:()=>({x:0,y:0,boost:false}),onHud(){},onFinish(){},onFatal(error){throw error;}});
    // 2v2 of the engine's own AI on the broadcast camera; kickoff countdown skipped.
    g.setMuted(true);g.start();g.phase='play';g.countT=0;
    step=()=>{g.lastT=performance.now()-1000/fps;g.loop(performance.now());return canvas;};
    for(let n=0;n<90;n++)step();
   } else if(id==='pizza') {
    const {Game}=await import('/src/arcade/pizza/Game.ts');
    canvas.style.width=width+'px';canvas.style.height=height+'px';
    const g=new Game(canvas,null,()=>{},{quality:'balanced',language:'en',readInput:()=>({x:0,y:0,action:false,fire:false,assist:false}),onFatal(error){throw error;}});
    const deadline=Date.now()+Number(240000);
    while(!g.ready){if(Date.now()>deadline)throw Error('pizza: city assets never finished loading');await new Promise(resolve=>setTimeout(resolve,100));}
    g.setMuted(true);g.setDuration(600);g.start();
    // The courier is driven by the engine's own bot brain (`thinkBot`), not by invented pad input.
    g.players.forEach(player=>{if(player.joined)player.ai=true;});
    g.phase='play';g.countdown=0;
    // The engine clamps dt to 1/30 s, so two half-steps keep the excerpt in real time.
    step=()=>{for(let k=0;k<2;k++){g.last=performance.now()-1000/(fps*2);g.loop(performance.now());}return canvas;};
    for(let n=0;n<90;n++)step();
   } else if(id==='blockcraft') {
    const {Game}=await import('/src/arcade/blockcraft/game/engine.ts');
    const g=new Game(root,{seed:7,mode:'creative',renderDistance:3,worldType:'flat',worldName:'JoyPad'},{onHud(){},onUI(){}});
    // Scenariusz: spacer po płaskim świecie z serią stawianych bloków co sekundę i
    // łagodnymi skrętami — silnik sam prowadzi symulację, my wołamy jego pętlę
    // krok po kroku (rAF jest w capture wyłączony), jak przy pozostałych grach.
    g.keys.add('KeyW');
    let frame=0;
    step=()=>{
      if(frame%90===0){g.keys.delete('KeyW');g.keys.add('KeyD');}
      if(frame%90===30){g.keys.delete('KeyD');g.keys.add('KeyW');}
      g.mouseRight=frame%60<12;
      frame++;
      g.loop(performance.now());
      return g.renderer.domElement;
    };
    for(let n=0;n<90;n++)step();
   } else {
    const {Game}=await import('/src/arcade/starclash/Game.ts');const g=new Game(root,{lowFx:false});g.padMode=true;
    g.startBattleSquad([{cls:'fighter',up:null,name:'BOT'}],{enemies:6,allyBots:3,difficulty:1});
    g.ships.forEach(s=>s.isPlayer=false);g.readCtrl=()=>({x:0,y:0,fire:false,boost:false});g.humanShips=[];g.updatePlayer=()=>{};
    // Both teams start closer together so this eight-second excerpt contains contact.
    g.ships.forEach(s=>s.group.position.z*=.3);
    step=()=>{g.last=performance.now()-1000/fps;g.loop();return g.renderer.domElement;};
    for(let n=0;n<36;n++)step();
   }
   // Advance and draw exactly one frame; the screenshot below grabs this canvas 1:1.
   window.captureStep=()=>{const source=step();if(source.width!==width||source.height!==height)throw Error(`Capture must be native Full HD (${width}×${height}), got ${source.width}×${source.height}`);};
  },{ id, width, height, fps });
  const dir=`.cache/preview-frames/${id}`;await mkdir(dir,{recursive:true});
  const started=Date.now();
  for(let n=0;n<frames;n++){
   await page.evaluate(()=>window.captureStep());
   const frame=await page.screenshot({type:'jpeg',quality:96,clip:{x:0,y:0,width,height}});
   await writeFile(`${dir}/${String(n).padStart(4,'0')}.jpg`,frame);
   if(n===0||(n+1)%fps===0)console.log(`${id} ${n+1}/${frames} frames · ${((Date.now()-started)/1000).toFixed(0)}s`);
  }
  await mkdir('public/previews',{recursive:true});
  // H.264 CRF 21 with a 5 Mbit ceiling keeps neon and rain detail without a 50 MB clip;
  // VP9 (the fallback for browsers without H.264) runs at CRF 33 with a 3.2 Mbit ceiling.
  const result=spawnSync(process.env.FFMPEG_PATH||'ffmpeg',['-y','-framerate',String(fps),'-i',`${dir}/%04d.jpg`,'-an','-c:v','libx264','-preset','slow','-crf','21','-maxrate','5M','-bufsize','10M','-profile:v','high','-pix_fmt','yuv420p','-movflags','+faststart',`public/previews/${id}.mp4`],{encoding:'utf8'});
  if(result.status!==0)throw Error(result.stderr||String(result.error));
  const webm=spawnSync(process.env.FFMPEG_PATH||'ffmpeg',['-y','-framerate',String(fps),'-i',`${dir}/%04d.jpg`,'-an','-c:v','libvpx-vp9','-crf','33','-b:v','2.4M','-maxrate','3.2M','-bufsize','6.4M','-row-mt','1','-cpu-used','4','-threads','2',`public/previews/${id}.webm`],{encoding:'utf8'});
  if(webm.status!==0)throw Error(webm.stderr||String(webm.error));
  console.log('Captured',id,`${width}×${height}`,frames,'frames');
 }
}finally{await browser.close();}
