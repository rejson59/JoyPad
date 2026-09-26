/** Offline capture only. Never imported by the app. Requires Playwright + FFmpeg.
 * Run Vite first. BASE_URL, FFMPEG_PATH and optional CHROMIUM_PATH select local tools.
 * CAPTURE_SPARTICUZ=1 enables the optional sandbox Chromium package.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const sandbox = process.env.CAPTURE_SPARTICUZ ? (await import('@sparticuz/chromium')).default : null;
const browser = await chromium.launch({ headless: true, executablePath: sandbox ? await sandbox.executablePath() : process.env.CHROMIUM_PATH, args: sandbox ? sandbox.args : ['--no-sandbox'] });
const base = process.env.BASE_URL || 'http://localhost:5173';
const width = 1920, height = 1080, fps = 30, frames = fps * 8;
const suffix = '-1080';
try {
 const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor:1 });
 await page.route('**/capture-frame', route => route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 for (const id of (process.env.CAPTURE_GAME ? [process.env.CAPTURE_GAME] : ['tanks','race','orbit'])) {
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
   } else {
    const {Game}=await import('/src/arcade/starclash/Game.ts');const g=new Game(root,{lowFx:false});g.padMode=true;
    g.startBattleSquad([{cls:'fighter',up:null,name:'BOT'}],{enemies:6,allyBots:3,difficulty:1});
    g.ships.forEach(s=>s.isPlayer=false);g.readCtrl=()=>({x:0,y:0,fire:false,boost:false});g.humanShips=[];g.updatePlayer=()=>{};
    // Both teams start closer together so this eight-second excerpt contains contact.
    g.ships.forEach(s=>s.group.position.z*=.3);
    step=()=>{g.last=performance.now()-1000/fps;g.loop();return g.renderer.domElement;};
    for(let n=0;n<36;n++)step();
   }
   const output=document.createElement('canvas');output.width=width;output.height=height;const ctx=output.getContext('2d');
   window.captureFrame=()=>{const source=step();if(source.width < width || source.height < height) throw Error('Capture must be native Full HD, not an upscale');ctx.drawImage(source,0,0,width,height);return output.toDataURL('image/png').split(',')[1];};
  },{ id, width, height, fps });
  const dir=`.cache/preview-frames/${id}${suffix}`;await mkdir(dir,{recursive:true});
  for(let n=0;n<frames;n++){const data=await page.evaluate(()=>window.captureFrame());await writeFile(`${dir}/${String(n).padStart(4,'0')}.png`,Buffer.from(data,'base64'));if(n%48===0)console.log(id,n);}
  await mkdir('public/previews',{recursive:true});
  const result=spawnSync(process.env.FFMPEG_PATH||'ffmpeg',['-y','-framerate',String(fps),'-i',`${dir}/%04d.png`,'-an','-c:v','libx264','-preset','slow','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',`public/previews/${id}${suffix}.mp4`],{encoding:'utf8'});
  if(result.status!==0)throw Error(result.stderr||String(result.error));
  const webm=spawnSync(process.env.FFMPEG_PATH||'ffmpeg',['-y','-framerate',String(fps),'-i',`${dir}/%04d.png`,'-an','-c:v','libvpx-vp9','-b:v','0','-crf','30','-row-mt','1','-cpu-used','4','-threads','2',`public/previews/${id}${suffix}.webm`],{encoding:'utf8'});
  if(webm.status!==0)throw Error(webm.stderr||String(webm.error));
  console.log('Captured',id);
 }
}finally{await browser.close();}
