/* Brosi Home — TV launcher UI.
 * Runs inside the native shell (window.Android) on the TV, or in any browser
 * as a preview with demo apps. Navigation is D-pad / arrow keys + Enter.
 */
(function () {
  "use strict";

  const CFG = window.TV_CONFIG || {};
  const N = window.Android || null;
  const $ = (id) => document.getElementById(id);

  // ---------- storage (best-effort) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  // ---------- network: native bridge avoids CORS ----------
  const pending = {};
  let cbSeq = 0;
  window.__nativeCb = function (id, err, body) {
    const p = pending[id];
    if (!p) return;
    delete pending[id];
    if (err) p.reject(new Error(err)); else p.resolve(body);
  };
  function getJSON(url) {
    if (N && N.httpGet) {
      return new Promise((resolve, reject) => {
        const id = "cb" + (++cbSeq);
        pending[id] = { resolve, reject };
        N.httpGet(url, id);
        setTimeout(() => { if (pending[id]) { delete pending[id]; reject(new Error("timeout")); } }, 15000);
      }).then(JSON.parse);
    }
    return fetch(url).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }

  // ---------- hint toast ----------
  let hintTimer;
  function hint(text, ms) {
    const h = $("hint");
    h.textContent = text;
    h.classList.add("show");
    clearTimeout(hintTimer);
    if (ms !== 0) hintTimer = setTimeout(() => h.classList.remove("show"), ms || 2600);
  }

  // ---------- clock ----------
  function tickClock() {
    const d = new Date();
    let h = d.getHours() % 12 || 12;
    const m = String(d.getMinutes()).padStart(2, "0");
    $("time").textContent = h + ":" + m;
    $("date").textContent = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  }

  // ---------- weather (Open-Meteo, no key) ----------
  const WMO = {
    0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Cloudy",
    45: "Fog", 48: "Fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
    56: "Freezing drizzle", 57: "Freezing drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
    66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow",
    77: "Snow grains", 80: "Showers", 81: "Showers", 82: "Heavy showers",
    85: "Snow showers", 86: "Snow showers", 95: "Thunderstorms", 96: "Thunderstorms", 99: "Thunderstorms",
  };
  let lastWeather = 0;
  function loadWeather() {
    const w = CFG.weather;
    if (!w) return;
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + w.lat + "&longitude=" + w.lon +
      "&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min" +
      "&temperature_unit=" + (w.units || "fahrenheit") + "&timezone=auto&forecast_days=1";
    getJSON(url).then((d) => {
      lastWeather = Date.now();
      $("w-temp").textContent = Math.round(d.current.temperature_2m) + "°";
      $("w-cond").textContent = (WMO[d.current.weather_code] || "") + (w.city ? " · " + w.city : "");
      $("weather").classList.add("ready");
      $("w-range").textContent = "H " + Math.round(d.daily.temperature_2m_max[0]) + "°  L " + Math.round(d.daily.temperature_2m_min[0]) + "°";
    }).catch(() => {});
  }

  // ---------- scores (ESPN public JSON) ----------
  let scoresTimer, lastScores = 0;
  function scoreOf(c) {
    if (c.score == null) return null;
    if (typeof c.score === "object") return c.score.displayValue != null ? c.score.displayValue : c.score.value;
    return c.score;
  }
  function loadScores() {
    const teams = CFG.teams || [];
    const windowMs = (CFG.scoreWindowDays || 4) * 86400000;
    Promise.all(teams.map((t) => {
      const url = "https://site.api.espn.com/apis/site/v2/sports/" + t.sport + "/" + t.league + "/teams/" + t.abbr;
      return getJSON(url).then((d) => {
        const ev = d.team && d.team.nextEvent && d.team.nextEvent[0];
        if (!ev || !ev.competitions || !ev.competitions[0]) return null;
        const comp = ev.competitions[0];
        const st = (comp.status && comp.status.type) || {};
        const when = new Date(ev.date).getTime();
        if (Math.abs(when - Date.now()) > windowMs && st.state !== "in") return null;
        const sides = (comp.competitors || []).slice().sort((a, b) => (a.homeAway === "away" ? -1 : 1));
        return {
          state: st.state || "pre",
          detail: st.shortDetail || st.detail || "",
          when,
          league: t.league.toUpperCase(),
          sides: sides.map((c) => ({
            abbr: (c.team && c.team.abbreviation) || "",
            score: scoreOf(c),
            winner: !!c.winner,
          })),
        };
      }).catch(() => null);
    })).then((games) => {
      lastScores = Date.now();
      games = games.filter(Boolean);
      const rank = { in: 0, post: 1, pre: 2 };
      games.sort((a, b) => (rank[a.state] - rank[b.state]) || (a.when - b.when));
      renderScores(games);
      clearTimeout(scoresTimer);
      const anyLive = games.some((g) => g.state === "in");
      scoresTimer = setTimeout(loadScores, anyLive ? 45000 : 600000);
    });
  }
  function renderScores(games) {
    const box = $("scores");
    box.innerHTML = "";
    games.forEach((g) => {
      const el = document.createElement("div");
      el.className = "game" + (g.state === "in" ? " live" : "");
      const teams = document.createElement("div");
      teams.className = "teams";
      const showScore = g.state !== "pre";
      g.sides.forEach((s) => {
        const row = document.createElement("div");
        row.className = "row" + (g.state === "post" ? (s.winner ? " win" : " lose") : "");
        row.innerHTML = '<span class="abbr"></span><span class="pts"></span>';
        row.children[0].textContent = s.abbr;
        row.children[1].textContent = showScore && s.score != null ? s.score : "";
        teams.appendChild(row);
      });
      const status = document.createElement("div");
      status.className = "status";
      status.textContent = g.state === "in" ? g.detail : g.league + "\n" + g.detail;
      status.style.whiteSpace = "pre";
      el.appendChild(teams);
      el.appendChild(status);
      box.appendChild(el);
    });
  }

  // ---------- apps ----------
  const DEMO = [
    ["com.google.android.youtube.tv", "YouTube", "#e62117"], ["com.netflix.ninja", "Netflix", "#b20710"],
    ["com.hulu.livingroomplus", "Hulu", "#1ce783"], ["com.disney.disneyplus", "Disney+", "#113ccf"],
    ["com.wbd.stream", "Max", "#002be7"], ["com.amazon.amazonvideo.livingroom", "Prime Video", "#00a8e1"],
    ["com.peacocktv.peacockandroid", "Peacock", "#222"], ["com.espn.score_center", "ESPN", "#c8102e"],
    ["com.spotify.tv.android", "Spotify", "#1db954"], ["com.google.android.youtube.tvunplugged", "YouTube TV", "#282828"],
    ["com.apple.atve.androidtv.appletv", "Apple TV", "#333"], ["com.android.vending", "Play Store", "#01875f"],
  ];

  let allApps = [];      // [{pkg,label}]
  let order = store.get("bh.order", null);
  let hidden = new Set(store.get("bh.hidden", null) || CFG.defaultHidden || []);
  let editing = false;
  let picked = null;     // pkg being moved
  const iconData = {};

  function loadApps() {
    if (N && N.getApps) {
      try { allApps = JSON.parse(N.getApps()); } catch (e) { allApps = []; }
    } else {
      allApps = DEMO.map(([pkg, label, color]) => ({ pkg, label, color }));
    }
    // Build the full order: saved order, then config default, then alphabetical.
    const known = new Set(allApps.map((a) => a.pkg));
    const base = (order || []).filter((p) => known.has(p));
    const seen = new Set(base);
    (CFG.defaultOrder || []).forEach((p) => { if (known.has(p) && !seen.has(p)) { base.push(p); seen.add(p); } });
    allApps.slice().sort((a, b) => a.label.localeCompare(b.label)).forEach((a) => { if (!seen.has(a.pkg)) { base.push(a.pkg); seen.add(a.pkg); } });
    order = base;
    renderApps();
  }

  function saveLayout() {
    store.set("bh.order", order);
    store.set("bh.hidden", Array.from(hidden));
  }

  function appByPkg(pkg) { return allApps.find((a) => a.pkg === pkg); }

  let firstRender = true;
  function renderApps(focusPkg) {
    const grid = $("apps");
    let idx = 0;
    const keep = focusPkg || (document.activeElement && document.activeElement.dataset && document.activeElement.dataset.pkg);
    grid.innerHTML = "";
    order.forEach((pkg) => {
      const app = appByPkg(pkg);
      if (!app) return;
      const isHidden = hidden.has(pkg);
      if (isHidden && !editing) return;
      const t = document.createElement("div");
      t.className = "tile" + (isHidden ? " hidden-app" : "") + (picked === pkg ? " picked" : "") + (firstRender ? " enter" : "");
      t.style.setProperty("--i", idx++);
      t.tabIndex = 0;
      t.dataset.nav = "1";
      t.dataset.pkg = pkg;
      t.dataset.action = "app";
      const clip = document.createElement("div");
      clip.className = "clip";
      t.appendChild(clip);
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = app.label;
      t.appendChild(label);
      const badge = document.createElement("div");
      badge.className = "badge";
      badge.textContent = "Hidden";
      clip.appendChild(badge);
      paintTile(t, app);
      grid.appendChild(t);
    });
    if (firstRender) setTimeout(() => grid.querySelectorAll(".enter").forEach((e) => e.classList.remove("enter")), 1400);
    firstRender = false;
    if (keep) {
      const el = grid.querySelector('[data-pkg="' + CSS.escape(keep) + '"]');
      if (el) { focusEl(el); return; }
    }
    if (!document.activeElement || document.activeElement === document.body) focusFirst();
  }

  // Average color of an icon -> a deep tint behind it, so every tile reads as one big logo.
  function tintFrom(src, cb, k) {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 24;
        const x = c.getContext("2d");
        x.drawImage(img, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const a = d[i + 3], mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
          if (a < 128 || (k < 0.5 && ((mx > 235 && mn > 235) || mx < 20))) continue; // skip transparent (and white/black for full icons)
          const w = 1 + (mx - mn) / 64; // favor saturated pixels
          r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; n += w;
        }
        if (!n) return cb(null);
        k = k || 0.42; // darken for a premium, low-glare tile
        cb("rgb(" + Math.round(r / n * k) + "," + Math.round(g / n * k) + "," + Math.round(b / n * k) + ")");
      } catch (e) { cb(null); }
    };
    img.onerror = () => cb(null);
    img.src = src;
  }

  // Each tile = the app's own logo, about the size the name text was, on a tile
  // tinted from the app's brand color. Logos come from the installed apps.
  function paintTile(t, app) {
    const clip = t.querySelector(".clip");
    const draw = (data) => {
      const logo = document.createElement("div");
      logo.className = "logo";
      if (data && (data.fg || data.src)) {
        const img = document.createElement("img");
        if (data.fg) {
          img.src = data.fg;          // adaptive icon symbol, transparent background
          img.className = "fg";
          tintFrom(data.bg || data.src, (c) => { if (c) clip.style.setProperty("--tint", c); }, 0.55);
        } else {
          img.src = data.src;         // legacy icon (has its own background)
          img.className = "full";
          tintFrom(data.src, (c) => { if (c) clip.style.setProperty("--tint", c); }, 0.42);
        }
        img.onerror = () => { logo.innerHTML = ""; logo.appendChild(wordmark(app)); };
        logo.appendChild(img);
      } else {
        logo.appendChild(wordmark(app));
        if (app.color) clip.style.setProperty("--tint", app.color);
      }
      clip.insertBefore(logo, clip.firstChild);
    };
    if (!N) return draw(null);
    if (iconData[app.pkg]) return draw(iconData[app.pkg]);
    // Load icons off the critical path so the screen appears instantly.
    setTimeout(() => {
      let data = null;
      try { data = JSON.parse(N.getIcon(app.pkg)); } catch (e) {}
      iconData[app.pkg] = data;
      draw(data);
    }, 0);
  }
  function wordmark(app) {
    const w = document.createElement("div");
    w.className = "word";
    w.textContent = app.label;
    return w;
  }

  // ---------- dock: inputs + settings + edit ----------
  function renderDock() {
    const dock = $("dock");
    dock.innerHTML = "";
    let inputs = [];
    if (N && N.getInputs) { try { inputs = JSON.parse(N.getInputs()); } catch (e) {} }
    else inputs = [{ id: "demo1", label: "HDMI 1" }, { id: "demo2", label: "HDMI 2" }];
    if (inputs.length) {
      const lab = document.createElement("span");
      lab.className = "group-label";
      lab.textContent = "Inputs";
      dock.appendChild(lab);
      inputs.forEach((inp) => dock.appendChild(chip(inp.label, "input", { input: inp.id })));
    }
    const sp = document.createElement("div");
    sp.className = "spacer";
    dock.appendChild(sp);
    dock.appendChild(chip(editing ? "Done" : "Edit", "edit"));
    dock.appendChild(chip("Settings", "settings"));
  }
  function chip(text, action, data) {
    const c = document.createElement("div");
    c.className = "chip";
    c.tabIndex = 0;
    c.dataset.nav = "1";
    c.dataset.action = action;
    Object.keys(data || {}).forEach((k) => (c.dataset[k] = data[k]));
    c.textContent = text;
    return c;
  }

  // ---------- focus + spatial navigation ----------
  const TILT = { left: [0, -7, -40, 0], right: [0, 7, 40, 0], up: [7, 0, 0, -60], down: [-7, 0, 0, 20] };
  function focusEl(el, dir) {
    if (!el) return;
    el.focus({ preventScroll: true });
    // tvOS-style: the card tilts toward where you came from, then settles.
    const clip = el.querySelector && el.querySelector(".clip");
    if (clip && dir && TILT[dir]) {
      const [rx, ry, gx, gy] = TILT[dir];
      clip.style.transition = "none";
      clip.style.setProperty("--rx", rx + "deg");
      clip.style.setProperty("--ry", ry + "deg");
      clip.style.setProperty("--gx", gx);
      clip.style.setProperty("--gy", gy);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        clip.style.transition = "";
        clip.style.setProperty("--rx", "0deg");
        clip.style.setProperty("--ry", "0deg");
        clip.style.setProperty("--gx", 0);
        clip.style.setProperty("--gy", -30);
      }));
    }
    // Keep the focused tile comfortably inside the app area.
    const main = document.querySelector("main");
    if (main.contains(el)) {
      const r = el.getBoundingClientRect(), m = main.getBoundingClientRect();
      const pad = m.height * 0.14;
      let target = main.scrollTop;
      if (r.top < m.top + pad) target -= (m.top + pad - r.top);
      else if (r.bottom > m.bottom - pad * 2) target += (r.bottom - (m.bottom - pad * 2));
      if (target !== main.scrollTop) main.scrollTo({ top: target, behavior: "smooth" });
    }
  }
  // Hitting an edge gives a little nudge instead of doing nothing.
  function bump(el, dir) {
    if (!el || !el.animate) return;
    const d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
    const base = getComputedStyle(el).transform;
    const off = "translate(" + d[0] * 0.5 + "vw," + d[1] * 0.5 + "vw) ";
    el.animate([{ transform: base }, { transform: off + (base === "none" ? "" : base) }, { transform: base }],
      { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
  function focusFirst() {
    const el = document.querySelector("#apps .tile") || document.querySelector("[data-nav]");
    document.querySelector("main").scrollTop = 0;
    focusEl(el);
  }
  function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function move(dir) {
    const cur = document.activeElement;
    const all = Array.from(document.querySelectorAll("[data-nav]"));
    if (!cur || !cur.dataset || !cur.dataset.nav) return focusFirst();
    const cr = cur.getBoundingClientRect(), c = center(cr);
    let best = null, bestScore = Infinity;
    all.forEach((el) => {
      if (el === cur) return;
      const r = el.getBoundingClientRect(), p = center(r);
      const dx = p.x - c.x, dy = p.y - c.y;
      let primary, ortho;
      if (dir === "left")  { if (dx >= -1) return; primary = -dx; ortho = Math.abs(dy); }
      if (dir === "right") { if (dx <= 1) return;  primary = dx;  ortho = Math.abs(dy); }
      if (dir === "up")    { if (dy >= -1) return; primary = -dy; ortho = Math.abs(dx); }
      if (dir === "down")  { if (dy <= 1) return;  primary = dy;  ortho = Math.abs(dx); }
      // Prefer staying in the same row/column.
      const score = primary + ortho * (dir === "left" || dir === "right" ? 6 : 1.4);
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) focusEl(best, dir); else bump(cur, dir);
  }

  // ---------- edit mode ----------
  function setEditing(on) {
    editing = on;
    picked = null;
    document.body.classList.toggle("editing", on);
    renderApps();
    renderDock();
    if (on) {
      focusFirst();
      hint("Edit: OK to pick up · ◀ ▶ to move · ▼ to hide/show · Back when done", 0);
    } else {
      saveLayout();
      hint("Layout saved");
      focusFirst();
    }
  }
  function moveApp(pkg, delta) {
    // Move among visible-in-edit order (all apps), skipping nothing.
    const i = order.indexOf(pkg), j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    order.splice(i, 1);
    order.splice(j, 0, pkg);
    renderApps(pkg);
  }

  // ---------- actions ----------
  function activate(el) {
    if (!el || !el.dataset) return;
    const a = el.dataset.action;
    if (a === "app") {
      const pkg = el.dataset.pkg;
      if (editing) {
        picked = picked === pkg ? null : pkg;
        renderApps(pkg);
        return;
      }
      if (N) { if (!N.launch(pkg)) hint("Couldn't open that app"); }
      else hint("Preview: would open " + (appByPkg(pkg) || {}).label);
    } else if (a === "input") {
      if (N) { if (!N.openInput(el.dataset.input)) hint("This TV didn't accept that input"); }
      else hint("Preview: would switch to " + el.textContent);
    } else if (a === "settings") {
      if (N) N.openSettings(); else hint("Preview: would open Settings");
    } else if (a === "edit") {
      setEditing(!editing);
    }
  }

  function back() {
    if (picked) { picked = null; renderApps(); return; }
    if (editing) { setEditing(false); return; }
    focusFirst();
  }

  document.addEventListener("keydown", (e) => {
    const k = e.key;
    const dir = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" }[k];
    if (dir) {
      e.preventDefault();
      if (picked) {
        if (dir === "left") return moveApp(picked, -1);
        if (dir === "right") return moveApp(picked, 1);
        if (dir === "down" || dir === "up") {
          if (hidden.has(picked)) hidden.delete(picked); else hidden.add(picked);
          return renderApps(picked);
        }
      }
      return move(dir);
    }
    if (k === "Enter" || k === " " || k === "NumpadEnter") { e.preventDefault(); return activate(document.activeElement); }
    if (k === "Escape" || k === "Backspace" || k === "GoBack" || k === "BrowserBack") { e.preventDefault(); return back(); }
    if (k === "ContextMenu" || k === "e") { e.preventDefault(); return setEditing(!editing); }
  });

  // ---------- native hooks ----------
  window.onNativeBack = back;
  window.onNativeMenu = () => setEditing(!editing);
  window.onNativeHome = () => { if (editing) setEditing(false); focusFirst(); };
  window.onAppsChanged = () => { loadApps(); };
  window.onNativeResume = () => {
    tickClock();
    if (Date.now() - lastWeather > 15 * 60000) loadWeather();
    if (Date.now() - lastScores > 2 * 60000) loadScores();
    renderDock();
  };

  // ---------- boot ----------
  tickClock();
  setInterval(tickClock, 1000);
  loadApps();
  renderDock();
  loadWeather();
  setInterval(loadWeather, 15 * 60000);
  loadScores();
  focusFirst();
})();
