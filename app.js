import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TOOLS, CATEGORIES } from './tools.js';
import { search } from './search.js';

const $ = s => document.querySelector(s);
const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
const isMobile = matchMedia('(max-width: 760px)').matches || matchMedia('(pointer: coarse)').matches;

/* ---------- memoria local ---------- */
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('tb3d.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tb3d.' + k, JSON.stringify(v)); } catch {} },
};
let favs = new Set(store.get('favs', []));
let recent = store.get('recent', []);
const saveFavs = () => store.set('favs', [...favs]);
function markOpened(id) { recent = [id, ...recent.filter(x => x !== id)].slice(0, 8); store.set('recent', recent); renderChips(); if (listMode) renderList(); }
function toggleFav(id) { favs.has(id) ? favs.delete(id) : favs.add(id); saveFavs(); refreshSprite(id); renderChips(); if (listMode) renderList(); if (selected?.id === id) showPanel(selected); }

/* ---------- estado ---------- */
let listMode = false, selected = null, hovered = null, hits = new Set(), activeChip = 'all';
let three = null;

/* ---------- 3D ---------- */
function webglOK() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }

function makeCardTexture(t) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 300;
  const g = c.getContext('2d'); const col = CAT[t.cat].color;
  const grd = g.createRadialGradient(128, 112, 10, 128, 112, 112);
  grd.addColorStop(0, col + 'ee'); grd.addColorStop(.45, col + '55'); grd.addColorStop(1, col + '00');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 230);
  g.beginPath(); g.arc(128, 112, 62, 0, Math.PI * 2); g.fillStyle = 'rgba(8,10,28,.88)'; g.fill();
  g.lineWidth = 5; g.strokeStyle = col; g.stroke();
  g.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t.emoji, 128, 116);
  if (favs.has(t.id)) { g.font = '40px sans-serif'; g.fillStyle = '#ffd34d'; g.fillText('★', 196, 52); }
  let name = t.name, fs = 34; g.font = `700 ${fs}px system-ui,sans-serif`;
  while (g.measureText(name).width > 246 && fs > 18) { fs -= 2; g.font = `700 ${fs}px system-ui,sans-serif`; }
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(name, 130, 262);
  g.fillStyle = '#e9ecff'; g.fillText(name, 128, 260);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
function makeLabelTexture(cat) {
  const c = document.createElement('canvas'); c.width = 640; c.height = 96; const g = c.getContext('2d');
  g.font = '700 46px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = cat.color; g.shadowBlur = 18; g.fillStyle = cat.color; g.fillText(`${cat.emoji} ${cat.name}`, 320, 50);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.25, 'rgba(255,255,255,.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
function fib(i, n) { const y = 1 - (i + .5) / n * 2, r = Math.sqrt(1 - y * y), th = Math.PI * (3 - Math.sqrt(5)) * i; return new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r); }

function init3D() {
  const host = $('#scene');
  const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.75 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x05060f, 0.0045);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .1, 2000);
  const homeDist = () => (innerWidth / innerHeight < .8 ? 200 : 135);
  camera.position.set(0, 30, homeDist());

  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: .07, autoRotate: true, autoRotateSpeed: .45, minDistance: 8, maxDistance: 320, enablePan: !isMobile, rotateSpeed: .6 });

  // estrellas
  const N = isMobile ? 2500 : 5000, pos = new Float32Array(N * 3), cols = new Float32Array(N * 3), cc = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const v = fib(i, N).multiplyScalar(250 + Math.random() * 450); pos.set([v.x, v.y, v.z], i * 3);
    cc.setHSL(.55 + Math.random() * .3, .6, .6 + Math.random() * .4); cols.set([cc.r, cc.g, cc.b], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, vertexColors: true, transparent: true, opacity: .9, depthWrite: false, fog: false }));
  scene.add(stars);

  // polvo / nebulosa
  const glow = glowTexture();
  for (let i = 0; i < 14; i++) {
    const m = new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(CATEGORIES[i % 10].color), transparent: true, opacity: .045, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const s = new THREE.Sprite(m); s.position.copy(fib(i, 14).multiplyScalar(120 + Math.random() * 60)); s.scale.setScalar(160 + Math.random() * 120); scene.add(s);
  }

  // núcleo
  const galaxy = new THREE.Group(); scene.add(galaxy);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(6, 1), new THREE.MeshBasicMaterial({ color: 0x8f7bff, wireframe: true, transparent: true, opacity: .55 }));
  const coreIn = new THREE.Mesh(new THREE.SphereGeometry(3.2, 32, 16), new THREE.MeshBasicMaterial({ color: 0xbfb2ff }));
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x7c5cff, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending }));
  coreGlow.scale.setScalar(34); galaxy.add(core, coreIn, coreGlow);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(11, .12, 8, 120), new THREE.MeshBasicMaterial({ color: 0x2ee6d6 }));
  ring.rotation.x = Math.PI / 2.3; galaxy.add(ring);

  // cúmulos por categoría
  const sprites = [], byId = {}, clusters = {};
  CATEGORIES.forEach((cat, ci) => {
    const center = fib(ci, CATEGORIES.length).multiplyScalar(58);
    const grp = new THREE.Group(); grp.position.copy(center); galaxy.add(grp);
    const items = TOOLS.filter(t => t.cat === cat.id);
    const col = new THREE.Color(cat.color);
    const lineG = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), center]);
    galaxy.add(new THREE.Line(lineG, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: .28 })));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: col, transparent: true, opacity: .22, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(30); grp.add(halo);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(cat), transparent: true, depthWrite: false }));
    label.scale.set(20, 3, 1); label.position.set(0, 13.5, 0); grp.add(label);
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(9.5, .06, 6, 90), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .5 }));
    orbit.lookAt(center.clone().multiplyScalar(2)); grp.add(orbit);
    clusters[cat.id] = { grp, center, label, halo, orbit, n: items.length };
    items.forEach((t, i) => {
      const local = items.length === 1 ? new THREE.Vector3() : fib(i, items.length).multiplyScalar(items.length <= 3 ? 6 : 8.5);
      const mat = new THREE.SpriteMaterial({ map: makeCardTexture(t), transparent: true, depthWrite: false });
      const sp = new THREE.Sprite(mat); sp.position.copy(local); sp.scale.set(6, 7.03, 1);
      sp.userData = { tool: t, base: local.clone(), phase: Math.random() * 6.28, s: 1, o: 1 };
      grp.add(sp); sprites.push(sp); byId[t.id] = sp;
    });
  });

  // post-procesado (brillo tipo bloom)
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .6, .5, .6);
  composer.addPass(bloom); composer.addPass(new OutputPass());

  // interacción
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  let downAt = null;
  const pick = (x, y) => { mouse.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera); const h = ray.intersectObjects(sprites, false); return h.find(o => o.object.material.opacity > .3)?.object || null; };
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY, performance.now()]; controls.autoRotate = false; });
  el.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const sp = pick(e.clientX, e.clientY); hovered = sp?.userData.tool.id || null;
    el.style.cursor = sp ? 'pointer' : 'grab';
    const tip = $('#tooltip');
    if (sp) { const t = sp.userData.tool; tip.innerHTML = `<b>${t.emoji} ${t.name}</b><small>${t.desc}</small>`; tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px'; tip.hidden = false; }
    else tip.hidden = true;
  });
  el.addEventListener('pointerleave', () => { hovered = null; $('#tooltip').hidden = true; });
  el.addEventListener('pointerup', e => {
    if (!downAt) return; const [x, y, t0] = downAt; downAt = null;
    if (Math.hypot(e.clientX - x, e.clientY - y) > 8 || performance.now() - t0 > 600) return;
    const sp = pick(e.clientX, e.clientY);
    if (!sp) return;
    const t = sp.userData.tool;
    if (selected?.id === t.id) { openTool(t); return; } // segundo toque abre
    selectTool(t);
  });

  // transiciones de cámara
  let tween = null;
  function flyTo(target, dist, dur = 1100, dirIn = null, shift = 0) {
    const dir = dirIn ? dirIn.clone().normalize() : (target.lengthSq() < 1 ? camera.position.clone().normalize() : target.clone().normalize().add(new THREE.Vector3(0, .25, 0)).normalize());
    const look = target.clone();
    if (shift) look.add(new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(-shift));
    const endPos = look.clone().add(dir.multiplyScalar(dist));
    tween = { t0: performance.now(), dur, p0: camera.position.clone(), p1: endPos, c0: controls.target.clone(), c1: look };
    controls.autoRotate = false;
  }
  const worldOf = id => byId[id].getWorldPosition(new THREE.Vector3());
  function focusTool(id) {
    const p = worldOf(id), cc = clusters[byId[id].userData.tool.cat].center;
    const local = p.clone().sub(cc); const dir = p.clone().normalize().multiplyScalar(.7).add(local.lengthSq() > .1 ? local.normalize().multiplyScalar(.8) : new THREE.Vector3()).add(new THREE.Vector3(0, .25, 0));
    const wide = innerWidth > 760;
    flyTo(p, innerWidth / innerHeight < .8 ? 34 : 27, 1100, dir, wide ? 7 : 0);
  }
  function focusIds(ids) {
    if (!ids.length) return;
    if (ids.length === 1) return focusTool(ids[0]);
    const c = new THREE.Vector3(); ids.forEach(id => c.add(worldOf(id))); c.divideScalar(ids.length);
    let r = 0; ids.forEach(id => r = Math.max(r, worldOf(id).distanceTo(c)));
    flyTo(c, Math.max(30, r * 2.6) * (innerWidth / innerHeight < .8 ? 1.5 : 1));
  }
  function focusCat(cid) { flyTo(clusters[cid].center.clone(), innerWidth / innerHeight < .8 ? 52 : 38); }
  function home() { tween = { t0: performance.now(), dur: 1200, p0: camera.position.clone(), p1: new THREE.Vector3(0, 30, homeDist()), c0: controls.target.clone(), c1: new THREE.Vector3() }; setTimeout(() => controls.autoRotate = true, 1300); }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  });

  // bucle
  const clock = new THREE.Clock(); let frames = 0;
  const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  function loop() {
    const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
    core.rotation.y += dt * .3; core.rotation.x += dt * .12; ring.rotation.z += dt * .4;
    coreGlow.material.opacity = .75 + Math.sin(t * 2) * .15; stars.rotation.y += dt * .004;
    for (const k in clusters) clusters[k].orbit.rotation.z += dt * .25;
    const anySel = hits.size > 0;
    for (const sp of sprites) {
      const u = sp.userData, id = u.tool.id;
      const inChip = activeChip === 'all' || (activeChip === 'favs' ? favs.has(id) : activeChip === 'recent' ? recent.includes(id) : u.tool.cat === activeChip);
      const isHit = hits.has(id), isSel = selected?.id === id, isHov = hovered === id;
      let ts = 1, to = 1;
      if (anySel) { ts = isHit ? 1.45 + Math.sin(t * 4 + u.phase) * .08 : .75; to = isHit ? 1 : .12; }
      else if (!inChip) { ts = .7; to = .1; }
      if (isHov) ts *= 1.25; if (isSel) { ts = Math.max(ts, 1.75); to = 1; }
      u.s += (ts - u.s) * Math.min(1, dt * 8); u.o += (to - u.o) * Math.min(1, dt * 8);
      sp.scale.set(6 * u.s, 7.03 * u.s, 1); sp.material.opacity = u.o;
      sp.position.set(u.base.x, u.base.y + Math.sin(t * .9 + u.phase) * .35, u.base.z);
    }
    if (tween) {
      const k = Math.min(1, (performance.now() - tween.t0) / tween.dur), e = ease(k);
      camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.c0, tween.c1, e);
      if (k >= 1) tween = null;
    }
    controls.update(); composer.render();
    if (++frames === 3) { window.__ready = true; $('#loading').classList.add('gone'); }
    requestAnimationFrame(loop);
  }
  loop();
  return { focusTool, focusIds, focusCat, home, byId, refresh: id => { const sp = byId[id]; sp.material.map.dispose(); sp.material.map = makeCardTexture(sp.userData.tool); }, renderer };
}
function refreshSprite(id) { three?.refresh(id); }

/* ---------- UI ---------- */
function openTool(t) { markOpened(t.id); window.open(t.url, '_blank', 'noopener'); }
function selectTool(t) { selected = t; showPanel(t); three?.focusTool(t.id); if (listMode) document.getElementById('card-' + t.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
function showPanel(t) {
  const c = CAT[t.cat];
  $('#pEmoji').textContent = t.emoji; $('#pCat').textContent = `${c.emoji} ${c.name}`; $('#pCat').style.color = c.color;
  $('#pName').textContent = t.name; $('#pDesc').textContent = t.desc; $('#pUrl').textContent = t.url.replace(/^https?:\/\//, '');
  const a = $('#pOpen'); a.href = t.url; a.onclick = () => markOpened(t.id);
  const f = $('#pFav'); f.textContent = favs.has(t.id) ? '★ En favoritos' : '☆ Favorito'; f.classList.toggle('on', favs.has(t.id)); f.onclick = () => toggleFav(t.id);
  $('.ptip').hidden = listMode; $('#panel').hidden = false;
}
function closePanel() { $('#panel').hidden = true; selected = null; }

function renderChips() {
  const chips = [['all', '✨ Todas', '#ffffff'], ...(favs.size ? [['favs', `★ Favoritos (${favs.size})`, '#ffd34d']] : []), ...(recent.length ? [['recent', '🕘 Recientes', '#9aa3c7']] : []), ...CATEGORIES.map(c => [c.id, `${c.emoji} ${c.name}`, c.color])];
  if (!chips.some(c => c[0] === activeChip)) activeChip = 'all';
  $('#chips').innerHTML = chips.map(([id, label, col]) => `<button class="chip ${id === activeChip ? 'on' : ''}" data-id="${id}"><span class="c" style="background:${col};color:${col}"></span>${label}</button>`).join('');
}
$('#chips').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  activeChip = b.dataset.id; hits.clear(); $('#q').value = ''; $('#results').hidden = true; closePanel(); renderChips();
  if (listMode) return renderList();
  if (activeChip === 'all') three?.home();
  else if (CAT[activeChip]) three?.focusCat(activeChip);
  else three?.focusIds(activeChip === 'favs' ? [...favs] : recent);
});

/* búsqueda */
let res = [], sel = 0;
const q = $('#q'), box = $('#results');
function runSearch() {
  const v = q.value.trim();
  if (!v) { res = []; hits.clear(); box.hidden = true; if (listMode) renderList(); return; }
  res = search(v, 8); sel = 0; hits = new Set(res.map(r => r.tool.id));
  if (activeChip !== 'all') { activeChip = 'all'; renderChips(); }
  box.innerHTML = res.length ? res.map((r, i) => `<div class="res ${i === 0 ? 'sel' : ''}" data-id="${r.tool.id}"><span class="e">${r.tool.emoji}</span><div><b>${r.tool.name}</b><small><span class="dot" style="background:${CAT[r.tool.cat].color}"></span>${r.tool.desc}</small></div><a class="go" href="${r.tool.url}" target="_blank" rel="noopener noreferrer" data-open="${r.tool.id}">Abrir ↗</a></div>`).join('')
    : `<div class="empty">No encontré nada para “${v.replace(/</g, '&lt;')}”. Prueba con: quitar fondo, unir pdf, correo temporal, comprimir video…</div>`;
  box.hidden = false;
  if (listMode) renderList(); else if (res.length) three?.focusIds(res.slice(0, 3).filter(r => r.score >= res[0].score * .5).map(r => r.tool.id));
}
let deb; q.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(runSearch, 160); });
q.addEventListener('focus', () => { if (res.length) box.hidden = false; });
q.addEventListener('keydown', e => {
  const rows = [...box.querySelectorAll('.res')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!rows.length) return; sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length; rows.forEach((r, i) => r.classList.toggle('sel', i === sel)); three?.focusTool(res[sel].tool.id); }
  else if (e.key === 'Enter') { e.preventDefault(); if (res[sel]) { if (selected?.id === res[sel].tool.id) openTool(res[sel].tool); else { selectTool(res[sel].tool); box.hidden = true; } } }
  else if (e.key === 'Escape') { q.value = ''; runSearch(); q.blur(); }
});
box.addEventListener('click', e => {
  const open = e.target.closest('[data-open]'); if (open) { markOpened(open.dataset.open); return; }
  const row = e.target.closest('.res'); if (row) { selectTool(TOOLS.find(t => t.id === row.dataset.id)); box.hidden = true; }
});
document.addEventListener('pointerdown', e => { if (!e.target.closest('.searchwrap')) box.hidden = true; });
addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== q) { e.preventDefault(); q.focus(); q.select(); }
  else if (e.key === 'Escape' && document.activeElement !== q) { closePanel(); }
});

/* vista lista (2D) */
function cardHTML(t) {
  return `<a class="card ${hits.has(t.id) ? 'hit' : ''}" id="card-${t.id}" href="${t.url}" target="_blank" rel="noopener noreferrer" data-id="${t.id}" style="border-left:3px solid ${CAT[t.cat].color}">
    <span class="e">${t.emoji}</span><div><b>${t.name}</b><small>${t.desc}</small></div>
    <button class="fav" data-fav="${t.id}" title="Favorito" aria-label="Favorito">${favs.has(t.id) ? '★' : '☆'}</button></a>`;
}
function renderList() {
  const L = $('#list'); let html = '';
  const byIds = ids => ids.map(id => TOOLS.find(t => t.id === id)).filter(Boolean);
  if (res.length && q.value.trim()) html += `<h3>🔎 Resultados para “${q.value.trim().replace(/</g, '&lt;')}”</h3><div class="grid">${res.map(r => cardHTML(r.tool)).join('')}</div>`;
  if (activeChip === 'favs') html += `<h3>★ Favoritos</h3><div class="grid">${byIds([...favs]).map(cardHTML).join('')}</div>`;
  else if (activeChip === 'recent') html += `<h3>🕘 Abiertos recientemente</h3><div class="grid">${byIds(recent).map(cardHTML).join('')}</div>`;
  else {
    if (activeChip === 'all' && !q.value.trim()) {
      if (favs.size) html += `<h3>★ Favoritos</h3><div class="grid">${byIds([...favs]).map(cardHTML).join('')}</div>`;
      if (recent.length) html += `<h3>🕘 Recientes</h3><div class="grid">${byIds(recent).map(cardHTML).join('')}</div>`;
    }
    for (const c of CATEGORIES) if (activeChip === 'all' || activeChip === c.id)
      html += `<h3><span style="color:${c.color}">${c.emoji}</span> ${c.name}</h3><div class="grid">${TOOLS.filter(t => t.cat === c.id).map(cardHTML).join('')}</div>`;
  }
  L.innerHTML = html;
}
$('#list').addEventListener('click', e => {
  const f = e.target.closest('[data-fav]'); if (f) { e.preventDefault(); toggleFav(f.dataset.fav); return; }
  const c = e.target.closest('.card'); if (c) markOpened(c.dataset.id);
});
function setListMode(on) {
  listMode = on; $('#list').hidden = !on; $('#viewToggle').textContent = on ? '🌌 Vista 3D' : '☰ Lista';
  $('#hud').style.display = on ? 'none' : ''; closePanel(); if (on) renderList();
}
$('#viewToggle').addEventListener('click', () => { if (!three && listMode) return; setListMode(!listMode); });
$('#panelClose').addEventListener('click', closePanel);
$('#resetCam').addEventListener('click', () => { hits.clear(); q.value = ''; res = []; activeChip = 'all'; renderChips(); closePanel(); three?.home(); });

/* arranque */
renderChips();
const params = new URLSearchParams(location.search);
if (webglOK() && params.get('vista') !== 'lista') {
  try { three = init3D(); } catch (err) { console.error(err); three = null; }
}
if (!three) { setListMode(true); $('#viewToggle').title = 'Tu dispositivo no soporta 3D; mostrando lista'; $('#loading').classList.add('gone'); window.__ready = true; }
const pre = params.get('q'); if (pre) { q.value = pre; runSearch(); }
