// ==UserScript==
// @name         My Maps Coordinates Extractor
// @namespace    https://greasyfork.org/users/YOUR-USERNAME
// @version      1.0.0
// @description  Extract name + lat/lng from every marker in a Google My Maps map, export as CSV
// @match        https://www.google.com/maps/d/*
// @match        https://mymaps.google.com/*
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(async () => {
  'use strict';

  const PAGE_WIN = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const log = (...a) => console.log('[MMX]', ...a);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const waitFor = async (cond, timeout = 1500, interval = 20) => {
    const t0 = performance.now();
    while (performance.now() - t0 < timeout) {
      if (cond()) return performance.now() - t0;
      await sleep(interval);
    }
    return -1;
  };

  const SEL = {
    ITEM:  '[fl_id]',
    NAME:  '[class*="r4nke"]',
    POPUP: '.gm-style-iw',
    CLOSE: '.gm-ui-hover-effect, [aria-label*="Close"], [aria-label*="Cerrar"]',
  };

  const getPopup = () => document.querySelector(SEL.POPUP);
  const closePopup = () => document.querySelector(SEL.CLOSE)?.click();

  // Full event sequence. A plain .click() does nothing on My Maps.
  const fireClick = (el) => {
    const r = el.getBoundingClientRect();
    const base = {
      bubbles: true, cancelable: true,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0,
    };
    const mk = (name, type, extra) => {
      try { return new window[name](type, { ...base, ...extra }); }
      catch (e) { return new (PAGE_WIN[name] || window[name])(type, { ...base, ...extra }); }
    };
    const down = { buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    const up   = { buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    el.dispatchEvent(mk('PointerEvent', 'pointerdown', down));
    el.dispatchEvent(mk('MouseEvent',   'mousedown',   down));
    el.dispatchEvent(mk('PointerEvent', 'pointerup',   up));
    el.dispatchEvent(mk('MouseEvent',   'mouseup',     up));
    el.dispatchEvent(mk('MouseEvent',   'click',       up));
  };

  // Three strategies, from most to least reliable.
  const extractCoords = (text) => {
    // 1. Google Maps URL patterns: @lat,lng | ?q=lat,lng | ?ll=lat,lng
    for (const re of [
      /@(-?\d{1,3}\.\d{3,}),(-?\d{1,3}\.\d{3,})/,
      /[?&]q=(-?\d{1,3}\.\d{3,}),(-?\d{1,3}\.\d{3,})/,
      /[?&]ll=(-?\d{1,3}\.\d{3,}),(-?\d{1,3}\.\d{3,})/,
    ]) {
      const m = text.match(re);
      if (m) {
        const a = parseFloat(m[1]), b = parseFloat(m[2]);
        if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b };
      }
    }

    // 2. Decimal pairs, trying both orderings.
    const rePair = /(-?\d{1,3}[.,]\d{4,})[^\d\-+]{1,8}(-?\d{1,3}[.,]\d{4,})/g;
    let m;
    const cands = [];
    while ((m = rePair.exec(text)) !== null) {
      const a = parseFloat(m[1].replace(',', '.'));
      const b = parseFloat(m[2].replace(',', '.'));
      if (Math.abs(a) <= 90 && Math.abs(b) <= 180) cands.push({ lat: a, lng: b });
      if (Math.abs(b) <= 90 && Math.abs(a) <= 180) cands.push({ lat: b, lng: a });
    }
    if (cands.length) {
      return cands.find(c => !(c.lat === 0 && c.lng === 0)) || cands[0];
    }

    // 3. DMS
    const dm = text.match(/(\d{1,3})°\s*(\d{1,2})['′]\s*(\d{1,2}(?:[.,]\d+)?)["″]?\s*([NS])[^\d]{0,10}(\d{1,3})°\s*(\d{1,2})['′]\s*(\d{1,2}(?:[.,]\d+)?)["″]?\s*([EW])/);
    if (dm) {
      const lat = (parseInt(dm[1]) + parseInt(dm[2]) / 60 + parseFloat(dm[3].replace(',', '.')) / 3600) * (dm[4] === 'S' ? -1 : 1);
      const lng = (parseInt(dm[5]) + parseInt(dm[6]) / 60 + parseFloat(dm[7].replace(',', '.')) / 3600) * (dm[8] === 'W' ? -1 : 1);
      return { lat, lng };
    }

    return null;
  };

  const extractAddress = (text) => {
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    for (let i = 1; i < Math.min(lines.length, 6); i++) {
      if (/\d/.test(lines[i]) && (/,/.test(lines[i]) || /\s\d+/.test(lines[i]))) return lines[i];
    }
    return '';
  };

  const processItem = async (el, container, fallbackName) => {
    const r = el.getBoundingClientRect();
    const cR = container.getBoundingClientRect();
    if (r.top < cR.top || r.bottom > cR.bottom) {
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      await sleep(30);
    }

    closePopup();
    await waitFor(() => !getPopup(), 400, 15);

    let coords = null;
    let popupText = '';
    fireClick(el);
    await waitFor(() => {
      const iw = getPopup();
      if (!iw) return false;
      popupText = iw.innerText || '';
      if (!popupText.trim()) return false;
      coords = extractCoords(popupText);
      return coords !== null;
    }, 1500, 20);

    if (!coords) {
      el.click();
      await waitFor(() => {
        const iw = getPopup();
        if (!iw) return false;
        popupText = iw.innerText || '';
        coords = extractCoords(popupText);
        return coords !== null;
      }, 800, 20);
    }

    return {
      name: fallbackName,
      address: extractAddress(popupText),
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    };
  };

  let stopFlag = false;

  async function run() {
    stopFlag = false;
    closePopup();
    await sleep(200);

    const items0 = [...document.querySelectorAll(SEL.ITEM)].filter(e => e.getAttribute('fl_id') !== '0');
    if (!items0.length) { alert('No items found. Make sure the side panel is open.'); return; }

    const container = (() => {
      let el = items0[0].parentElement;
      while (el && el.scrollHeight <= el.clientHeight + 10) el = el.parentElement;
      return el;
    })();
    if (!container) { alert('Could not find the scroll container.'); return; }

    container.scrollTop = 0;
    await sleep(400);

    const results = [];
    const seen = new Set();
    let stagnant = 0, lastCount = 0;
    const START = performance.now();

    while (!stopFlag && stagnant < 3) {
      const items = [...document.querySelectorAll(SEL.ITEM)]
        .filter(e => e.offsetParent !== null && e.getAttribute('fl_id') !== '0');
      const fresh = items.filter(e => !seen.has(e.getAttribute('fl_id')));

      if (fresh.length === 0) {
        const before = container.scrollTop;
        container.scrollTop = Math.min(container.scrollTop + container.clientHeight * 0.85, container.scrollHeight);
        await sleep(500);
        const now = document.querySelectorAll(SEL.ITEM).length;
        if (now === lastCount && container.scrollTop === before) stagnant++;
        else { lastCount = now; stagnant = 0; }
        continue;
      }

      for (const el of fresh) {
        if (stopFlag) break;
        const id = el.getAttribute('fl_id');
        if (!id || seen.has(id)) continue;
        seen.add(id);

        const fallbackName = (el.querySelector(SEL.NAME)?.innerText || el.innerText || '').trim().split('\n')[0];

        let r;
        try { r = await processItem(el, container, fallbackName); }
        catch (e) { log('Error:', e.message); r = { name: fallbackName, address: '', lat: null, lng: null }; }
        results.push(r);

        if (results.length % 10 === 0) {
          const sec = (performance.now() - START) / 1000;
          log(`[${results.length}] ${(results.length / sec).toFixed(2)}/s | missing=${results.filter(x => x.lat === null).length}`);
        }
      }

      container.scrollTop = Math.min(container.scrollTop + container.clientHeight * 0.85, container.scrollHeight);
      await sleep(400);
      const now = document.querySelectorAll(SEL.ITEM).length;
      if (now === lastCount) stagnant++; else { lastCount = now; stagnant = 0; }
    }

    const totalSec = ((performance.now() - START) / 1000).toFixed(1);
    const missing = results.filter(r => r.lat === null).length;
    log(`Done: ${results.length} items in ${totalSec}s | ${missing} missing coords`);

    const esc = s => `"${String(s || '').replace(/"/g, '""')}"`;
    const csv = 'name,lat,lng,address\n' + results.map(r =>
      [esc(r.name), r.lat ?? '', r.lng ?? '', esc(r.address)].join(',')
    ).join('\n');

    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `markers_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    try { GM_setClipboard(csv); } catch (e) {}

    alert(`Done in ${totalSec}s: ${results.length} processed, ${missing} missing coords.`);
  }

  function addButton() {
    if (document.getElementById('mmx-btn')) return;
    const b = document.createElement('button');
    b.id = 'mmx-btn';
    b.textContent = '▶ Extract coords';
    b.style.cssText = 'position:fixed;top:80px;right:20px;z-index:2147483647;padding:10px 14px;background:#1a73e8;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3);font-family:system-ui,sans-serif;font-size:13px;';

    let running = false;
    b.onclick = async () => {
      if (running) { stopFlag = true; b.textContent = 'Stopping…'; return; }
      running = true;
      b.textContent = 'STOP';
      b.style.background = '#d93025';
      try { await run(); }
      finally {
        running = false;
        b.textContent = '▶ Extract coords';
        b.style.background = '#1a73e8';
      }
    };
    document.body.appendChild(b);
  }

  setTimeout(addButton, 2000);
  setTimeout(addButton, 6000);
})();
