// UI: top resource bar, goal, combo meter, bottom shop sheet, modals, toasts.
(() => {
'use strict';
const $ = id => document.getElementById(id);
S.$ = $;

// ---------- toasts ----------
const toastEl = $('toast');
let toastT = 0;
S.toast = (text, dur = 2.4) => { toastEl.textContent = text; toastEl.hidden = false; toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show'); toastT = dur; };
S.uiTick = dt => { if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.hidden = true; } };

// ---------- icons ----------
S.ICON = {};
for (const k of ['wood', 'stone', 'food', 'gp']) { const c = document.createElement('canvas'); c.width = c.height = 48; S.drawIcon(c.getContext('2d'), k, 24, 25, 2.6); S.ICON[k] = c.toDataURL(); }
document.querySelectorAll('[data-icon]').forEach(img => { img.src = S.ICON[img.dataset.icon]; });

// ---------- top bar ----------
const top = { wood: $('vWood'), stone: $('vStone'), food: $('vFood'), rwood: $('rWood'), rstone: $('rStone'), rfood: $('rFood'), pop: $('vPop'), gp: $('vGp'), era: $('eraLabel'), buffs: $('buffs'), goal: $('goalText'), goalBox: $('goal'), combo: $('combo'), comboText: $('comboText'), comboBar: $('comboBar') };
S.updateTop = () => {
  const E = S.E, r = S.rates();
  for (const k of S.RES) { top[k].textContent = S.fmt(E.res[k]); top['r' + k].textContent = '+' + S.fmt(r[k]) + '/с'; }
  top.pop.textContent = S.pop() + '/' + S.popCap();
  top.pop.parentElement.classList.toggle('full', S.pop() >= S.popCap());
  top.gp.textContent = S.fmt(E.gp);
  $('gpChip').hidden = E.wonder.idx === 0;
  top.era.textContent = S.ERAS[E.era].name;
  const g = S.GOALS[E.goal];
  top.goalBox.hidden = !g;
  if (g) top.goal.textContent = g.text;
  top.buffs.innerHTML = E.buffs.map(b => `<span class="buff">${b.kind === 'frenzy' ? 'Доход ×' + b.mult : 'Тап ×' + b.mult} · ${Math.ceil(b.until - E.time)}с</span>`).join('');
};
S.updateCombo = () => {
  const c = S.game.combo;
  const on = c.n >= 3;
  top.combo.classList.toggle('on', on);
  if (on) { top.comboText.textContent = 'Комбо ×' + S.comboMult().toFixed(2).replace('.', ','); top.comboBar.style.width = Math.max(0, 1 - (S.game.time - c.last) / 1.2) * 100 + '%'; }
};

// ---------- shop ----------
let tab = 'workers', amt = '1', sheetSize = 'mid';
const list = $('list');
const setSheet = sz => { sheetSize = sz; $('sheet').className = sz; };
$('handle').onclick = () => setSheet(sheetSize === 'mid' ? 'max' : sheetSize === 'max' ? 'min' : 'mid');
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; if (sheetSize === 'min') setSheet('mid'); sigCache = ''; renderShop(); });
$('amtBtn').onclick = () => { amt = amt === '1' ? '10' : amt === '10' ? 'max' : '1'; $('amtBtn').textContent = amt === 'max' ? 'MAX' : '×' + amt; sigCache = ''; renderShop(); };

const n4 = (kind, key) => {
  if (kind === 'upgrade' || kind === 'wonder') return 1;
  if (amt === 'max') return Math.max(1, S.maxBuy(kind, key));
  return +amt;
};
const costHTML = c => Object.keys(c).map(r => `<span class="cost${S.E.res[r] >= c[r] ? '' : ' no'}" data-r="${r}"><img src="${S.ICON[r]}" alt="">${S.fmt(c[r])}</span>`).join('');

function items() {
  const E = S.E, out = [];
  if (tab === 'workers') {
    let teaser = false;
    for (const k in S.WORKERS) {
      const W = S.WORKERS[k];
      if (S.workerUnlocked(k)) out.push({ kind: 'worker', key: k });
      else if (!teaser && W.era <= E.era + 1) { teaser = true; out.push({ kind: 'locked', key: k, name: W.name, why: W.era > E.era ? 'Откроется в эпоху: ' + S.ERAS[W.era].name : W.lockText }); }
    }
  } else if (tab === 'buildings') {
    let teaser = false;
    for (const k in S.BUILDINGS) {
      if (S.buildingUnlocked(k)) out.push({ kind: 'building', key: k });
      else if (!teaser) { teaser = true; out.push({ kind: 'locked', key: k, name: S.BUILDINGS[k].names[0], why: S.BUILDINGS[k].lockText }); }
    }
  } else if (tab === 'upgrades') {
    const vis = S.UPGRADES.filter(S.upgradeVisible).sort((a, b) => sum(a.cost) - sum(b.cost));
    for (const u of vis) out.push({ kind: 'upgrade', key: u.id });
    const hidden = S.UPGRADES.filter(u => !E.upg[u.id] && !S.upgradeVisible(u)).length;
    if (hidden) out.push({ kind: 'note', text: hidden + ' улучшений откроются, когда племя вырастет' });
  } else out.push({ kind: 'wonder', key: 'wonder' });
  return out;
}
const sum = c => Object.values(c).reduce((a, b) => a + b, 0);

let sigCache = '';
function renderShop() {
  const its = items();
  const sig = tab + amt + its.map(i => i.kind + i.key).join('|') + S.E.wonder.idx + S.E.era + (S.wonderState().unlocked ? 1 : 0);
  if (sig !== sigCache) {
    sigCache = sig;
    list.innerHTML = '';
    for (const it of its) list.appendChild(makeCard(it));
  }
  for (const el of list.children) updateCard(el);
  updateDots();
}
S.renderShop = renderShop;

function makeCard(it) {
  const el = document.createElement('div');
  el.className = 'card ' + it.kind; el.dataset.kind = it.kind; el.dataset.key = it.key || '';
  if (it.kind === 'note') { el.innerHTML = `<p class="note">${it.text}</p>`; return el; }
  if (it.kind === 'locked') { el.innerHTML = `<div class="ic q">?</div><div class="info"><b>${it.name}</b><span class="desc">${it.why}</span></div>`; return el; }
  if (it.kind === 'wonder') { el.className = 'card wonder'; el.innerHTML = '<div class="wbody"></div>'; return el; }
  const c = document.createElement('canvas'); c.width = c.height = 112; c.className = 'ic';
  S.drawCardIcon(c.getContext('2d'), it.kind, it.key);
  el.appendChild(c);
  el.insertAdjacentHTML('beforeend', `<div class="info"><b class="nm"></b><span class="desc"></span><span class="stat"></span></div><button class="buy" type="button"><span class="lbl"></span><span class="costs"></span></button>`);
  el.querySelector('.buy').onclick = () => {
    const n = n4(it.kind, it.key);
    if (S.buy(it.kind, it.key, n)) {
      S.sound('buy');
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
      if (it.kind === 'worker') S.syncWorkers();
      if (it.kind === 'building') { const L = S.E.b[it.key]; if (S.MILESTONES.includes(L)) S.toast(S.buildingName(it.key) + ': веха ' + L + ' уровня, эффект ×2!'); }
      renderShop(); S.updateTop();
    } else S.sound('no');
  };
  return el;
}

function updateCard(el) {
  const kind = el.dataset.kind, key = el.dataset.key, E = S.E;
  if (kind === 'wonder') return updateWonder(el);
  if (kind !== 'worker' && kind !== 'building' && kind !== 'upgrade') return;
  const n = n4(kind, key), cost = S.costOf(kind, key, n);
  let name, desc, stat, lbl, can = S.canAfford(cost);
  if (kind === 'worker') {
    const W = S.WORKERS[key], each = S.workerRate(key);
    name = `${W.name} <i>${E.w[key]}</i>`; desc = W.desc;
    stat = `+${S.fmt(each)} ${S.RES_NAME[W.res]}/с каждый · всего ${S.fmt(each * E.w[key])}/с`;
    const room = S.popCap() - S.pop();
    if (room < n) { can = false; stat = room <= 0 ? '<em>Нет мест: построй дома</em>' : `<em>Мест только ${room}</em>`; }
    lbl = 'Нанять' + (n > 1 ? ' ×' + n : '');
  } else if (kind === 'building') {
    const B = S.BUILDINGS[key], L = E.b[key], nm = S.nextMilestone(L);
    name = `${S.buildingName(key)} <i>ур. ${L}</i>`; desc = B.desc;
    if (B.boost) stat = `${S.RES_NAME[B.boost][0].toUpperCase() + S.RES_NAME[B.boost].slice(1)} ×${S.boost(B.boost).toFixed(2).replace('.', ',')}` + (nm ? ` · веха ×2 через ${nm - L} ур.` : '');
    else if (key === 'center') stat = `Тап: ${S.fmt(S.tapValue('wood'))}` + (nm ? ` · веха ×2 через ${nm - L} ур.` : '');
    else if (key === 'house') stat = `Мест: ${S.popCap()} · +${3 * S.ERAS[E.era].pop} за уровень`;
    else if (key === 'tower') stat = L ? `Вышек: ${Math.min(4, 1 + Math.floor(L / 3))} · выстрел раз в ${(2.2 / (1 + .12 * L)).toFixed(1).replace('.', ',')} с` : 'Защищают запасы от волков';
    else if (key === 'wall') stat = `Уровень ${L} из ${B.max}`;
    if (B.max && L >= B.max) { el.querySelector('.buy').hidden = true; } else el.querySelector('.buy').hidden = false;
    lbl = (L ? 'Улучшить' : 'Построить') + (n > 1 ? ' +' + n : '');
  } else {
    const u = S.UPGRADES.find(u => u.id === key);
    name = u.name; desc = u.desc; stat = ''; lbl = 'Купить';
  }
  el.querySelector('.nm').innerHTML = name;
  el.querySelector('.desc').textContent = desc;
  el.querySelector('.stat').innerHTML = stat;
  el.querySelector('.lbl').textContent = lbl;
  el.querySelector('.costs').innerHTML = costHTML(cost);
  el.querySelector('.buy').classList.toggle('ready', can);
}

function updateWonder(el) {
  const st = S.wonderState(), E = S.E, body = el.querySelector('.wbody');
  let html = '';
  if (S.canAdvanceEra()) {
    const next = S.ERAS[E.era + 1];
    html = `<b class="wt">${S.WONDERS[E.era].name} возведён!</b><p>Чудо приносит очки богов. Пора вести племя в новую эпоху: <b>${next.name}</b>.</p>
      <ul><li>Весь доход ×${next.mult / S.ERAS[E.era].mult}</li><li>Новые люди и улучшения</li><li>Дома вмещают больше людей</li><li>Город меняет облик</li></ul>
      <button class="buy ready big" type="button" data-act="era">Перейти: ${next.name}</button>`;
  } else if (st.done) {
    html = `<b class="wt">Все чудеса построены</b><p>Следующие эпохи, боги и захват земель появятся в новых версиях. Копи очки богов: они пригодятся.</p>`;
  } else {
    const W = st.W, cost = S.costOf('wonder');
    const stages = Array.from({ length: S.WONDER_STAGES }, (_, i) => `<i class="${i < E.wonder.stage ? 'f' : ''}"></i>`).join('');
    html = `<b class="wt">Чудо эпохи: ${W.name}</b><p>Строится в ${S.WONDER_STAGES} этапов. Когда достроишь, откроется следующая эпоха, а чудо начнёт приносить очки богов.</p>
      <div class="stages">${stages}</div>` +
      (st.unlocked ? `<button class="buy${S.canAfford(cost) ? ' ready' : ''} big" type="button" data-act="stage"><span class="lbl">${E.wonder.stage ? 'Следующий этап' : 'Заложить чудо'} (${E.wonder.stage + 1}/${S.WONDER_STAGES})</span><span class="costs">${costHTML(cost)}</span></button>`
        : `<p class="lock">Откроется, когда: ${W.lockText}</p>`);
  }
  if (body.dataset.html !== html) {
    body.dataset.html = html; body.innerHTML = html;
    const b = body.querySelector('[data-act]');
    if (b) b.onclick = () => {
      if (b.dataset.act === 'era') { if (S.advanceEra()) { S.sound('era'); S.toast('Новая эпоха: ' + S.ERAS[S.E.era].name + '!', 4); S.syncWorkers(); sigCache = ''; renderShop(); } }
      else if (S.buy('wonder', 'wonder')) { S.sound('build'); S.toast(S.E.wonder.stage === 0 ? 'Чудо достроено!' : 'Этап ' + S.E.wonder.stage + ' из ' + S.WONDER_STAGES + ' готов'); renderShop(); }
      else S.sound('no');
    };
  }
}

function updateDots() {
  const E = S.E;
  const any = {
    workers: Object.keys(S.WORKERS).some(k => S.workerUnlocked(k) && S.popCap() > S.pop() && S.canAfford(S.costOf('worker', k))),
    buildings: Object.keys(S.BUILDINGS).some(k => S.buildingUnlocked(k) && !(S.BUILDINGS[k].max && E.b[k] >= S.BUILDINGS[k].max) && S.canAfford(S.costOf('building', k))),
    upgrades: S.UPGRADES.some(u => S.upgradeVisible(u) && S.canAfford(u.cost)),
    wonder: S.canAdvanceEra() || (S.wonderState().unlocked && S.canAfford(S.costOf('wonder'))),
  };
  document.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('dot', any[b.dataset.tab]); b.classList.toggle('on', b.dataset.tab === tab); });
}

S.openCard = key => {
  tab = key === 'wonder' ? 'wonder' : 'buildings';
  if (sheetSize === 'min') setSheet('mid');
  sigCache = ''; renderShop();
  const el = list.querySelector(`[data-key="${key}"]`);
  if (el) { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
};

// ---------- modals ----------
S.modal = (html, buttons) => {
  const m = $('modal'), box = $('modalBox');
  box.innerHTML = html + '<div class="mbtns">' + buttons.map((b, i) => `<button class="buy ready big" type="button" data-i="${i}">${b.label}</button>`).join('') + '</div>';
  box.querySelectorAll('[data-i]').forEach(el => el.onclick = () => { const b = buttons[+el.dataset.i]; if (!b.keep) m.hidden = true; b.fn && b.fn(el); });
  m.hidden = false;
};
})();
