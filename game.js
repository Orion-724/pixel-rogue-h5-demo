const CONFIG = {
  critMultiplier: 2,
  canvas: { width: 1280, height: 720 },
  player: { maxHp: 100, speed: 150, baseDamage: 5, attackInterval: 0.7, hitInterval: 0.8, radius: 12 },
  enemy: { mobHp: 20, mobSpeed: 45, mobDamage: 5, eliteHp: 60, eliteSpeed: 35, eliteDamage: 8, eliteScale: 1.5 },
  boss: { hp: 2000, speed: 30, damage: 12, skillInterval: 6, summonGroupCount: 3, summonPerUse: 4, fanShots:12, fanDamage:8, fanAngle:1.2, fanRange:420, ramDamage:20 },
  resonance: { fireAttackPercent: 0.15, windSpeedPercent: 0.10, iceCritPercent: 0.08 },
  defaultParts: { triggerInterval: 1.5, projectileDamage: 5 },
  waves: { 1: { mobs: 8 }, 2: { mobs: 12 }, 3: { mobs: 16 }, 4: { elites: 2, mobs: 10 }, 5: { elites: 3, mobs: 12 }, 6: { elites: 4, mobs: 14 }, 7: { mobs: 30, batches: 3, batchInterval: 5 }, 8: { boss: 1 } },
  waveBatches: { earlyIntervalFraction: 0.5, clearPause: 2 },
  special: { overflowMultiplier: 0.5, sharedBurdenInterval: 5, sharedBurdenBatch: 3, sharedBurdenCap: 8, sharedBurdenDeathDamage: 25 },
  combat: { left: 24, right: 1256, top: 90, bottom: 500, mobRadius: 12, separationPasses: 2, spawnMargin: 40, contactRadius: 24, hitFlash: 0.12, critMultiplier: 1.5 },
  weapon: { spikeRange: 120, windPull: 40, iceSlow: 0.4, iceSlowDuration: 3, areaTick: 0.25, flameDuration: 2, flameRadius: 110 },
  projectile: { speed: 360, radius: 5, life: 2 },
  choice: { elementCardProbability: 0.4 },
  fire: { heatMax:100, heatPerSecond:20, heatThreshold:50, heatBonusPerPoint:0.02, angle:120, range:180, baseDamage:25, effectDuration:0.25 },
  water: { triggerStructure: { lostHpPercent:15 } }, // TODO(sol): 水元素触发结构占位，本版不实现
  events: { maxPerFrame: 64, minTriggerInterval: 0.05, maxChainDepth: 4 },
  debug: { enabled: false }
};
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const game = { screen:'menu', wave:1, player:{}, enemies:[], projectiles:[], effects:[], damageNumbers:[], screenShakeTimer:0, areas:[], zones:[], pendingReturns:[], slots:[], resonanceTotals:{fire:0,wind:0,ice:0}, keys:{}, time:0, last:0, fps:0, debugConfig:{startWave:1,carrySharedBurden:false,carryOverflow:false,testGrantWave:1,testItemIds:[],testStartCounts:{}}, movementHistory:[], selectedEndpoint:null, touch:{movePointer:null,firePointer:null,direction:{x:0,y:0}}, touchTap:null, assemblyGesture:null, triggerQueue:[], currentTriggerDepth:0, triggerProcessing:false, droppedTriggerEvents:0, droppedPerFrame:0, droppedDepth:0, waveDropBaseline:{total:0,perFrame:0,depth:0}, waveBatchState:null };
const ART_CONFIG = Object.freeze({
  root: 'assets/h5-art-v1/',
  loadTimeoutMs: 8000,
  groundAlpha: 0.04,
  mobOutlineNormal: '#8D3348',
  eliteOutlineNormal: '#A14358',
  outlineCritical: '#FF5267',
  lowHealthRatio: 0.2,
  healthSteps: 15,
  dimFactor: 0.62
});
const ART_FILES = Object.freeze({
  player: 'player.png', mobGoblin: 'mob-goblin.png', mobLizard: 'mob-lizard.png',
  mobOrc: 'mob-orc.png', eliteOgre: 'elite-ogre.png', bossKnight: 'boss-knight-violet.png',
  floor: 'floor-coarse.png'
});
const artState = { status: 'loading', assets: Object.create(null), failures: [], caches: Object.create(null), floorPattern: null, loadCount: 0, settledCount: 0, expectedCount: Object.keys(ART_FILES).length, cacheBuildStarted: false, cacheBuildCount: 0 };
function artCanvas(width, height) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const target = document.createElement('canvas'); target.width = width; target.height = height; return target;
}
function artVariantIndex(ratio) { return Math.round(Math.max(0,Math.min(1,ratio))*ART_CONFIG.healthSteps); }
function artCriticalPhase(ratio,time) { return ratio<ART_CONFIG.lowHealthRatio&&Math.floor(time*8)%2===0; }
function artMobKey(entity) { return ['mobGoblin','mobLizard','mobOrc'][Math.abs(Number.isFinite(entity.id)?entity.id:0)%3]; }
function artOutlineColor(normalHex, ratio) {
  const parse = hex => [1,3,5].map(i => parseInt(hex.slice(i, i+2), 16));
  const a=parse(normalHex), b=parse(ART_CONFIG.outlineCritical), t=1-Math.max(0,Math.min(1,ratio));
  return `rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(',')})`;
}
function artMakeVariant(image, normalHex, ratio, dim) {
  const width=image.naturalWidth||image.width, height=image.naturalHeight||image.height;
  if (!width || !height) return null;
  const target=artCanvas(width+2,height+2); if(!target) return null;
  const c=target.getContext('2d'); if(!c) return null;
  c.imageSmoothingEnabled=false;
  for(let oy=0;oy<=2;oy++) for(let ox=0;ox<=2;ox++) if(ox!==1||oy!==1) c.drawImage(image,ox,oy);
  c.globalCompositeOperation='source-in'; c.fillStyle=artOutlineColor(normalHex,ratio); c.fillRect(0,0,width+2,height+2);
  c.globalCompositeOperation='source-over';
  if(dim){
    const body=artCanvas(width,height); if(!body) return null;
    const b=body.getContext('2d'); if(!b){return null;} b.imageSmoothingEnabled=false; b.drawImage(image,0,0);
    b.globalCompositeOperation='source-atop'; b.fillStyle=`rgba(0,0,0,${1-ART_CONFIG.dimFactor})`; b.fillRect(0,0,width,height);
    c.drawImage(body,1,1);
  } else c.drawImage(image,1,1);
  return target;
}
function artBuildCaches() {
  artState.cacheBuildCount++;
  if (typeof Image === 'undefined') { artState.status='unsupported'; return; }
  const roles=[['mobGoblin',ART_CONFIG.mobOutlineNormal],['mobLizard',ART_CONFIG.mobOutlineNormal],['mobOrc',ART_CONFIG.mobOutlineNormal],['eliteOgre',ART_CONFIG.eliteOutlineNormal]];
  const tryCanvas=artCanvas(1,1);
  if(!tryCanvas||!tryCanvas.getContext('2d')) { artState.status='unsupported'; return; }
  for(const [key,normalColor] of roles){
    const image=artState.assets[key]; if(!image) continue;
    try {
      const bins=[];
      for(let step=0;step<=ART_CONFIG.healthSteps;step++){
        const ratio=step/ART_CONFIG.healthSteps;
        const normal=artMakeVariant(image,normalColor,ratio,false),dim=artMakeVariant(image,normalColor,ratio,true);
        if(!normal||!dim) throw new Error('variant canvas unavailable');
        bins.push({ratio,normal,dim});
      }
      artState.caches[key]=bins;
    } catch(error) { delete artState.caches[key];artState.failures.push('cache:'+key); }
  }
  const player=artState.assets.player;
  if(player){try{const hit=artCanvas(player.naturalWidth,player.naturalHeight);if(!hit)throw new Error('player hit canvas unavailable');const c=hit.getContext('2d');if(!c)throw new Error('player hit context unavailable');c.imageSmoothingEnabled=false;c.drawImage(player,0,0);c.globalCompositeOperation='source-atop';c.fillStyle='rgba(255,220,96,0.55)';c.fillRect(0,0,hit.width,hit.height);artState.caches.playerHit=hit;}catch(error){delete artState.caches.playerHit;artState.failures.push('cache:player-hit');}}
  const floor=artState.assets.floor;
  if(floor){try{const tile=artCanvas(floor.naturalWidth||floor.width,floor.naturalHeight||floor.height);if(!tile)throw new Error('floor canvas unavailable');const c=tile.getContext('2d');if(!c)throw new Error('floor context unavailable');c.imageSmoothingEnabled=false;c.drawImage(floor,0,0);artState.floorPattern=ctx.createPattern(tile,'repeat');if(!artState.floorPattern)throw new Error('floor pattern unavailable');}catch(error){artState.floorPattern=null;artState.failures.push('cache:floor');}}
  artState.status=Object.keys(ART_FILES).every(k=>artState.assets[k])&&artState.failures.length===0?'ready':'partial';
}
function artLoadAssets() {
  if(typeof Image==='undefined'){artState.status='unsupported';return;}
  const expected=Object.keys(ART_FILES).length;
  artState.expectedCount=expected;
  for(const [key,file] of Object.entries(ART_FILES)){
    let image=null,settled=false;artState.loadCount++;
    const finish=(ok)=>{
      if(settled)return;
      settled=true;clearTimeout(timer);artState.settledCount++;
      if(ok){artState.assets[key]=image;}else{artState.failures.push(key);delete artState.assets[key];}
      if(artState.settledCount===expected&&!artState.cacheBuildStarted){artState.cacheBuildStarted=true;artBuildCaches();}
    };
    const timer=setTimeout(()=>finish(false),ART_CONFIG.loadTimeoutMs);
    try { image=new Image();image.onload=()=>finish((image.naturalWidth||image.width)>0&&(image.naturalHeight||image.height)>0);image.onerror=()=>finish(false);image.src=ART_CONFIG.root+file; }
    catch(error){finish(false);}
  }
}function artDrawGround() {
  if(!artState.floorPattern)return;
  ctx.save();ctx.beginPath();ctx.rect(24,90,1232,406);ctx.clip();ctx.globalAlpha=ART_CONFIG.groundAlpha;ctx.fillStyle=artState.floorPattern;ctx.fillRect(24,90,1232,406);ctx.restore();
}
function artDrawActor(key, entity, width, height, dim=false, hit=false) {
  let source=null, sx=entity.x-width/2, sy=entity.y+entity.radius-height;
  if(key==='player'){if(hit&&!artState.caches.playerHit)return false;source=hit?artState.caches.playerHit:artState.assets.player;}
  else if(key==='bossKnight') source=artState.assets.bossKnight;
  else {
    const bins=artState.caches[key];
    if(bins){const ratio=Math.max(0,Math.min(1,entity.maxHp>0?entity.hp/entity.maxHp:0));const step=artVariantIndex(ratio);const entry=bins[step];source=dim&&ratio<ART_CONFIG.lowHealthRatio?entry.dim:entry.normal;}
    else return false;
  }
  if(!source)return false;
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(source,sx,sy,width,height);ctx.restore();return true;
}
artLoadAssets();


const ITEMS = [
  {id:'fire',name:'火',kind:'element',side:'both',element:'fire',asTrigger:{id:'fire-trigger',kind:'element-trigger',side:'trigger',description:'热度以 20 点/秒持续获得（上限 100）；达到 50 后按空格触发本槽膛效果，超过 50 的每点热度使本次膛攻击伤害 +2%',values:{manual:true}},asEffect:{id:'fire-effect',kind:'element-effect',side:'effect',desc:'前方 120° 斩击，射程 180，基础伤害 25',description:'前方 120° 斩击，射程 180，基础伤害 25',values:{damage:CONFIG.fire.baseDamage,angle:CONFIG.fire.angle,range:CONFIG.fire.range}}},
  {id:'wind',name:'风',kind:'element',side:'both',element:'wind',asTrigger:{id:'wind-trigger',kind:'element-trigger',side:'trigger',description:'最近 0.4 秒位移超过 8 像素时，移动命中累计 8 次',values:{hits:8,movementWindow:0.4,movementDistance:8}},asEffect:{id:'wind-effect',kind:'element-effect',side:'effect',desc:'风旋 3 秒，吸附半径 80，每秒伤害 3',description:'风旋 3 秒，吸附半径 80，每秒伤害 3',values:{duration:3,radius:80,damage:3}}},
  // TODO(sol): 占位值，按 §18 C28 与平衡目标统一重算
  {id:'ice',name:'冰',kind:'element',side:'both',element:'ice',asTrigger:{id:'ice-trigger',kind:'element-trigger',side:'trigger',description:'场上有负面状态敌人时，每 0.5 秒触发；本槽膛攻击 +8%（占位）',values:{interval:0.5,damageBonus:0.08}},asEffect:{id:'ice-effect',kind:'element-effect',side:'effect',desc:'范围冰雾，范围内敌人减速 40%',description:'半径 100 冰雾 3 秒，减速 40%',values:{duration:3,radius:100,slow:0.4}}},
  {id:'spike',name:'长钉',kind:'weapon-effect',side:'effect',element:null,description:'向前突刺，伤害 10，附加易伤 4 秒（受伤 +20%），冷却 0.8 秒',values:{damage:10,cooldown:0.8,statusOnHit:{status:'vulnerable',duration:4,source:'spike',params:{damageTakenBonus:0.2}}}},
  {id:'rapid',name:'连响',kind:'weapon-effect',side:'effect',element:null,description:'快速弹丸，伤害 6，冷却 0.4 秒',values:{damage:6,cooldown:0.4}},
  {id:'flame',name:'火舌',kind:'weapon-effect',side:'effect',element:null,description:'前方扇形持续 2 秒，每秒 4，冷却 3 秒；持续灼烧一片区域，不计入攻击命中数',values:{damage:4,duration:2,cooldown:3}},
  {id:'loop',name:'回环',kind:'weapon-effect',side:'effect',element:null,description:'抛出返回，去返各一次，每次 7',values:{damage:7}},
  // TODO(sol): 占位值，按 §18 C28 与平衡目标统一重算
  {id:'fast',name:'快拍',kind:'weapon-trigger',side:'trigger',element:null,description:'每 0.9 秒触发，本次膛攻击增伤 +15%（桶一占位）',values:{interval:0.9,damageBonus:0.15}},
  // TODO(sol): 占位值，按 §18 C28 与平衡目标统一重算
  {id:'pendulum',name:'钟摆',kind:'weapon-trigger',side:'trigger',element:null,description:'每 1.6 秒触发，本次膛攻击增伤 +28%（桶一占位）',values:{interval:1.6,damageBonus:0.28}},
  // TODO(sol): 占位值，按 §18 C28 与平衡目标统一重算
  {id:'pressure',name:'蓄压',kind:'weapon-trigger',side:'trigger',element:null,description:'每 3.0 秒触发，本次膛攻击增伤 +55%（桶一占位）',values:{interval:3.0,damageBonus:0.55}},
  {id:'quota',name:'计件',kind:'weapon-trigger',side:'trigger',element:null,description:'每击杀 3 个敌人触发',values:{kills:3}},
  {id:'recoil',name:'反冲',kind:'weapon-trigger',side:'trigger',element:null,description:'每次受击触发',values:{onHit:true}}
];
function applyStatus(target,attachment){if(!target||target.dead||!attachment?.status)return false;target.statuses=target.statuses||{};target.statuses[attachment.status]={status:attachment.status,until:game.time+attachment.duration,source:attachment.source||'unknown',...(attachment.params||{})};if(attachment.status==='burn'&&attachment.params?.damagePerTick){target.dots=target.dots||{};target.dots.burn={damagePerTick:attachment.params.damagePerTick,tickInterval:attachment.params.tickInterval||1,ticksRemaining:attachment.params.ticks||4,nextTick:game.time+(attachment.params.tickInterval||1),source:attachment.source||'fire'};}return true;}function hasNegativeStatus(target){const statuses=target?.statuses||{};return ['slow','burn','vulnerable','poison'].some(name=>{const st=statuses[name];return !!st&&st.until>game.time&&!(name==='slow'&&st.source==='ice');});}
function createEmptySlots() { return Array.from({length:5}, () => ({trigger:null,effect:null,resonance:{element:null,layers:0},state:{timer:0,cooldownElapsed:Infinity,cooldownCompensation:0,lastTriggerAt:-Infinity,fireHits:0,windHits:0,iceDamage:0,kills:0,heat:0}})); }
game.slots = createEmptySlots(); game.selectedItem = null; game.prepChoices = 0; game.buttons = []; game.dragItem = null;
function recalculateAllResonance() {
  const previous={...game.resonanceTotals};
  const next={fire:0,wind:0,ice:0};
  game.slots.forEach(slot=>{const a=slot.trigger?.sourceId,b=slot.effect?.sourceId;const element=a&&a===b?slot.trigger.element:null;slot.resonance={element,layers:element?1:0};if(element)next[element]++;});
  game.resonanceTotals=next;
  const names={fire:'火',wind:'风',ice:'冰'};
  const changed=['fire','wind','ice'].filter(element=>previous[element]!==next[element]);
  for(const element of changed)console.log(`[合膛] ${names[element]} ${previous[element]}→${next[element]}`);
  if(changed.length)console.log(`[合膛] 汇总：火 ${next.fire}、风 ${next.wind}、冰 ${next.ice}`);
  if(typeof applyResonanceStats==='function')applyResonanceStats();
}
function chooseItem(itemId) { const candidate=game.choices.find(item=>item.id===itemId); game.selectedItem=candidate||null; }
function getSlotBehavior(slot) { const active=!!(slot.trigger||slot.effect); return {active,triggerInterval:active?(slot.trigger?.values?.interval??CONFIG.defaultParts.triggerInterval):null,projectileDamage:active?(slot.effect?.values?.damage??CONFIG.defaultParts.projectileDamage):null}; }
function placeSelectedItem(slotIndex,side) {
  const item=game.selectedItem; if(!item || !Number.isInteger(slotIndex) || slotIndex<0 || slotIndex>=game.slots.length || !(side==='trigger'||side==='effect') || !(game.screen==='prep'||game.screen==='choice')) return false;
  const behavior=item.kind==='element' ? item[side==='trigger'?'asTrigger':'asEffect'] : item.side===side ? item : null;
  if(!behavior)return false;
  game.slots[slotIndex][side]={...item,...behavior,id:behavior.id,name:item.name,element:item.element??null,sourceId:item.id}; game.selectedItem=null; game.dragItem=null; game.prepChoices++; if(game.initialPicksRemaining>0){game.initialPicksRemaining--;if(game.initialPicksRemaining>0)setChoiceRound(3);else game.choices=[];}else if(game.choicePending){game.choicePending=false;game.choices=[];game.screen='prep';} recalculateAllResonance(); return true;
}
function resolvePlacedItemForSide(item,side){if(!item)return null;if(item.sourceId){const canonical=ITEMS.find(entry=>entry.id===item.sourceId&&entry.kind==='element');if(canonical){const behavior=canonical[side==='trigger'?'asTrigger':'asEffect'];return behavior?{...canonical,...behavior,id:behavior.id,name:canonical.name,element:canonical.element,sourceId:canonical.id}:null;}}return item.side===side?item:null;}
function movePlacedItem(fromIndex,fromSide,toIndex,toSide){if(!(game.screen==='prep'||game.screen==='choice')||!Number.isInteger(fromIndex)||!Number.isInteger(toIndex)||fromIndex<0||fromIndex>=game.slots.length||toIndex<0||toIndex>=game.slots.length||!['trigger','effect'].includes(fromSide)||!['trigger','effect'].includes(toSide))return false;const source=game.slots[fromIndex],target=game.slots[toIndex],item=source?.[fromSide];if(!item||(fromIndex===toIndex&&fromSide===toSide))return false;const movedSource=resolvePlacedItemForSide(item,toSide);if(!movedSource)return false;const targetItem=target[toSide];if(targetItem){const movedTarget=resolvePlacedItemForSide(targetItem,fromSide);if(!movedTarget)return false;source[fromSide]=movedTarget;target[toSide]=movedSource;}else{source[fromSide]=null;target[toSide]=movedSource;}recalculateAllResonance();return true;}function runSelfChecks() {
  const original=game.slots, originalScreen=game.screen, originalSelection=game.selectedItem; let passed=0;
  const check=(condition,label)=>{console.assert(condition,`自检失败：${label}`);if(condition)passed++;};
  game.slots=createEmptySlots(); recalculateAllResonance();
  check(game.slots.length===5 && game.slots.every(s=>!s.trigger&&!s.effect),'五个空膛位');
  check(!getSlotBehavior(game.slots[0]).active,'空槽不工作');
  check(ITEMS.length===12 && ITEMS.filter(item=>item.kind==='element').length===3 && ITEMS.filter(item=>item.kind.startsWith('weapon-')).length===9,'三张双端元素卡');
  game.screen='prep';game.selectedItem=ITEMS.find(item=>item.id==='fire');
  check(placeSelectedItem(0,'trigger') && game.slots[0].trigger.id==='fire-trigger' && game.slots[0].trigger.sourceId==='fire','元素卡可放扳机端');
  check(getSlotBehavior(game.slots[0]).projectileDamage===CONFIG.defaultParts.projectileDamage,'单扳机端保留默认膛');
  game.selectedItem=ITEMS.find(item=>item.id==='fire');
  check(placeSelectedItem(0,'effect') && game.slots[0].resonance.layers===1,'同一元素源双端合膛');
  game.selectedItem=ITEMS.find(item=>item.id==='wind');placeSelectedItem(1,'effect');
  check(getSlotBehavior(game.slots[1]).triggerInterval===CONFIG.defaultParts.triggerInterval,'单膛端保留默认扳机');
  game.slots[0].effect={...ITEMS.find(item=>item.id==='wind').asEffect,id:'wind-effect',element:'wind',sourceId:'wind'};recalculateAllResonance();
  check(game.slots[0].resonance.layers===0,'异源元素不合膛');
  game.slots=createEmptySlots();game.selectedItem=ITEMS.find(item=>item.id==='spike');
  check(!placeSelectedItem(0,'trigger'),'散件端点不匹配拒绝放置');
  check(ITEMS.every(item=>item.kind!=='element'||item.asTrigger&&item.asEffect),'元素两端行为均定义');
  check(ITEMS.filter(item=>item.kind==='element').every(item=>[item.asTrigger.description,item.asEffect.desc].every(desc=>typeof desc==='string'&&desc.trim().length>0&&desc!=='undefined')),'三元素双端描述非空');
  for(const element of ITEMS.filter(item=>item.kind==='element')){
    check(typeof element.asTrigger.description==='string'&&element.asTrigger.description.trim().length>0,'扳机描述：'+element.name);
    check(typeof element.asEffect.desc==='string'&&element.asEffect.desc.trim().length>0&&element.asEffect.desc!=='undefined','膛描述：'+element.name);
  }
  game.slots=original;game.screen=originalScreen;game.selectedItem=originalSelection;recalculateAllResonance();console.log(`自检：${passed}/17 条通过`);return passed===17;
}function makeChoiceItems(count=3,randomSource=Math.random,rewardWave=null) {const size=Math.min(ITEMS.length,Math.max(0,Math.floor(count)));if(CONFIG.debug.enabled&&rewardWave!==null&&game.debugConfig.testGrantWave===rewardWave&&game.debugConfig.testItemIds.length){const pool=ITEMS.filter(item=>game.debugConfig.testItemIds.includes(item.id));const picks=[],targetCount=Math.min(size,pool.length);while(picks.length<targetCount){const index=Math.min(pool.length-1,Math.floor(randomSource()*pool.length));picks.push(pool.splice(index,1)[0]);}game.debugConfig.testGrantWave=null;game.debugConfig.testItemIds=[];return picks;}const elements=ITEMS.filter(item=>item.kind==='element');const parts=ITEMS.filter(item=>item.kind!=='element');const choices=[];for(let position=0;position<size;position++){const wantsElement=randomSource()<CONFIG.choice.elementCardProbability;let pool=wantsElement?elements:parts;if(!pool.length)pool=wantsElement?parts:elements;const index=Math.min(pool.length-1,Math.floor(randomSource()*pool.length));choices.push(pool.splice(index,1)[0]);}return choices;}function setChoiceRound(count=3,rewardWave=null){game.choices=makeChoiceItems(count,Math.random,rewardWave);game.choiceRefreshUsed=Array.from({length:game.choices.length},()=>false);game.choiceRefreshMessage='';}
function refreshChoice(index){if(game.screen!=='choice'&&game.screen!=='prep')return false;if(!Number.isInteger(index)||game.choiceRefreshUsed?.[index]||!game.choices?.[index])return false;const old=game.choices[index];let candidate=null;for(let attempt=0;attempt<8;attempt++){const next=makeChoiceItems(1)[0];if(next&&next.id!==old.id&&!game.choices.some((item,i)=>i!==index&&item.id===next.id)){candidate=next;break;}}if(!candidate){game.choiceRefreshUsed[index]=true;game.choiceRefreshMessage='刷新失败：没有可替换候选';return false;}game.choices[index]=candidate;game.choiceRefreshUsed[index]=true;game.choiceRefreshMessage='';return true;}
function skipChoice(){if(game.screen!=='choice'&&game.screen!=='prep')return false;game.selectedItem=null;if(game.initialPicksRemaining>0){game.initialPicksRemaining--;if(game.initialPicksRemaining>0)setChoiceRound(3);else{game.choices=[];game.screen='prep';}}else{game.choicePending=false;game.choices=[];game.screen='prep';}return true;}
function enterPrep() { game.screen='prep'; game.prepChoices=0; game.initialPicksRemaining=5; game.choicePending=false; setChoiceRound(3); }
function isSharedBurdenActive(){return game.activeSpecials?.includes('shared-burden')||game.debugConfig.carrySharedBurden;}
function countLivingMobs(){return game.enemies.filter(enemy=>enemy.type==='mob'&&!enemy.dead).length;}
function makeSharedBurdenMob(boss){return {id:game.nextEntityId++,type:'mob',x:boss.x+Math.random()*80-40,y:boss.y+Math.random()*80-40,hp:CONFIG.enemy.mobHp,maxHp:CONFIG.enemy.mobHp,speed:CONFIG.enemy.mobSpeed,damage:CONFIG.enemy.mobDamage,radius:CONFIG.combat.mobRadius,slowUntil:0,dead:false,hitTimer:CONFIG.player.hitInterval};}
function spawnSharedBurdenWave(boss,count=CONFIG.special.sharedBurdenBatch){if(!boss||boss.dead||boss.hp<=0)return 0;if(count>0)boss.sharedBurdenQueued=(boss.sharedBurdenQueued||0)+count;const available=Math.max(0,CONFIG.special.sharedBurdenCap-countLivingMobs()),spawned=Math.min(available,boss.sharedBurdenQueued||0);for(let i=0;i<spawned;i++)game.enemies.push(makeSharedBurdenMob(boss));boss.sharedBurdenQueued-=spawned;return spawned;}function applySharedBurden(boss){boss.maxHp=CONFIG.boss.hp;boss.hp=CONFIG.boss.hp;boss.sharedBurdenTimer=CONFIG.special.sharedBurdenInterval;boss.sharedBurdenQueued=0;console.log('[同担] Boss 最大生命保持 '+boss.maxHp+'；小怪死亡将扣除 Boss 当前生命');}function chooseSpecial(id){game.activeSpecials=[id];game.screen='choice';game.choicePending=true;setChoiceRound(3);console.log(`[特件] 选择：${id==='shared-burden'?'同担':'余劲'}`);}function endPlayerRunIfDead(){if(game.player?.hp<=0){game.screen='gameover';game.result='阵亡';return true;}return false;}function planWaveBatches(spec){
  const {mobs,batches,batchInterval}=spec||{};
  if(!Number.isSafeInteger(mobs)||mobs<=0)throw new RangeError('分批波 mobs 必须是正安全整数');
  if(!Number.isSafeInteger(batches)||batches<=0||batches>mobs)throw new RangeError('分批波 batches 必须是1到mobs之间的正安全整数');
  if(!Number.isFinite(batchInterval)||batchInterval<=0)throw new RangeError('分批波 batchInterval 必须是有限正数');
  const base=Math.floor(mobs/batches),sizes=Array.from({length:batches},(_,i)=>i===batches-1?mobs-base*(batches-1):base);
  if(sizes.some(n=>!Number.isSafeInteger(n)||n<=0)||sizes.reduce((sum,n)=>sum+n,0)!==mobs)throw new Error('批次数量守恒失败');
  return sizes;
}
function createWaveEntity(type){const c=CONFIG.combat,boss=type==='boss',elite=type==='elite',x=80+Math.random()*(CONFIG.canvas.width-160),y=100+Math.random()*380;return {id:game.nextEntityId++,type,x,y,hp:boss?CONFIG.boss.hp:elite?CONFIG.enemy.eliteHp:CONFIG.enemy.mobHp,maxHp:boss?CONFIG.boss.hp:elite?CONFIG.enemy.eliteHp:CONFIG.enemy.mobHp,speed:boss?CONFIG.boss.speed:elite?CONFIG.enemy.eliteSpeed:CONFIG.enemy.mobSpeed,damage:boss?CONFIG.boss.damage:elite?CONFIG.enemy.eliteDamage:CONFIG.enemy.mobDamage,radius:boss?32:elite?c.mobRadius*CONFIG.enemy.eliteScale:c.mobRadius,slowUntil:0,dead:false,hitTimer:CONFIG.player.hitInterval,skillTimer:CONFIG.boss.skillInterval,skillIndex:0,summonGroups:0};}
function spawnWaveBatch(state){if(!state||state.nextBatchIndex>=state.batchSizes.length)throw new Error('无待生成批次或批次重复生成');const size=state.batchSizes[state.nextBatchIndex],before=game.enemies.length,ids=new Set(game.enemies.map(e=>e.id));for(let i=0;i<size;i++)game.enemies.push(createWaveEntity('mob'));const created=game.enemies.slice(before);if(created.length!==size||created.some(e=>ids.has(e.id))||created.some(e=>e.type!=='mob'))throw new Error('批次实际登记数量与计划不符');state.generated+=created.length;state.nextBatchIndex++;state.lastBatchSpawnAt=game.time;state.clearAt=null;if(state.generated>state.total||state.generated!==state.batchSizes.slice(0,state.nextBatchIndex).reduce((sum,n)=>sum+n,0))throw new Error('批次累计生成数量守恒失败');if(state.nextBatchIndex===state.batchSizes.length){if(state.generated!==state.total)throw new Error('全部批次生成后总数不符');game.waveSpawnComplete=true;}console.log('[波次] 第 '+state.wave+' 波批次 '+state.nextBatchIndex+'/'+state.batchSizes.length+' 生成 '+size+' 只，累计 '+state.generated+'/'+state.total);return created.length;}
function getWaveBatchNextSpawnAt(state=game.waveBatchState){if(!state||state.nextBatchIndex>=state.batchSizes.length)return null;const normal=state.lastBatchSpawnAt+state.interval;if(state.clearAt===null)return normal;const early=Math.max(state.lastBatchSpawnAt+state.interval*CONFIG.waveBatches.earlyIntervalFraction,state.clearAt+CONFIG.waveBatches.clearPause);return Math.min(normal,early);}
function updateWaveBatchSchedule(){const state=game.waveBatchState;if(!state||state.nextBatchIndex>=state.batchSizes.length)return false;if(endPlayerRunIfDead())return false;if(game.enemies.length===0&&state.clearAt===null)state.clearAt=game.time;const due=getWaveBatchNextSpawnAt(state);if(due!==null&&game.time+1e-9>=due){spawnWaveBatch(state);return true;}return false;}
function getWaveBatchHud(){const state=game.waveBatchState;if(!state||state.nextBatchIndex>=state.batchSizes.length)return '';const remaining=state.batchSizes.length-state.nextBatchIndex,due=getWaveBatchNextSpawnAt(state),seconds=Math.max(0,(due??game.time)-game.time);return '｜待生成 '+remaining+' 批·下批 '+seconds.toFixed(1)+'秒';}
function finishWave() {if(endPlayerRunIfDead()||game.waveComplete)return;if(game.waveBatchState&&game.waveBatchState.nextBatchIndex<game.waveBatchState.batchSizes.length)return;game.waveComplete=true;const cleared=game.wave;const drops=game.droppedTriggerEvents-game.waveDropBaseline.total,frameDrops=game.droppedPerFrame-game.waveDropBaseline.perFrame,depthDrops=game.droppedDepth-game.waveDropBaseline.depth;console.log(`[事件队列] 第 ${cleared} 波 dropped=${drops}（单帧 ${frameDrops}，链深 ${depthDrops}）`);console.log(`[波次] 第 ${cleared} 波完成，击杀 ${game.kills} 只`);if(cleared>=8){game.screen='gameover';game.result='存活 / 八波完成';console.log(`[暴击统计] 全局可暴击命中 ${game.criticalRolls||0}，暴击 ${game.criticalHits||0}，暴击率 ${game.criticalRolls?((game.criticalHits||0)/game.criticalRolls*100).toFixed(1):'0.0'}%`);return;}game.waveBatchState=null;game.wave=cleared+1;if(cleared===4&&!CONFIG.debug.enabled){game.screen='special-choice';game.choicePending=true;return;}game.screen='choice';game.choicePending=true;setChoiceRound(3,cleared);game.selectedItem=null;}
function buildLoadoutSummary() { const parts=[]; const names={fire:'火',wind:'风',ice:'冰'}; for(const element of ['fire','wind','ice'])if(game.resonanceTotals[element])parts.push(`${names[element]} · 合膛 ×${game.resonanceTotals[element]}`); for(const slot of game.slots){if(slot.trigger?.kind==='weapon-trigger')parts.push(slot.trigger.name);if(slot.effect?.kind==='weapon-effect')parts.push(slot.effect.name);if(slot.trigger&&slot.effect&&!slot.resonance.layers)parts.push('偏膛');} return parts.join('，')||'各干各的'; }
function spawnWaveEntities(wave=game.wave){
 const spec=CONFIG.waves[wave]||{};if(wave===7&&spec.batches===undefined)throw new RangeError('第7波分批配置缺失 batches');const batchSizes=spec.batches===undefined?null:planWaveBatches(spec);
 game.waveDropBaseline={total:game.droppedTriggerEvents,perFrame:game.droppedPerFrame,depth:game.droppedDepth};game.zones=[];game.pendingReturns=[];game.effects=[];game.damageNumbers=[];game.enemies=[];game.nextEntityId=game.nextEntityId||1;game.kills=0;game.waveComplete=false;game.waveBatchState=null;game.waveSpawnComplete=false;
 const spawn=(type)=>{const entity=createWaveEntity(type);game.enemies.push(entity);return entity;};
 game.activeSpecials=game.activeSpecials||[];if(game.debugConfig.carrySharedBurden&&!game.activeSpecials.includes('shared-burden'))game.activeSpecials.push('shared-burden');if(game.debugConfig.carryOverflow&&!game.activeSpecials.includes('overflow'))game.activeSpecials.push('overflow');
 if(wave===8){if(spec.boss!==1)throw new RangeError('当前原型仅支持配置中的单个Boss');spawn('boss');const boss=game.enemies[0];if(game.activeSpecials?.includes('shared-burden')||game.debugConfig.carrySharedBurden)applySharedBurden(boss);game.waveSpawnComplete=true;}
 else if(batchSizes){game.waveBatchState={wave,batchSizes,total:spec.mobs,interval:spec.batchInterval,nextBatchIndex:0,lastBatchSpawnAt:null,clearAt:null,generated:0};spawnWaveBatch(game.waveBatchState);game.waveSpawnComplete=batchSizes.length===1;for(let i=0;i<(spec.elites||0);i++)spawn('elite');}
 else{for(let i=0;i<(spec.mobs||0);i++)spawn('mob');for(let i=0;i<(spec.elites||0);i++)spawn('elite');game.waveSpawnComplete=true;}
 console.log('[波次] 第 '+wave+' 波生成 '+game.enemies.length+' 个敌人'+(batchSizes?'（批次调度已启用）':''));}
function installDebugTestItems(){const counts=game.debugConfig.testStartCounts||{};const selected=Object.entries(counts).flatMap(([id,count])=>Array.from({length:Math.max(0,Math.floor(count))},()=>ITEMS.find(item=>item.id===id)).filter(Boolean));let installed=0;for(const item of selected){if(installed>=game.slots.length*2)break;const sides=item.kind==='element'?['trigger','effect']:[item.side];let placed=false;for(let slotIndex=0;slotIndex<game.slots.length&&!placed;slotIndex++)for(const side of sides){if(game.slots[slotIndex][side])continue;const behavior=item.kind==='element'?item[side==='trigger'?'asTrigger':'asEffect']:item;if(!behavior)continue;game.slots[slotIndex][side]={...item,...behavior,id:behavior.id,name:item.name,element:item.element??null,sourceId:item.id};placed=true;installed++;break;}}game.debugConfig.testItemOverflow=Math.max(0,selected.length-installed);recalculateAllResonance();return installed;}function startWave(wave=game.wave) { game.wave=wave;game.screen='play';game.waveComplete=false;game.player.attackTimer=0;game.movementHistory=[{time:game.time,x:game.player.x,y:game.player.y}];for(const slot of game.slots)if(slot.trigger?.id==='fire-trigger')slot.state.heat=CONFIG.fire.heatMax;spawnWaveEntities(wave);console.log(`[波次] 扳机冻结，进入第 ${wave} 波`); }
function findNearestEnemy(x,y,excludedIds=[]) {const excluded=excludedIds instanceof Set?excludedIds:new Set(excludedIds);let candidates=game.enemies.filter(e=>!e.dead&&!excluded.has(e.id));if(!candidates.length)return null;const distance=e=>Math.hypot(e.x-x,e.y-y);let nearest=Infinity;for(const e of candidates)nearest=Math.min(nearest,distance(e));candidates=candidates.filter(e=>distance(e)-nearest<=5);const bosses=candidates.filter(e=>e.type==='boss');if(bosses.length)candidates=bosses;let highestHp=-Infinity;for(const e of candidates)highestHp=Math.max(highestHp,e.hp);candidates=candidates.filter(e=>e.hp===highestHp);return candidates[Math.floor(Math.random()*candidates.length)];}function enqueueSlotTrigger(slot,context={}){if(!slot||(!slot.trigger&&!slot.effect))return false;const depth=game.triggerProcessing?game.currentTriggerDepth+1:1;const now=game.time||0;if(depth>CONFIG.events.maxChainDepth){game.droppedTriggerEvents++;game.droppedDepth++;return false;}const last=slot.state.lastTriggerAt??-Infinity;if(now-last<CONFIG.events.minTriggerInterval){game.droppedTriggerEvents++;return false;}slot.state.lastTriggerAt=now;game.triggerQueue.push({slot,context:{...context},depth});return true;}
function processTriggerQueue(){let processed=0;game.triggerProcessing=true;try{while(game.triggerQueue.length&&processed<CONFIG.events.maxPerFrame){const event=game.triggerQueue.shift();game.currentTriggerDepth=event.depth;executeSlotEffect(event.slot,event.context);processed++;}if(game.triggerQueue.length){game.droppedTriggerEvents+=game.triggerQueue.length;game.droppedPerFrame+=game.triggerQueue.length;game.triggerQueue.length=0;}}finally{game.triggerProcessing=false;game.currentTriggerDepth=0;}return processed;}// 攻击实例只活到本次判定结束；去重集合随实例释放，不跨攻击累计。
const HIT_ELIGIBILITY=Object.freeze({base:true,default:true,spike:true,rapid:true,'loop-out':true,'loop-return':true,'fire-effect':true,'ice-effect':true,flame:true,'wind-effect':true});
function createAttackEvent(type){if(!HIT_ELIGIBILITY[type])throw new TypeError('未裁定的命中类型：'+type);return {id:game.nextAttackId++,type,targets:new Set()};}
function resolveAttackContact(attack,target,statusOnHit=null,damage=null){
  if(!attack||!HIT_ELIGIBILITY[attack.type])throw new TypeError('命中必须有已裁定攻击实例');
  if(!target||target===game.player||target.dead||target.hp<=0||attack.targets.has(target.id)||endPlayerRunIfDead())return false;
  attack.targets.add(target.id);
  recordHit(target);
  // 长钉首次伤害仍不追溯吃本次新挂的易伤；控制/无伤害接触也可挂状态。
  if(damage)damage();
  if(statusOnHit&&!target.dead&&target.hp>0)applyStatus(target,statusOnHit);
  return true;
}
function recordDamageEvent(source,target,dealt){game.damageEventCount=(game.damageEventCount||0)+1;game.lastDamageEvent={source:source.label,kind:source.kind,targetId:target===game.player?'player':target.id,amount:dealt};}
function getConeTargets(x,y,direction,angle,range){return game.enemies.filter(enemy=>{if(enemy.dead||enemy.hp<=0)return false;const dx=enemy.x-x,dy=enemy.y-y,distance=Math.hypot(dx,dy),diff=Math.atan2(Math.sin(Math.atan2(dy,dx)-direction),Math.cos(Math.atan2(dy,dx)-direction));return distance<=range&&(distance===0||Math.abs(diff)<=angle*Math.PI/360);});}
function getAttackDirection(target){const dx=target?target.x-game.player.x:(game.player.facingX||1),dy=target?target.y-game.player.y:(game.player.facingY||0);return Math.hypot(dx,dy)>0?Math.atan2(dy,dx):0;}
function applyDamage(source,target,amount,meta) {
  // 来源与命中资格显式传入；初始化/重置生命不属于伤害。
  if(!source||!['active','dot','overflow','transfer','enemy'].includes(source.kind)||!meta)throw new TypeError('伤害来源与元数据必须显式指定');
  const none={dealt:0,actual:0,overflow:0};
  if(meta.technicalRemoval||!target||target.dead||target.hp<=0||!Number.isFinite(amount)||amount<=0)return none;
  if(endPlayerRunIfDead())return none;
  const playerTarget=target===game.player,kind=source.kind,label=source.label||kind;
  let resolved=amount,critical=false;
  const canCrit=!playerTarget&&kind==='active'&&meta.canCrit!==false;
  if(canCrit){game.criticalRolls=(game.criticalRolls||0)+1;critical=Math.random()<(game.player.critChance||0);if(critical){resolved*=CONFIG.critMultiplier;game.criticalHits=(game.criticalHits||0)+1;console.log('[暴击] '+label+'，伤害 ×'+CONFIG.critMultiplier);}}
  if(!playerTarget&&kind!=='transfer'&&target.statuses?.vulnerable?.until>game.time)resolved*=1+(target.statuses.vulnerable.damageTakenBonus||0);
  const dealt=Math.min(target.hp,Math.max(0,resolved));
  target.hp-=dealt;
  if(dealt>0)recordDamageEvent(source,target,dealt);
  const overflow=playerTarget||kind==='transfer'?0:Math.max(0,resolved-dealt),result={dealt,actual:dealt,overflow};
  if(playerTarget){
    console.log('[受击] '+label+'：'+dealt);
    if(endPlayerRunIfDead())return result;
    target.hitFlash=CONFIG.combat.hitFlash;
    for(const slot of game.slots)if(slot.trigger?.id==='recoil'){console.log('[触发] 反冲，膛位 '+(game.slots.indexOf(slot)+1));enqueueSlotTrigger(slot,{triggerBonus:0});}
    return result;
  }

  if(kind!=='transfer'){
    game.damageNumbers=game.damageNumbers||[];game.damageNumbers.push({x:target.x,y:target.y,value:Math.ceil(dealt),critical,iceResonance:critical&&game.resonanceTotals.ice>0,t0:game.time,dur:0.65});
    game.effects.push({kind:'impact',x:target.x,y:target.y,timer:CONFIG.combat.hitFlash});
  }
  if(overflow>0&&kind!=='overflow'&&kind!=='transfer'&&(game.activeSpecials?.includes('overflow')||game.debugConfig.carryOverflow)){
    const other=findNearestEnemy(game.player.x,game.player.y,new Set([target.id]));
    if(other){const dx=other.x-target.x,dy=other.y-target.y,d=Math.hypot(dx,dy)||1;game.projectiles.push({x:target.x,y:target.y,vx:dx/d*CONFIG.projectile.speed,vy:dy/d*CONFIG.projectile.speed,targetId:other.id,damage:overflow*CONFIG.special.overflowMultiplier,life:CONFIG.projectile.life,overflowShot:true});console.log('[余劲] 溢出伤害已转为单枚飞弹，目标 '+other.id);}
    else console.log('[余劲] 无其他目标，溢出丢弃');
  }

  if(target.hp<=0&&!target.dead){
    // 先封存死亡，再派生转伤；重复调用不会重复计杀或联动。
    target.dead=true;
    if(target.type==='mob'&&isSharedBurdenActive()){
      const boss=game.enemies.find(enemy=>enemy.type==='boss'&&!enemy.dead&&enemy.hp>0);
      if(boss)applyDamage({kind:'transfer',label:'同担'},boss,CONFIG.special.sharedBurdenDeathDamage,{});
    }
    if(target.type==='boss'&&!endPlayerRunIfDead()){game.screen='gameover';game.result=kind==='transfer'?'同担击溃 Boss':'存活 / 八波完成';console.log('[波次] Boss 击败，八波通关');}
    game.kills++;
    for(const slot of game.slots)if(slot.trigger?.id==='quota'){slot.state.kills++;if(slot.state.kills>=slot.trigger.values.kills){slot.state.kills=0;enqueueSlotTrigger(slot,{triggerBonus:0});}}
    console.log('[击杀] '+label+' 击倒敌人 '+target.id);
  }
  return result;
}
function separateEnemies() { const passes=CONFIG.combat.separationPasses;for(let pass=0;pass<passes;pass++)for(let i=0;i<game.enemies.length;i++)for(let j=i+1;j<game.enemies.length;j++){const a=game.enemies[i],b=game.enemies[j];if(a.dead||b.dead)continue;let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||0.001,min=a.radius+b.radius;if(d<min){const push=(min-d)/2,ux=dx/d,uy=dy/d;a.x-=ux*push;a.y-=uy*push;b.x+=ux*push;b.y+=uy*push;}} }
function getRecentPlayerMovement(windowSeconds=0.4){const history=game.movementHistory||[];if(!history.length)return 0;const cutoff=game.time-windowSeconds;let point=history[0];for(let i=0;i<history.length-1;i++){const a=history[i],b=history[i+1];if(a.time<=cutoff&&cutoff<=b.time){const span=b.time-a.time,ratio=span>0?(cutoff-a.time)/span:0;point={x:a.x+(b.x-a.x)*ratio,y:a.y+(b.y-a.y)*ratio};break;}if(a.time>cutoff){point=a;break;}point=b;}return Math.hypot(game.player.x-point.x,game.player.y-point.y);}
function recordHit(target) { game.hitCount=(game.hitCount||0)+1;game.fireHitCounter=(game.fireHitCounter||0)+1;game.windTargetCounter=target.id;for(let i=0;i<game.slots.length;i++){const slot=game.slots[i],t=slot.trigger;if(t?.id==='wind-trigger'&&getRecentPlayerMovement(t.values.movementWindow)>t.values.movementDistance){slot.state.windHits++;if(slot.state.windHits>=t.values.hits){slot.state.windHits=0;console.log(`[触发] 风，膛位 ${i+1}，移动命中 8 次`);enqueueSlotTrigger(slot,{triggerBonus:0});}}} }
function applyResonanceStats() {const p=game.player;if(!p?.maxHp)return;const r=game.resonanceTotals;p.damage=p.baseDamage*(1+CONFIG.resonance.fireAttackPercent*r.fire);p.speed=p.baseSpeed*(1+CONFIG.resonance.windSpeedPercent*r.wind);p.critChance=CONFIG.resonance.iceCritPercent*r.ice;}
function executeSlotEffect(slot,context={}){
  if(endPlayerRunIfDead()||(!slot.trigger&&!slot.effect))return;
  const effectCooldown=slot.effect?.values?.cooldown??0,elapsed=slot.state.cooldownElapsed??Infinity,tolerance=Number.EPSILON*Math.max(1,effectCooldown)*4;
  if(!context.manualFire&&effectCooldown>0&&elapsed+tolerance<effectCooldown)return;
  if(slot.resonance?.element==='fire')game.screenShakeTimer=Math.max(game.screenShakeTimer||0,0.1);
  if(!context.manualFire){slot.state.cooldownElapsed=0;slot.state.cooldownCompensation=0;}
  const effect=slot.effect,triggerBonus=context.triggerBonus||0,fireMultiplier=1+CONFIG.resonance.fireAttackPercent*(game.resonanceTotals.fire||0),specialMultiplier=context.specialMultiplier||1;
  const damageFor=base=>base*(1+triggerBonus)*fireMultiplier*specialMultiplier;
  const statusOnHit=context.statusOnHit||null,type=effect?.id||'default',attack=createAttackEvent(type==='loop'?'loop-out':type);
  const deal=(target,base,label,attachment=null)=>resolveAttackContact(attack,target,statusOnHit||attachment,()=>applyDamage({kind:'active',label},target,damageFor(base),{}));
  if(!effect){const target=findNearestEnemy(game.player.x,game.player.y);if(target)deal(target,context.damage??CONFIG.defaultParts.projectileDamage,'默认弹丸');return;}
  if(type==='spike'){const target=findNearestEnemy(game.player.x,game.player.y);if(target&&Math.hypot(target.x-game.player.x,target.y-game.player.y)<=CONFIG.weapon.spikeRange)deal(target,effect.values.damage,'长钉',effect.values.statusOnHit);}
  else if(type==='rapid'){const target=findNearestEnemy(game.player.x,game.player.y);if(target)deal(target,effect.values.damage,'连响');}
  else if(type==='loop'){const target=findNearestEnemy(game.player.x,game.player.y);if(target){game.effects.push({type:'loop',from:{x:game.player.x,y:game.player.y},to:{x:target.x,y:target.y},t0:game.time,dur:0.6});deal(target,effect.values.damage,'回环去程');game.pendingReturns.push({target,damage:damageFor(effect.values.damage),statusOnHit,attack:createAttackEvent('loop-return'),due:game.time+0.25});}}
  else if(type==='fire-effect'){
    const direction=getAttackDirection(findNearestEnemy(game.player.x,game.player.y)),angle=effect.values.angle||CONFIG.fire.angle,range=effect.values.range||CONFIG.fire.range;
    game.effects.push({type:'cone',x:game.player.x,y:game.player.y,direction,angle,range,t0:game.time,dur:CONFIG.fire.effectDuration});
    for(const target of getConeTargets(game.player.x,game.player.y,direction,angle,range))deal(target,effect.values.damage,'火元素斩击');
  }
  else if(type==='wind-effect'){
    const target=findNearestEnemy(game.player.x,game.player.y);
    if(target){const x=target.x,y=target.y,targets=game.enemies.filter(enemy=>!enemy.dead&&enemy.hp>0&&Math.hypot(enemy.x-x,enemy.y-y)<=effect.values.radius);
      game.effects.push({kind:'attack-line',fromX:game.player.x,fromY:game.player.y,toX:x,toY:y,timer:CONFIG.combat.hitFlash});
      for(const enemy of targets)resolveAttackContact(attack,enemy,statusOnHit,enemy===target?()=>applyDamage({kind:'active',label:'风膛直击'},enemy,damageFor(effect.values.damage),{}):null);
      game.zones.push({type:'wind',x,y,radius:effect.values.radius,until:game.time*1000+effect.values.duration*1000,dps:damageFor(effect.values.damage),element:'wind'});
    }
  }
  else if(type==='flame'){
    const direction=getAttackDirection(findNearestEnemy(game.player.x,game.player.y)),duration=effect.values.duration||CONFIG.weapon.flameDuration;
    const targets=getConeTargets(game.player.x,game.player.y,direction,120,180);
    for(const target of targets)resolveAttackContact(attack,target,statusOnHit);
    game.effects.push({type:'cone',x:game.player.x,y:game.player.y,direction,angle:120,range:180,t0:game.time,dur:duration});
    game.zones.push({type:'flame',element:'fire',x:game.player.x,y:game.player.y,direction,angle:120,radius:180,until:(game.time+duration)*1000,totalDamage:damageFor(effect.values.damage*duration),totalTicks:Math.round(duration/CONFIG.weapon.areaTick),ticksDone:0,tickInterval:CONFIG.weapon.areaTick,nextTick:game.time+CONFIG.weapon.areaTick});
  }
  else if(type==='ice-effect'){
    const radius=effect.values.radius||100,duration=effect.values.duration||CONFIG.weapon.flameDuration;
    const targets=game.enemies.filter(enemy=>!enemy.dead&&enemy.hp>0&&Math.hypot(enemy.x-game.player.x,enemy.y-game.player.y)<=radius);
    game.effects.push({type:'mist',x:game.player.x,y:game.player.y,r:radius,t0:game.time,dur:3});
    for(const target of targets){resolveAttackContact(attack,target,statusOnHit);target.slowUntil=game.time+duration;applyStatus(target,{status:'slow',duration,source:'ice',params:{amount:effect.values.slow||CONFIG.weapon.iceSlow}});}
  }
  console.log('[膛] '+effect.name+' 发动，膛位 '+(game.slots.indexOf(slot)+1));
}
function enqueueManualFire(){const fire=CONFIG.fire,fireSlots=game.slots.filter(slot=>slot.trigger?.id==='fire-trigger');if(!fireSlots.length||fireSlots.some(slot=>(slot.state.heat||0)<fire.heatThreshold||(game.time-(slot.state.lastTriggerAt??-Infinity))<CONFIG.events.minTriggerInterval))return 0;let released=0;for(const slot of fireSlots){const heat=slot.state.heat||0,triggerBonus=Math.max(0,heat-fire.heatThreshold)*fire.heatBonusPerPoint,statusOnHit=heat===fire.heatMax?{status:'burn',duration:4,source:'fire',params:{damagePerTick:2,tickInterval:1,ticks:4}}:null;if(enqueueSlotTrigger(slot,{manualFire:true,triggerBonus,statusOnHit})){slot.state.heat=0;released++;}}return released;}
function processSlotTriggers(dt){for(let i=0;i<game.slots.length;i++){const slot=game.slots[i],trigger=slot.trigger;if(!trigger&&!slot.effect)continue;if(Number.isFinite(slot.state.cooldownElapsed)){const adjusted=dt-(slot.state.cooldownCompensation||0),total=slot.state.cooldownElapsed+adjusted;slot.state.cooldownCompensation=(total-slot.state.cooldownElapsed)-adjusted;slot.state.cooldownElapsed=total;}if(trigger?.id==='ice-trigger'){if(game.enemies.some(enemy=>!enemy.dead&&hasNegativeStatus(enemy))){slot.state.timer+=dt;while(slot.state.timer>=trigger.values.interval){slot.state.timer-=trigger.values.interval;console.log(`[触发] 冰，膛位 ${i+1}，状态条件满足`);enqueueSlotTrigger(slot,{triggerBonus:trigger.values.damageBonus});}}else slot.state.timer=0;}else if(trigger?.kind==='weapon-trigger'){if(['fast','pendulum','pressure'].includes(trigger.id)){slot.state.timer+=dt;if(slot.state.timer>=trigger.values.interval){slot.state.timer-=trigger.values.interval;console.log(`[触发] ${trigger.name}，膛位 ${i+1}`);enqueueSlotTrigger(slot,{triggerBonus:trigger.values.damageBonus||0});}}}else if(!trigger&&slot.effect){slot.state.timer+=dt;if(slot.state.timer>=CONFIG.defaultParts.triggerInterval){slot.state.timer-=CONFIG.defaultParts.triggerInterval;enqueueSlotTrigger(slot,{triggerBonus:0});}}}}
function applyPlayerDamage(amount,source='敌人'){return applyDamage({kind:'enemy',label:source},game.player,amount,{}).dealt;}function processBossSkills(dt){const b=game.enemies.find(e=>e.type==='boss'&&!e.dead);if(!b)return;b.skillTimer-=dt;if(b.skillTimer>0)return;b.skillTimer=CONFIG.boss.skillInterval;const skill=b.skillIndex++%3;if(skill===0){console.log('[Boss] 技能：冲撞');if(Math.hypot(game.player.x-b.x,game.player.y-b.y)<220){applyPlayerDamage(CONFIG.boss.ramDamage,'Boss 冲撞');if(endPlayerRunIfDead())return;}game.bossNotice='冲撞';}else if(skill===1){console.log('[Boss] 技能：扇形弹幕');const px=game.player.x-b.x,py=game.player.y-b.y,angle=Math.atan2(py,px);for(let i=0;i<CONFIG.boss.fanShots;i++){const a=angle-CONFIG.boss.fanAngle/2+i*CONFIG.boss.fanAngle/(CONFIG.boss.fanShots-1);game.projectiles.push({x:b.x,y:b.y,vx:Math.cos(a)*CONFIG.projectile.speed,vy:Math.sin(a)*CONFIG.projectile.speed,damage:CONFIG.boss.fanDamage,life:CONFIG.boss.fanRange/CONFIG.projectile.speed,bossShot:true});}game.bossNotice='扇形弹幕';}else if(b.summonGroups<CONFIG.boss.summonGroupCount){b.summonGroups++;console.log('[Boss] 技能：召唤');for(let i=0;i<CONFIG.boss.summonPerUse;i++){if(isSharedBurdenActive()){if(countLivingMobs()>=CONFIG.special.sharedBurdenCap)break;game.enemies.push(makeSharedBurdenMob(b));}else game.enemies.push({id:game.nextEntityId++,type:'mob',x:b.x+Math.random()*80-40,y:b.y+Math.random()*80-40,hp:CONFIG.enemy.mobHp,maxHp:CONFIG.enemy.mobHp,speed:CONFIG.enemy.mobSpeed,damage:CONFIG.enemy.mobDamage,radius:CONFIG.combat.mobRadius,slowUntil:0,dead:false,hitTimer:CONFIG.player.hitInterval});}game.bossNotice='召唤';}else console.log('[Boss] 技能：召唤已完成上限');}function updateSharedBurdenSpawner(dt){if(!isSharedBurdenActive())return;const boss=game.enemies.find(enemy=>enemy.type==='boss'&&!enemy.dead&&enemy.hp>0);if(!boss)return;if(countLivingMobs()>=CONFIG.special.sharedBurdenCap)return;if((boss.sharedBurdenQueued||0)>0){spawnSharedBurdenWave(boss,0);if(boss.sharedBurdenQueued>0)return;boss.sharedBurdenTimer=CONFIG.special.sharedBurdenInterval;return;}boss.sharedBurdenTimer=(boss.sharedBurdenTimer??CONFIG.special.sharedBurdenInterval)-dt;if(boss.sharedBurdenTimer<=0){boss.sharedBurdenQueued=CONFIG.special.sharedBurdenBatch;spawnSharedBurdenWave(boss,0);if(boss.sharedBurdenQueued===0)boss.sharedBurdenTimer=CONFIG.special.sharedBurdenInterval;}}function processStatusDots(){for(const enemy of game.enemies){if(enemy.dead)continue;const burn=enemy.dots?.burn;if(!burn)continue;while(burn.ticksRemaining>0&&game.time+1e-9>=burn.nextTick){burn.nextTick+=burn.tickInterval;burn.ticksRemaining--;applyDamage({kind:'dot',label:'点燃持续伤害'},enemy,burn.damagePerTick*(1+CONFIG.resonance.fireAttackPercent*(game.resonanceTotals.fire||0)),{});if(enemy.dead)break;}if(burn.ticksRemaining<=0)delete enemy.dots.burn;}}function processZones(dt){const now=game.time*1000;game.zones=game.zones.filter(zone=>now<=zone.until||zone.type==='flame');for(const zone of game.zones){if(zone.type==='flame'){while(game.time+1e-9>=zone.nextTick&&zone.nextTick*1000<=zone.until){zone.nextTick+=zone.tickInterval;zone.ticksDone++;const tickDamage=zone.totalTicks>0?zone.totalDamage/zone.totalTicks:0;for(const enemy of game.enemies){if(enemy.type==='player'||enemy.dead)continue;const dx=enemy.x-zone.x,dy=enemy.y-zone.y,distance=Math.hypot(dx,dy);if(distance>zone.radius)continue;const angleTo=Math.atan2(dy,dx),diff=Math.atan2(Math.sin(angleTo-zone.direction),Math.cos(angleTo-zone.direction));if(distance===0||Math.abs(diff)<=zone.angle*Math.PI/360)applyDamage({kind:'dot',label:'火舌持续伤害'},enemy,tickDamage,{});}}continue;}const candidates=game.enemies.filter(enemy=>enemy.type!=='player'&&!enemy.dead&&Math.hypot(enemy.x-zone.x,enemy.y-zone.y)<=zone.radius);for(const enemy of candidates){applyDamage({kind:'dot',label:'风膛持续场'},enemy,zone.dps*dt,{});const dx=zone.x-enemy.x,dy=zone.y-enemy.y,distance=Math.hypot(dx,dy);if(distance>0){const step=Math.min(distance,CONFIG.weapon.windPull*dt);enemy.x+=dx/distance*step;enemy.y+=dy/distance*step;}}}game.zones=game.zones.filter(zone=>now<=zone.until);}function processPendingReturns(){const pending=game.pendingReturns;game.pendingReturns=[];for(const event of pending){if(game.time<event.due){game.pendingReturns.push(event);continue;}if(event.target&&!event.target.dead&&event.target.hp>0)resolveAttackContact(event.attack,event.target,event.statusOnHit,()=>applyDamage({kind:'active',label:'回环返程'},event.target,event.damage,{}));}}
function update(dt) { if(game.screen!=='play'||endPlayerRunIfDead())return; const p=game.player,c=CONFIG.combat;p.hitFlash=Math.max(0,(p.hitFlash||0)-dt);game.screenShakeTimer=Math.max(0,(game.screenShakeTimer||0)-dt);for(const slot of game.slots)if(slot.trigger?.id==='fire-trigger')slot.state.heat=Math.min(CONFIG.fire.heatMax,(slot.state.heat||0)+CONFIG.fire.heatPerSecond*dt);if(game.keys.spacePressed){game.keys.spacePressed=false;enqueueManualFire();} const speed=p.speed*dt;const touchDirection=game.touch?.direction||{x:0,y:0};const moveX=touchDirection.x||((game.keys.ArrowRight||game.keys.d?1:0)-(game.keys.ArrowLeft||game.keys.a?1:0)),moveY=touchDirection.y||((game.keys.ArrowDown||game.keys.s?1:0)-(game.keys.ArrowUp||game.keys.w?1:0));if(moveX||moveY){const moveLength=Math.hypot(moveX,moveY);p.facingX=moveX/moveLength;p.facingY=moveY/moveLength;}if(moveX<0)p.x-=speed;if(moveX>0)p.x+=speed;if(moveY<0)p.y-=speed;if(moveY>0)p.y+=speed;p.x=Math.max(c.left,Math.min(c.right,p.x));p.y=Math.max(c.top,Math.min(c.bottom,p.y));game.movementHistory=game.movementHistory||[];game.movementHistory.push({time:game.time,x:p.x,y:p.y});const cutoff=game.time-0.4;while(game.movementHistory.length>2&&game.movementHistory[1].time<cutoff)game.movementHistory.shift(); for(const enemy of game.enemies){if(enemy.dead)continue;const dx=p.x-enemy.x,dy=p.y-enemy.y,d=Math.hypot(dx,dy)||1,slow=enemy.statuses?.slow,slowFactor=(game.time<enemy.slowUntil||slow?.until>game.time)?1-(slow?.amount??CONFIG.weapon.iceSlow):1;enemy.x+=dx/d*enemy.speed*slowFactor*dt;enemy.y+=dy/d*enemy.speed*slowFactor*dt;if(d<enemy.radius+p.radius){enemy.hitTimer-=dt;if(enemy.hitTimer<=0){applyPlayerDamage(enemy.damage,'敌人接触');enemy.hitTimer=CONFIG.player.hitInterval;if(endPlayerRunIfDead())return;}}} separateEnemies();processBossSkills(dt);if(endPlayerRunIfDead())return;updateSharedBurdenSpawner(dt); processSlotTriggers(dt);processZones(dt);processStatusDots();p.attackTimer-=dt;if(p.attackTimer<=0){const target=findNearestEnemy(p.x,p.y);if(target){game.effects.push({kind:'attack-line',fromX:p.x,fromY:p.y,toX:target.x,toY:target.y,timer:CONFIG.combat.hitFlash});resolveAttackContact(createAttackEvent('base'),target,null,()=>applyDamage({kind:'active',label:'基础攻击'},target,p.damage,{}));}p.attackTimer=CONFIG.player.attackInterval;}processPendingReturns(); game.enemies=game.enemies.filter(e=>!e.dead);game.effects=game.effects.filter(e=>e.t0!==undefined||((e.timer-=dt)>0));game.projectiles=game.projectiles.filter(q=>{if(endPlayerRunIfDead())return false;if(q.overflowShot){const target=game.enemies.find(e=>e.id===q.targetId&&!e.dead);if(!target)return false;const dx=target.x-q.x,dy=target.y-q.y,d=Math.hypot(dx,dy)||1;q.vx=dx/d*CONFIG.projectile.speed;q.vy=dy/d*CONFIG.projectile.speed;}q.x+=q.vx*dt;q.y+=q.vy*dt;q.life-=dt;if(q.bossShot&&Math.hypot(q.x-p.x,q.y-p.y)<p.radius+CONFIG.projectile.radius){applyPlayerDamage(q.damage,'Boss 弹幕');return false;}if(q.overflowShot){const target=game.enemies.find(e=>e.id===q.targetId&&!e.dead);if(target&&Math.hypot(target.x-q.x,target.y-q.y)<target.radius+CONFIG.projectile.radius){applyDamage({kind:'overflow',label:'余劲飞弹'},target,q.damage,{});return false;}}return q.life>0;});if(endPlayerRunIfDead())return;processTriggerQueue();if(endPlayerRunIfDead())return;if(game.waveBatchState)updateWaveBatchSchedule();if((game.waveSpawnComplete||game.waveBatchState)&&game.enemies.length===0&&(!game.waveBatchState||game.waveBatchState.nextBatchIndex>=game.waveBatchState.batchSizes.length))finishWave(); }
function text(value,x,y,size=20,color='#f4f1df'){ctx.fillStyle=color;ctx.font=`${size}px Microsoft YaHei, sans-serif`;ctx.fillText(value,x,y);}
function button(label,x,y,w,h,action){ctx.fillStyle='#202d40';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#8ab7d8';ctx.strokeRect(x,y,w,h);text(label,x+20,y+h/2+7,20);game.buttons.push({x,y,w,h,action});}
function getSlotTriggerDisplay(slot){const t=slot.trigger,s=slot.state;if(!t){if(slot.effect){const total=CONFIG.defaultParts.triggerInterval,remaining=Math.max(0,total-s.timer);return `默认冷却 ${remaining.toFixed(1)} / ${total.toFixed(1)} 秒`;}return '未启用';}if(t.id==='fire-trigger')return `热度 ${Math.floor(s.heat||0)} / ${CONFIG.fire.heatMax}（空格≥${CONFIG.fire.heatThreshold}）`;if(t.id==='wind-trigger')return `移动命中 ${s.windHits} / ${t.values.hits}`;if(t.id==='ice-trigger')return '需负面状态 · 0.5 秒';if(t.id==='quota')return `击杀 ${s.kills} / ${t.values.kills}`;if(t.id==='recoil')return '受击时触发';if(typeof t.values?.interval==='number'){const remaining=Math.max(0,t.values.interval-s.timer);const effectCooldown=slot.effect?.values?.cooldown??0,cooldownElapsed=s.cooldownElapsed??Infinity,cooldownRemaining=Math.max(0,effectCooldown-cooldownElapsed),partCooldown=cooldownRemaining>0?` · 膛冷却 ${cooldownRemaining.toFixed(1)}秒`:'';return `剩余 ${remaining.toFixed(1)} / ${t.values.interval.toFixed(1)} 秒${partCooldown}`;}return '待触发';}
function drawHealthBar(x,y,width,height,current,max,color){const ratio=Math.max(0,Math.min(1,max>0?current/max:0));ctx.fillStyle='#321c24';ctx.fillRect(x,y,width,height);ctx.fillStyle=color;ctx.fillRect(x,y,Math.round(width*ratio),height);ctx.strokeStyle='#e7d6c3';ctx.lineWidth=1;ctx.strokeRect(x,y,width,height);}function drawProjectileShape(effect){const remaining=Math.max(0,effect.t0+effect.dur-game.time),alpha=Math.max(0,Math.min(1,remaining/effect.dur));if(effect.type==='cone'){const halfAngle=(effect.angle||120)*Math.PI/360;ctx.globalAlpha=alpha*0.22;ctx.fillStyle='#f07842';ctx.beginPath();ctx.moveTo(Math.round(effect.x),Math.round(effect.y));ctx.arc(Math.round(effect.x),Math.round(effect.y),effect.range,(effect.direction||0)-halfAngle,(effect.direction||0)+halfAngle);ctx.closePath();ctx.fill();ctx.globalAlpha=alpha*0.5;ctx.strokeStyle='#f07842';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(Math.round(effect.x),Math.round(effect.y));ctx.arc(Math.round(effect.x),Math.round(effect.y),effect.range,(effect.direction||0)-halfAngle,(effect.direction||0)+halfAngle);ctx.closePath();ctx.stroke();}else if(effect.type==='loop'){ctx.globalAlpha=alpha;ctx.strokeStyle='#f5c66b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(effect.from.x,effect.from.y);ctx.lineTo(effect.to.x,effect.to.y);ctx.stroke();const outbound=Math.floor((game.time-effect.t0)/0.15)%2===0;ctx.fillStyle=outbound?'#fff0a6':'#7f6330';ctx.fillRect(effect.from.x-4,effect.from.y-4,8,8);ctx.fillStyle=outbound?'#7f6330':'#fff0a6';ctx.fillRect(effect.to.x-4,effect.to.y-4,8,8);}else if(effect.type==='mist'){ctx.globalAlpha=alpha*0.12;ctx.fillStyle='#82cfff';ctx.beginPath();ctx.arc(effect.x,effect.y,effect.r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=alpha*0.5;ctx.strokeStyle='#82cfff';ctx.lineWidth=2;ctx.setLineDash([6,5]);ctx.beginPath();ctx.arc(effect.x,effect.y,effect.r,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}ctx.globalAlpha=1;return remaining<=0;}let canvasPixelRatio=1;
function syncCanvasResolution(){
  const rect=canvas.getBoundingClientRect();
  const displayWidth=Math.max(1,rect.width),displayHeight=Math.max(1,rect.height);
  const nextRatio=Math.min(2,window.devicePixelRatio||1);
  const pixelWidth=Math.max(1,Math.round(displayWidth*nextRatio));
  const pixelHeight=Math.max(1,Math.round(displayHeight*nextRatio));
  if(canvas.width!==pixelWidth)canvas.width=pixelWidth;
  if(canvas.height!==pixelHeight)canvas.height=pixelHeight;
  canvasPixelRatio=nextRatio;
  ctx.setTransform(canvas.width/CONFIG.canvas.width,0,0,canvas.height/CONFIG.canvas.height,0,0);
  ctx.imageSmoothingEnabled=true;
}
function render() {
  syncCanvasResolution();
  ctx.clearRect(0,0,CONFIG.canvas.width,CONFIG.canvas.height);
  game.buttons=[];
  ctx.fillStyle='#101725'; ctx.fillRect(0,0,CONFIG.canvas.width,CONFIG.canvas.height);
  if(game.screen==='menu') {
    text('像素拼装肉鸽',470,220,42,'#f5c66b');
    button('开始',520,310,240,64,()=>{game.player={x:640,y:320,hp:CONFIG.player.maxHp,maxHp:CONFIG.player.maxHp,speed:CONFIG.player.speed,baseSpeed:CONFIG.player.speed,baseDamage:CONFIG.player.baseDamage,attackTimer:0,hitTimer:0,critChance:0,radius:CONFIG.player.radius,facingX:1,facingY:0};enterPrep();});
    button('调试模式',520,394,240,64,()=>{game.screen='debugSetup';});
    text('WASD / 方向键移动',525,510,18,'#a9bdcf');
    ctx.save();ctx.textAlign='center';text('美术素材：DungeonTileset II · 0x72 / GrafxKid（CC0），感谢创作者',640,560,16,'#8798aa');ctx.textAlign='left';ctx.restore(); return;
  }
  if(game.screen==='special-choice'){text('第 4 波奖励：二选一',470,220,30,'#f5c66b');button('同担｜Boss 生命转给召唤小怪',250,320,360,90,()=>chooseSpecial('shared-burden'));button('余劲｜溢出伤害追击',670,320,360,90,()=>chooseSpecial('overflow'));button('返回菜单',20,640,150,48,()=>resetRun());return;}  if(game.screen==='debugSetup'){
    const counts=game.debugConfig.testStartCounts||(game.debugConfig.testStartCounts={});const carryTotal=Object.values(counts).reduce((sum,n)=>sum+Math.max(0,Math.floor(n||0)),0);
    text('调试配置',520,34,28,'#f5c66b');text('起始波次',88,72,15,'#d5e2ec');for(let w=1;w<=8;w++)button(String(w),190+(w-1)*105,79,80,34,()=>{game.debugConfig.startWave=w;});
    text('奖励发放波次（清除指定波后触发三选一）',88,132,15,'#d5e2ec');for(let w=1;w<=8;w++)button(String(w),400+(w-1)*92,138,68,32,()=>{game.debugConfig.testGrantWave=w;});
    text('奖励词条池（勾选后仅用于该波三选一）',88,184,15,'#d5e2ec');
    ITEMS.forEach((item,i)=>{const x=88+(i%6)*188,y=198+Math.floor(i/6)*32,selected=game.debugConfig.testItemIds.includes(item.id);ctx.fillStyle=selected?'#426052':'#202d40';ctx.fillRect(x,y,176,28);ctx.strokeStyle=selected?'#82d6a8':'#627d94';ctx.strokeRect(x,y,176,28);text(`${selected?'✓':'□'} ${item.name}`,x+7,y+19,12,selected?'#c5f2d7':'#f4f1df');game.buttons.push({x,y,w:176,h:28,action:()=>{const ids=game.debugConfig.testItemIds,at=ids.indexOf(item.id);if(at>=0)ids.splice(at,1);else ids.push(item.id);}});});
    text('已勾选奖励词条 '+game.debugConfig.testItemIds.length+' 条',88,268,13,'#a9bdcf');
    text('开局携带词条（每次点 + 增加一份，− 减少；总数上限 10 端）',88,295,15,'#d5e2ec');
    ITEMS.forEach((item,i)=>{const x=88+(i%6)*188,y=311+Math.floor(i/6)*34,count=Math.max(0,Math.floor(counts[item.id]||0));ctx.fillStyle=count?'#3b594d':'#202d40';ctx.fillRect(x,y,176,30);ctx.strokeStyle=count?'#82d6a8':'#627d94';ctx.strokeRect(x,y,176,30);text(`${item.name} ×${count}`,x+6,y+20,12,count?'#c5f2d7':'#d8e0e8');ctx.fillStyle='#304c62';ctx.fillRect(x+119,y+3,24,24);ctx.fillRect(x+148,y+3,24,24);text('−',x+125,y+20,14,'#f4f1df');text('+',x+155,y+20,14,'#f4f1df');game.buttons.push({x:x+119,y:y+3,w:24,h:24,action:()=>{if(counts[item.id]>0){counts[item.id]--;if(!counts[item.id])delete counts[item.id];}}});game.buttons.push({x:x+148,y:y+3,w:24,h:24,action:()=>{if(carryTotal<10)counts[item.id]=(counts[item.id]||0)+1;}});});
    text(`开局携带 ${carryTotal}/10 端${carryTotal>10?'；超出部分将忽略':''}`,88,385,13,carryTotal>10?'#f5a06b':'#a9bdcf');
    button('同担：'+(game.debugConfig.carrySharedBurden?'携带':'不携带'),250,420,250,40,()=>{game.debugConfig.carrySharedBurden=!game.debugConfig.carrySharedBurden;});button('余劲：'+(game.debugConfig.carryOverflow?'携带':'不携带'),530,420,250,40,()=>{game.debugConfig.carryOverflow=!game.debugConfig.carryOverflow;});
    button('进入测试',520,490,240,52,()=>{const wave=game.debugConfig.startWave;resetRun();CONFIG.debug.enabled=true;game.player={x:640,y:320,hp:CONFIG.player.maxHp,maxHp:CONFIG.player.maxHp,speed:CONFIG.player.speed,baseSpeed:CONFIG.player.speed,baseDamage:CONFIG.player.baseDamage,damage:CONFIG.player.baseDamage,attackTimer:0,critChance:0,radius:CONFIG.player.radius,facingX:1,facingY:0,heat:0,heatMax:CONFIG.fire.heatMax};game.wave=wave;game.screen='prep';game.initialPicksRemaining=0;game.choices=[];game.choicePending=false;game.selectedItem=null;const installed=installDebugTestItems();console.log('[调试] 已直接装入测试词条数：'+installed);runSelfChecks();});
    button('返回',20,640,150,48,()=>{game.screen='menu';});return;
  }  if(game.screen==='prep'||game.screen==='choice'){
    text(game.screen==='choice'?`第 ${game.wave} 波完成：三选一并放入膛位`:game.initialPicksRemaining>0?`初始准备选择 ${game.prepChoices}/5`:'准备完成：可开打',32,38,22,'#f5c66b');
    text('每次只选一条；拖放到匹配端点，或先选卡再点击目标格',32,66,15,'#a9bdcf');
    game.choices.forEach((it,i)=>{
      const x=24+i*414,y=82;
      ctx.fillStyle=game.selectedItem?.id===it.id?'#604a2c':'#202d40';ctx.fillRect(x,y,396,74);
      ctx.strokeStyle='#627d94';ctx.strokeRect(x,y,396,74);
      const sideName=it.side==='trigger'?'扳机':'膛';
      const elementName={fire:'火',wind:'风',ice:'冰'}[it.element]||'散件';
      text(it.kind==='element'?`${elementName} · 扳机 / 膛`:`${it.name} · ${sideName}`,x+10,y+23,16,it.element==='fire'?'#f09b62':it.element==='wind'?'#78d6ae':it.element==='ice'?'#8bc9ff':'#f4f1df');
      if(it.kind==='element'){text(`扳机：${it.asTrigger.description}`,x+10,y+44,10,'#b4c3d0');text(`膛：${it.asEffect.desc}`,x+10,y+63,10,'#b4c3d0');}
      else text(it.description,x+10,y+51,13,'#b4c3d0');
      game.buttons.push({x,y,w:292,h:74,itemId:it.id,itemRef:it,action:()=>chooseItem(it.id)});
      game.buttons.push({x:x+300,y:y+5,w:88,h:25,refreshIndex:i,action:()=>refreshChoice(i)});
    });
    for(let i=0;i<game.choices.length;i++){const rx=24+i*414+300,ry=87;ctx.fillStyle=game.choiceRefreshUsed?.[i]?'#303844':'#304c62';ctx.fillRect(rx,ry,88,25);ctx.strokeStyle='#7895aa';ctx.strokeRect(rx,ry,88,25);text(game.choiceRefreshUsed?.[i]?'已刷新':'刷新',rx+22,ry+18,11,game.choiceRefreshUsed?.[i]?'#77828b':'#e3f0f5');}
    if(game.choiceRefreshMessage)text(game.choiceRefreshMessage,960,174,13,'#ff9b85');
    for(let i=0;i<game.slots.length;i++) {
      const x=24+i*246,y=190,slot=game.slots[i];
      ctx.fillStyle='#172435';ctx.fillRect(x,y,232,250);
      const endpointSelected=game.selectedEndpoint?.slotIndex===i;
      ctx.strokeStyle=endpointSelected?'#71c6ff':slot.resonance.layers?'#f5c66b':'#52677c';ctx.lineWidth=endpointSelected?3:1;ctx.strokeRect(x,y,232,250);
      text(`膛位 ${i+1}`,x+10,y+21,15,'#d7e5f2');
      for(const [side,label,offset] of [['trigger','扳机',30],['effect','膛',111]]) {
        const boxY=y+offset;
        ctx.fillStyle='#0e1621';ctx.fillRect(x+8,boxY,216,70);
        ctx.strokeStyle=game.selectedItem?.side===side?'#71c6ff':'#344b60';ctx.strokeRect(x+8,boxY,216,70);
        text(`${label}：${slot[side]?.name||'空'}`,x+16,boxY+25,14);
        const defaultText=side==='trigger'?`默认定时器 ${CONFIG.defaultParts.triggerInterval} 秒`:`默认弹丸伤害 ${CONFIG.defaultParts.projectileDamage}`;
        const shownDescription=slot[side]?.description||(!slot.trigger&&!slot.effect?'未启用':defaultText);
        text(shownDescription,x+16,boxY+49,11,'#aab9c8');
        game.buttons.push(slot[side]?{x:x+8,y:boxY,w:216,h:70,slotIndex:i,side,sourceSlot:i,sourceSide:side,sourceItem:slot[side]}:{x:x+8,y:boxY,w:216,h:70,slotIndex:i,side,action:()=>placeSelectedItem(i,side)});
      }
      text(slot.resonance.layers?`${{fire:'火',wind:'风',ice:'冰'}[slot.resonance.element]} · 合膛 +1`:slot.trigger&&slot.effect?'偏膛':'未合膛',x+10,y+235,13,slot.resonance.layers?'#f5c66b':'#aab9c8');
    }
    const r=game.resonanceTotals;
    text(`总览：火 · 合膛 ×${r.fire}（攻击 +${r.fire*CONFIG.resonance.fireAttackPercent*100}%），风 · 合膛 ×${r.wind}（移速 +${r.wind*CONFIG.resonance.windSpeedPercent*100}%），冰 · 合膛 ×${r.ice}（暴击 +${r.ice*CONFIG.resonance.iceCritPercent*100}%）`,32,480,15,'#d5e2ec');
    text(`构筑：${buildLoadoutSummary()}`,32,506,15,'#a9bdcf');
    if(game.screen==='prep'&&game.initialPicksRemaining===0)button('开打',520,540,240,56,()=>{if(!game.slots.some(s=>s.trigger||s.effect))console.log('[波次] 当前没有工作的膛位');startWave(game.wave);});
    else if(game.screen==='prep')text(`还需放置 ${game.initialPicksRemaining} 条词条`,540,575,15,'#f5c66b');
    if(game.screen==='choice')button('跳过',800,540,140,48,()=>skipChoice());button('返回菜单',20,640,150,48,()=>resetRun());
    if(game.assemblyGesture&&game.pointer){
      const target=findTouchAssemblyTarget(game.pointer),legal=assemblyTargetIsLegal(game.assemblyGesture,target);
      if(target){ctx.strokeStyle=legal?'#75e0a2':'#ff8585';ctx.lineWidth=legal?4:3;ctx.strokeRect(target.x+2,target.y+2,target.w-4,target.h-4);}
      const label=game.assemblyGesture.source.item.name||game.assemblyGesture.source.item.id;
      const previewWidth=Math.max(72,Math.min(168,label.length*18+24)),previewX=Math.max(0,Math.min(CONFIG.canvas.width-previewWidth,game.pointer.x+14)),previewY=Math.max(0,Math.min(CONFIG.canvas.height-38,game.pointer.y+14));
      ctx.globalAlpha=0.88;ctx.fillStyle='#101725';ctx.fillRect(previewX,previewY,previewWidth,34);ctx.globalAlpha=1;ctx.strokeStyle=legal?'#75e0a2':'#ff8585';ctx.lineWidth=2;ctx.strokeRect(previewX,previewY,previewWidth,34);text(label,previewX+10,previewY+23,16);
    }else if(game.dragItem&&game.pointer){ctx.fillStyle='#f5c66b';ctx.fillRect(Math.round(game.pointer.x),Math.round(game.pointer.y),8,8);}
    return;
  }
  ctx.fillStyle='#172435';ctx.fillRect(0,76,CONFIG.canvas.width,420);
  artDrawGround();
  if(game.screen==='gameover'){text(game.result||'本局结束',480,235,36,'#f5c66b');text(`第 ${game.wave} 波｜${buildLoadoutSummary()}`,340,300,20,'#d5e2ec');button('再来一局',520,390,240,56,()=>resetRun());button('返回菜单',520,460,240,56,()=>resetRun());return;}
  text(`生命 ${Math.ceil(game.player.hp)} / ${CONFIG.player.maxHp}`,36,36,16);
  drawHealthBar(36,45,220,14,game.player.hp,CONFIG.player.maxHp,'#54cf83');
  text(`第 ${game.wave} 波｜剩余敌人 ${game.enemies.filter(e=>!e.dead).length}${getWaveBatchHud()}`,700,48,16,'#d5e2ec');
  if(CONFIG.debug.enabled)text(`FPS ${Math.round(game.fps||0)}｜合膛 ${game.slots.map(s=>s.resonance.layers).join('/')}｜火命中 ${game.fireHitCounter||0}｜风目标 ${game.windTargetCounter||0}｜冰损失 ${Math.round(game.iceDamageCounter||0)}`,36,72,13,'#d5e2ec');
  const hasFireTrigger=game.slots.some(slot=>slot.trigger?.id==='fire-trigger');
  if(hasFireTrigger){const fireSlots=game.slots.filter(slot=>slot.trigger?.id==='fire-trigger'),heat=fireSlots[0]?.state.heat||0;text('空格释放',548,36,12,'#f5a06b');text('火热度（各槽）',300,36,14,'#f5a06b');drawHealthBar(390,27,130,12,heat,CONFIG.fire.heatMax,'#f07842');text(`${Math.round(heat)} / ${CONFIG.fire.heatMax}`,528,38,12,'#f5c6a5');}
  ctx.save();if(game.screenShakeTimer>0){const magnitude=3*(game.screenShakeTimer/0.1);ctx.translate((Math.random()*2-1)*magnitude,(Math.random()*2-1)*magnitude);}for(const zone of game.zones){if(zone.type==='flame')continue;const remaining=Math.max(0,zone.until-game.time*1000);const color='#57d9b0',bright=game.resonanceTotals.wind>0;ctx.globalAlpha=0.22;ctx.fillStyle=color;ctx.beginPath();ctx.arc(Math.round(zone.x),Math.round(zone.y),zone.radius,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(Math.round(zone.x),Math.round(zone.y),zone.radius,0,Math.PI*2);ctx.stroke();for(const enemy of game.enemies){if(enemy.dead||enemy.type==='player'||Math.hypot(enemy.x-zone.x,enemy.y-zone.y)>zone.radius)continue;ctx.globalAlpha=bright?0.9:0.4;ctx.strokeStyle=bright?'#d3fff2':'#57d9b0';ctx.lineWidth=bright?3:1;ctx.beginPath();ctx.moveTo(Math.round(enemy.x),Math.round(enemy.y));ctx.lineTo(Math.round(zone.x),Math.round(zone.y));ctx.stroke();}ctx.globalAlpha=1;text(`${(remaining/1000).toFixed(1)}秒`,Math.round(zone.x)-16,Math.round(zone.y)+4,12,color);}
  for(const effect of game.effects.filter(effect=>effect.type==='cone'||effect.type==='mist'))drawProjectileShape(effect);
  for(const enemy of game.enemies){if(enemy.dead||enemy.type==='player')continue;const size=Math.round(enemy.radius*2),x=Math.round(enemy.x-enemy.radius),y=Math.round(enemy.y-enemy.radius);if(enemy.type==='boss'){if(!artDrawActor('bossKnight',enemy,48,84)){ctx.fillStyle='#650f24';ctx.fillRect(x,y,size,size);}const barX=Math.max(4,Math.min(CONFIG.canvas.width-105,Math.round(enemy.x+enemy.radius+8))),barY=Math.round(enemy.y-enemy.radius);drawHealthBar(barX,barY,70,7,enemy.hp,enemy.maxHp,'#d94e65');text(`${Math.ceil(enemy.hp)}/${Math.ceil(enemy.maxHp)}`,barX,barY+22,11,'#ffd9dc');}else{const elite=enemy.type==='elite';const artKey=elite?'eliteOgre':artMobKey(enemy);const ratio=Math.max(0,Math.min(1,enemy.maxHp>0?enemy.hp/enemy.maxHp:0));const dim=artCriticalPhase(ratio,game.time);const drawW=elite?51:artKey==='mobGoblin'?36:27,drawH=elite?57:artKey==='mobGoblin'?36:artKey==='mobOrc'?37.5:45;const drawn=artDrawActor(artKey,enemy,drawW,drawH,dim);if(!drawn){const bright=elite?[166,107,223]:[238,86,86],dark=elite?[52,29,73]:[74,22,28],rgb=bright.map((v,i)=>Math.round(dark[i]+(v-dark[i])*ratio));ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;ctx.fillRect(x,y,size,size);if(ratio<0.2&&Math.floor(game.time*8)%2===0){ctx.strokeStyle=elite?'#e3c9ff':'#ffd3d3';ctx.lineWidth=2;ctx.strokeRect(x-2,y-2,size+4,size+4);}}}}
  if(!artDrawActor('player',game.player,32,56,false,game.player.hitFlash>0)){ctx.fillStyle=game.player.hitFlash>0?'#fff0a6':'#50a8ff';ctx.fillRect(Math.round(game.player.x-12),Math.round(game.player.y-12),24,24);}if(game.player.hitFlash>0){ctx.strokeStyle='#ff6575';ctx.lineWidth=3;ctx.strokeRect(Math.round(game.player.x-15),Math.round(game.player.y-15),30,30);}
  for(const shot of game.projectiles){ctx.fillStyle=shot.bossShot?'#ff8799':'#f5c66b';ctx.fillRect(Math.round(shot.x-3),Math.round(shot.y-3),6,6);}
  for(const effect of game.effects){if(effect.kind!=='attack-line'&&effect.kind!=='impact')continue;const alpha=Math.max(0,Math.min(1,effect.timer/CONFIG.combat.hitFlash));ctx.globalAlpha=alpha;if(effect.kind==='attack-line'){ctx.strokeStyle='#fff0a6';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(Math.round(effect.fromX),Math.round(effect.fromY));ctx.lineTo(Math.round(effect.toX),Math.round(effect.toY));ctx.stroke();}else{ctx.strokeStyle='#fff0a6';ctx.lineWidth=2;ctx.strokeRect(Math.round(effect.x-8),Math.round(effect.y-8),16,16);}ctx.globalAlpha=1;}
  for(const effect of game.effects.filter(effect=>effect.type==='loop'))drawProjectileShape(effect);
  for(const number of game.damageNumbers||[]){const remaining=number.t0+number.dur-game.time;if(remaining<=0)continue;ctx.globalAlpha=Math.max(0,Math.min(1,remaining/number.dur));ctx.fillStyle=number.iceResonance?'#91e8ff':number.critical?'#ffd166':'#f5f1df';ctx.font=`${number.critical?'bold ':''}${number.critical?18:14}px Microsoft YaHei, sans-serif`;ctx.textAlign='center';ctx.fillText(`${number.critical?'!':''}${number.value}`,Math.round(number.x),Math.round(number.y-18*(1-remaining/number.dur)));ctx.textAlign='left';ctx.globalAlpha=1;}game.damageNumbers=(game.damageNumbers||[]).filter(number=>game.time<number.t0+number.dur);game.effects=game.effects.filter(effect=>effect.t0===undefined||game.time<effect.t0+effect.dur);ctx.restore();text(`构筑：${buildLoadoutSummary()}`,36,535,15,'#d5e2ec');if(game.bossNotice){text(`Boss：${game.bossNotice}`,900,535,15,'#f08080');game.bossNotice=null;}
  for(let i=0;i<game.slots.length;i++){const slot=game.slots[i],x=24+i*246,y=552;ctx.fillStyle='#111c2a';ctx.fillRect(x,y,232,112);ctx.strokeStyle=slot.resonance.layers?'#f5c66b':'#52677c';ctx.lineWidth=slot.resonance.layers?2:1;ctx.strokeRect(x,y,232,112);text(`膛位 ${i+1}${slot.resonance.layers?' · 合膛 +1':''}`,x+8,y+17,12,slot.resonance.layers?'#f5c66b':'#d7e5f2');text(`扳机：${slot.trigger?.name||'默认'}`,x+8,y+38,12);text(getSlotTriggerDisplay(slot),x+8,y+59,11,'#b4c3d0');text(`膛：${slot.effect?.name||'默认'}`,x+8,y+81,12);}

  button('返回菜单',1050,674,200,34,()=>resetRun());}function resetRun(){game.nextAttackId=1;game.damageEventCount=0;game.lastDamageEvent=null;game.waveBatchState=null;game.screen='menu';game.criticalHits=0;game.criticalRolls=0;CONFIG.debug.enabled=false;game.activeSpecials=[];game.wave=1;game.player={x:640,y:360,hp:CONFIG.player.maxHp,maxHp:CONFIG.player.maxHp,speed:CONFIG.player.speed,baseSpeed:CONFIG.player.speed,baseDamage:CONFIG.player.baseDamage,damage:CONFIG.player.baseDamage,attackTimer:0,critChance:0,radius:CONFIG.player.radius,facingX:1,facingY:0,heat:0,heatMax:CONFIG.fire.heatMax};game.enemies=[];game.projectiles=[];game.effects=[];game.damageNumbers=[];game.screenShakeTimer=0;game.areas=[];game.zones=[];game.pendingReturns=[];game.waveBatchState=null;game.triggerQueue=[];game.currentTriggerDepth=0;game.triggerProcessing=false;game.droppedTriggerEvents=0;game.droppedPerFrame=0;game.droppedDepth=0;game.waveDropBaseline={total:0,perFrame:0,depth:0};game.slots=createEmptySlots();game.resonanceTotals={fire:0,wind:0,ice:0};game.selectedItem=null;game.prepChoices=0;game.initialPicksRemaining=0;game.choices=[];game.choicePending=false;game.nextEntityId=1;game.kills=0;game.hitCount=0;game.fireHitCounter=0;game.windTargetCounter=0;game.iceDamageCounter=0;game.waveComplete=false;game.waveSpawnComplete=false;game.movementHistory=[];game.selectedEndpoint=null;clearTouchControls();}
function frame(now){const dt=Math.min((now-game.last)/1000||0,.05);game.fps=dt>0?1/dt:0;game.last=now;game.time+=dt;if(game.assemblyGesture&&game.screen!==game.assemblyGesture.screen)finishTouchAssemblyGesture(true);const controls=document.getElementById('touch-controls');if(controls)controls.hidden=game.screen!=='play';update(dt);render();requestAnimationFrame(frame);}
window.addEventListener('keydown',e=>{if(e.code==='Space'||e.key===' '){if(game.screen==='play'&&!e.repeat)game.keys.spacePressed=true;e.preventDefault();return;}game.keys[e.key]=true;});window.addEventListener('keyup',e=>{if(e.code==='Space'||e.key===' '){game.keys.spacePressed=false;e.preventDefault();return;}game.keys[e.key]=false;});
function pointerPosition(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*CONFIG.canvas.width/r.width,y:(e.clientY-r.top)*CONFIG.canvas.height/r.height};}
function isPortraitViewport(){return window.matchMedia?.('(orientation: portrait)').matches??(window.innerHeight>window.innerWidth);}
function findCanvasButton(point){return game.buttons.find(button=>point.x>=button.x&&point.x<=button.x+button.w&&point.y>=button.y&&point.y<=button.y+button.h);}
function clearPrepSelection(){game.selectedItem=null;game.selectedEndpoint=null;game.dragItem=null;game.dragOrigin=null;game.pointer=null;}
function finishTouchAssemblyGesture(clearSelection=true){
  const gesture=game.assemblyGesture;if(!gesture)return false;
  game.assemblyGesture=null;game.touchTap=null;game.dragItem=null;game.dragOrigin=null;game.pointer=null;
  if(clearSelection)clearPrepSelection();
  try{if(canvas.hasPointerCapture?.(gesture.pointerId))canvas.releasePointerCapture?.(gesture.pointerId);}catch{}
  return true;
}
function touchButtonMatches(start,current){
  if(!start||!current)return start===current;
  const keys=['itemId','itemRef','refreshIndex','slotIndex','side','sourceSlot','sourceSide','sourceItem'];
  return Math.abs(start.x-current.x)<0.01&&Math.abs(start.y-current.y)<0.01&&Math.abs(start.w-current.w)<0.01&&Math.abs(start.h-current.h)<0.01&&keys.every(key=>start[key]===current[key]);
}
function assemblySourceFromButton(button){
  if(game.screen!=='prep'&&game.screen!=='choice')return null;
  if(button?.itemId){const index=game.choices.findIndex(item=>item.id===button.itemId);if(index<0)return null;return {kind:'choice',item:game.choices[index],choiceIndex:index,choicesRef:game.choices,choiceSnapshot:game.choices.slice(),wave:game.wave,initialPicksRemaining:game.initialPicksRemaining,choicePending:game.choicePending};}
  if(button?.sourceSlot!==undefined&&button.sourceSide){const item=game.slots[button.sourceSlot]?.[button.sourceSide];if(!item||item!==button.sourceItem)return null;return {kind:'placed',slotIndex:button.sourceSlot,side:button.sourceSide,item};}
  return null;
}
function assemblySourceIsCurrent(gesture){
  if(!gesture||game.screen!==gesture.screen||game.screen!=='prep'&&game.screen!=='choice')return false;
  const source=gesture.source;
  if(source.kind==='choice')return game.choices===source.choicesRef&&game.wave===source.wave&&game.initialPicksRemaining===source.initialPicksRemaining&&game.choicePending===source.choicePending&&game.choices.length===source.choiceSnapshot.length&&source.choiceSnapshot.every((item,index)=>game.choices[index]===item)&&game.choices[source.choiceIndex]===source.item;
  return game.slots[source.slotIndex]?.[source.side]===source.item;
}
function assemblyTargetIsLegal(gesture,target){
  if(!assemblySourceIsCurrent(gesture)||target?.slotIndex===undefined||!['trigger','effect'].includes(target.side))return false;
  const source=gesture.source,destination=game.slots[target.slotIndex];if(!destination)return false;
  if(source.kind==='choice')return source.item.kind==='element'||source.item.side===target.side;
  if(source.slotIndex===target.slotIndex&&source.side===target.side)return false;
  if(!resolvePlacedItemForSide(source.item,target.side))return false;
  const occupied=destination[target.side];return !occupied||!!resolvePlacedItemForSide(occupied,source.side);
}
function findTouchAssemblyTarget(point){return game.buttons.find(button=>button.slotIndex!==undefined&&point.x>=button.x&&point.x<=button.x+button.w&&point.y>=button.y&&point.y<=button.y+button.h)||null;}
function startTouchAssemblyGesture(tap){
  if(!tap?.source||!assemblySourceIsCurrent({source:tap.source,screen:tap.screen}))return false;
  game.selectedItem=null;game.selectedEndpoint=null;game.touchTap=null;
  game.assemblyGesture={pointerId:tap.pointerId,screen:tap.screen,source:tap.source};
  game.dragItem=tap.source.item;game.dragOrigin=null;game.pointer=pointerPosition({clientX:tap.lastX,clientY:tap.lastY});return true;
}
function commitTouchAssemblyGesture(gesture,point){
  if(!assemblySourceIsCurrent(gesture))return false;
  const target=findTouchAssemblyTarget(point);if(!assemblyTargetIsLegal(gesture,target))return false;
  if(gesture.source.kind==='choice'){
    game.selectedItem=gesture.source.item;
    return placeSelectedItem(target.slotIndex,target.side);
  }
  return movePlacedItem(gesture.source.slotIndex,gesture.source.side,target.slotIndex,target.side);
}
function activateTouchButton(button){
  if(game.screen==='prep'||game.screen==='choice'){
    if(button?.itemId){chooseItem(button.itemId);game.selectedEndpoint=null;return;}
    if(button?.slotIndex!==undefined){
      if(game.selectedItem){placeSelectedItem(button.slotIndex,button.side);return;}
      if(game.selectedEndpoint){const source=game.selectedEndpoint;game.selectedEndpoint=null;if(source.slotIndex!==button.slotIndex||source.side!==button.side)movePlacedItem(source.slotIndex,source.side,button.slotIndex,button.side);return;}
      if(button.sourceSlot!==undefined){game.selectedEndpoint={slotIndex:button.sourceSlot,side:button.sourceSide};return;}
    }
    if(button?.action){button.action();return;}
    clearPrepSelection();return;
  }
  if(button?.action)button.action();
}
function clearTouchControls(){
  finishTouchAssemblyGesture(true);
  const touch=game.touch;if(touch.movePointer!==null||touch.firePointer!==null){game.keys.ArrowUp=false;game.keys.ArrowDown=false;game.keys.ArrowLeft=false;game.keys.ArrowRight=false;}
  touch.movePointer=null;touch.firePointer=null;game.touchTap=null;game.touch.direction={x:0,y:0};game.keys.spacePressed=false;
  const nub=document.getElementById('move-nub');if(nub)nub.style.transform='translate(-50%,-50%)';
}
function setTouchDirection(event){
  const control=document.getElementById('move-control');if(!control)return;
  const rect=control.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
  const dx=event.clientX-cx,dy=event.clientY-cy,radius=Math.min(rect.width,rect.height)*0.36,distance=Math.hypot(dx,dy);
  const scale=distance>radius?radius/distance:1,nx=dx*scale,ny=dy*scale,nub=document.getElementById('move-nub');
  if(nub)nub.style.transform="translate(calc(-50% + "+nx+"px),calc(-50% + "+ny+"px))";
  const inDeadZone=distance<rect.width*0.22,octant=Math.round(Math.atan2(dy,dx)/(Math.PI/4));
  const directions=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const vector=inDeadZone?[0,0]:directions[((octant%8)+8)%8];
  game.touch.direction={x:vector[0],y:vector[1]};
  game.keys.ArrowRight=vector[0]>0;game.keys.ArrowLeft=vector[0]<0;game.keys.ArrowDown=vector[1]>0;game.keys.ArrowUp=vector[1]<0;
}
canvas.addEventListener('pointerdown',e=>{
  if(game.assemblyGesture&&game.assemblyGesture.pointerId!==e.pointerId){e.preventDefault();return;}
  if(e.pointerType==='touch'&&isPortraitViewport()){e.preventDefault();return;}
  const point=pointerPosition(e),button=findCanvasButton(point);
  if(e.pointerType==='touch'){
    e.preventDefault();
    if(game.assemblyGesture||(game.touchTap&&game.touchTap.pointerId!==e.pointerId))return;
    canvas.setPointerCapture?.(e.pointerId);
    const source=assemblySourceFromButton(button);
    game.touchTap={pointerId:e.pointerId,button,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false,screen:game.screen,source};
    return;
  }
  if(!button)return;
  if(button.sourceSlot!==undefined){game.dragOrigin={slotIndex:button.sourceSlot,side:button.sourceSide,item:button.sourceItem};game.dragItem=button.sourceItem;game.selectedItem=null;canvas.setPointerCapture?.(e.pointerId);}
  else if(button.itemId){game.dragOrigin=null;game.dragItem=ITEMS.find(item=>item.id===button.itemId);game.selectedItem=game.dragItem;canvas.setPointerCapture?.(e.pointerId);}
  else if(!game.dragItem)button.action?.();
});
canvas.addEventListener('pointermove',e=>{
  if(game.assemblyGesture&&game.assemblyGesture.pointerId!==e.pointerId)return;
  if(game.touchTap?.pointerId===e.pointerId){
    const tap=game.touchTap;tap.lastX=e.clientX;tap.lastY=e.clientY;
    if(Math.hypot(e.clientX-tap.startX,e.clientY-tap.startY)>12){
      tap.moved=true;
      if(tap.source)startTouchAssemblyGesture(tap);
    }
  }
  if(game.assemblyGesture?.pointerId===e.pointerId){
    if(!assemblySourceIsCurrent(game.assemblyGesture)){finishTouchAssemblyGesture(true);return;}
    const point=pointerPosition(e);game.pointer=point;
  }else if(game.dragItem){const point=pointerPosition(e);game.pointer={x:point.x,y:point.y};}
});
canvas.addEventListener('pointerup',e=>{
  if(game.assemblyGesture&&game.assemblyGesture.pointerId!==e.pointerId)return;
  if(game.assemblyGesture?.pointerId===e.pointerId){const gesture=game.assemblyGesture;commitTouchAssemblyGesture(gesture,pointerPosition(e));finishTouchAssemblyGesture(true);return;}
  if(game.touchTap?.pointerId===e.pointerId){const tap=game.touchTap;const distance=Math.hypot(e.clientX-tap.startX,e.clientY-tap.startY);if(!tap.moved&&distance>12&&tap.source){tap.moved=true;tap.lastX=e.clientX;tap.lastY=e.clientY;startTouchAssemblyGesture(tap);}if(game.assemblyGesture?.pointerId===e.pointerId){const gesture=game.assemblyGesture;commitTouchAssemblyGesture(gesture,pointerPosition(e));finishTouchAssemblyGesture(true);return;}game.touchTap=null;if(!tap.moved&&game.screen===tap.screen){const point=pointerPosition(e),target=findCanvasButton(point);if(touchButtonMatches(tap.button,target))activateTouchButton(target);}return;}
  if(!game.dragItem)return;const point=pointerPosition(e),button=game.buttons.find(value=>value.slotIndex!==undefined&&point.x>=value.x&&point.x<=value.x+value.w&&point.y>=value.y&&point.y<=value.y+value.h);if(button){if(game.dragOrigin)movePlacedItem(game.dragOrigin.slotIndex,game.dragOrigin.side,button.slotIndex,button.side);else placeSelectedItem(button.slotIndex,button.side);}game.dragItem=null;game.dragOrigin=null;game.pointer=null;
});
canvas.addEventListener('pointercancel',e=>{
  if(game.assemblyGesture){if(game.assemblyGesture.pointerId===e.pointerId)finishTouchAssemblyGesture(true);return;}
  if(game.touchTap){if(game.touchTap.pointerId===e.pointerId)game.touchTap=null;return;}
  if(e.pointerType==='touch')return;
  game.dragItem=null;game.dragOrigin=null;game.pointer=null;
});
canvas.addEventListener('lostpointercapture',e=>{if(game.assemblyGesture){if(game.assemblyGesture.pointerId===e.pointerId)finishTouchAssemblyGesture(true);return;}if(game.touchTap?.pointerId===e.pointerId)game.touchTap=null;});
const moveControl=document.getElementById('move-control'),fireControl=document.getElementById('fire-control');
moveControl?.addEventListener('pointerdown',e=>{if(isPortraitViewport()||game.screen!=='play')return;e.preventDefault();e.stopPropagation();if(game.touch.movePointer!==null)return;game.touch.movePointer=e.pointerId;moveControl.setPointerCapture?.(e.pointerId);setTouchDirection(e);});
moveControl?.addEventListener('pointermove',e=>{if(game.touch.movePointer!==e.pointerId)return;e.preventDefault();setTouchDirection(e);});
function releaseMovePointer(e){if(game.touch.movePointer!==e.pointerId)return;game.touch.movePointer=null;game.touch.direction={x:0,y:0};game.keys.ArrowUp=false;game.keys.ArrowDown=false;game.keys.ArrowLeft=false;game.keys.ArrowRight=false;const nub=document.getElementById('move-nub');if(nub)nub.style.transform='translate(-50%,-50%)';}
moveControl?.addEventListener('pointerup',releaseMovePointer);moveControl?.addEventListener('pointercancel',releaseMovePointer);moveControl?.addEventListener('lostpointercapture',releaseMovePointer);
window.addEventListener('pointermove',e=>{if(game.touch.movePointer===e.pointerId){e.preventDefault();setTouchDirection(e);}}, {passive:false});window.addEventListener('pointerup',releaseMovePointer);window.addEventListener('pointercancel',releaseMovePointer);
fireControl?.addEventListener('pointerdown',e=>{if(isPortraitViewport()||game.screen!=='play')return;e.preventDefault();e.stopPropagation();if(game.touch.firePointer!==null)return;game.touch.firePointer=e.pointerId;fireControl.setPointerCapture?.(e.pointerId);game.keys.spacePressed=true;});
function releaseFirePointer(e){if(game.touch.firePointer===e.pointerId)game.touch.firePointer=null;}
fireControl?.addEventListener('pointerup',releaseFirePointer);fireControl?.addEventListener('pointercancel',releaseFirePointer);fireControl?.addEventListener('lostpointercapture',releaseFirePointer);
window.addEventListener('blur',()=>{clearTouchControls();game.keys={};game.keys.spacePressed=false;});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTouchControls();game.keys={};game.keys.spacePressed=false;}});
window.addEventListener('orientationchange',clearTouchControls);window.addEventListener('resize',clearTouchControls);
window.visualViewport?.addEventListener('resize',clearTouchControls);

resetRun();recalculateAllResonance();requestAnimationFrame(frame);



















































































































