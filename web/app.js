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
  function getText(url) {
    if (N && N.httpGet) {
      return new Promise((resolve, reject) => {
        const id = "cb" + (++cbSeq);
        pending[id] = { resolve, reject };
        N.httpGet(url, id);
        setTimeout(() => { if (pending[id]) { delete pending[id]; reject(new Error("timeout")); } }, 30000);
      });
    }
    return fetch(url).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); });
  }
  function getJSON(url) { return getText(url).then(JSON.parse); }

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
    const apply = (d) => {
      $("w-temp").textContent = Math.round(d.current.temperature_2m) + "°";
      $("w-cond").textContent = WMO[d.current.weather_code] || "";
      $("weather").classList.add("ready");
      $("w-range").textContent = "H " + Math.round(d.daily.temperature_2m_max[0]) + "°  L " + Math.round(d.daily.temperature_2m_min[0]) + "°";
    };
    const cached = store.get("bh.c.weather", null);
    if (cached && Date.now() - cached.t < 3 * 3600000 && !lastWeather) { try { apply(cached.d); } catch (e) {} }
    getJSON(url).then((d) => {
      lastWeather = Date.now();
      store.set("bh.c.weather", { t: Date.now(), d });
      apply(d);
    }).catch(() => {});
  }

  // ---------- helpers ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function ago(ms) {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 60) return m + "m ago";
    const h = Math.round(m / 60);
    if (h < 24) return h + "h ago";
    const d = Math.round(h / 24);
    return d + "d ago";
  }
  function openApp(pkgs) {
    const installed = new Set(allApps.map((a) => a.pkg));
    const pkg = (pkgs || []).find((p) => installed.has(p));
    if (!N) return hint("Preview: would open " + ((pkgs || [])[0] || "app"));
    if (!pkg || !N.launch(pkg)) hint("None of the apps for this game are installed");
  }

  // ---------- YouTube: latest from chosen channels (public RSS, no sign-in) ----------
  let lastYT = 0;
  // Turn a @handle or name into a channel ID once, then remember it on the TV.
  function resolveChannel(c) {
    if (c.id) return Promise.resolve(c.id);
    const cache = store.get("bh.ytids", {});
    const key = c.handle || c.name;
    if (cache[key]) return Promise.resolve(cache[key]);
    const find = (url) => getText(url).then((html) => {
      const m = html.match(/"(?:externalId|browseId|channelId)":"(UC[\w-]{22})"/) || html.match(/channel\/(UC[\w-]{22})/);
      if (!m) throw new Error("no id");
      return m[1];
    });
    let p = c.handle ? find("https://www.youtube.com/" + c.handle) : Promise.reject();
    p = p.catch(() => find("https://www.youtube.com/results?search_query=" + encodeURIComponent(c.name) + "&sp=EgIQAg%253D%253D"));
    return p.then((id) => { cache[key] = id; store.set("bh.ytids", cache); return id; });
  }
  let ytBusy = false;
  function loadYouTube(force) {
    if (ytBusy) return;
    ytBusy = true;
    const btn = $("yt-refresh");
    if (btn) btn.classList.add("spin");
    const yt = CFG.youtube || {};
    const chans = yt.channels || [];
    const cachedYT = store.get("bh.c.yt", null);
    if (!force && cachedYT && !lastYT && Date.now() - cachedYT.t < 24 * 3600000) renderYouTube(cachedYT.v);
    $("yt-sub").textContent = chans.length + " channels";
    const perChan = store.get("bh.c.ytch", {});
    const feed = (id) => {
      const url = "https://www.youtube.com/feeds/videos.xml?channel_id=" + id + (force ? "&_=" + Date.now() : "");
      return getText(url).catch(() => new Promise((r) => setTimeout(r, 1500)).then(() => getText(url))); // YouTube feeds blip; retry once
    };
    Promise.all(chans.map((c) =>
      resolveChannel(c).then(feed).then((xml) => {
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        return Array.from(doc.getElementsByTagName("entry")).slice(0, 8).map((en) => {
          const vid = (en.getElementsByTagName("yt:videoId")[0] || {}).textContent;
          const link = en.getElementsByTagName("link")[0];
          const thumb = en.getElementsByTagName("media:thumbnail")[0];
          return {
            id: vid,
            title: (en.getElementsByTagName("title")[0] || {}).textContent || "",
            when: Date.parse((en.getElementsByTagName("published")[0] || {}).textContent || "") || 0,
            channel: c.name,
            short: !!(link && /\/shorts\//.test(link.getAttribute("href") || "")),
            thumb: "https://i.ytimg.com/vi/" + vid + "/hqdefault.jpg",
            thumbAlt: thumb && thumb.getAttribute("url"),
          };
        }).filter((v) => v.id && !(yt.skipShorts !== false && v.short));
      }).then((list) => {
        if (list.length) perChan[c.name] = list.slice(0, 3);
        return list.length ? list : (perChan[c.name] || []);
      }).catch(() => perChan[c.name] || []) // use the last good videos for this channel
    )).then((lists) => {
      lastYT = Date.now();
      // Each channel's newest video, then the newest of those across channels.
      store.set("bh.c.ytch", perChan);
      const n = yt.count || 3;
      lists.forEach((l) => l.sort((a, b) => b.when - a.when));
      const newest = lists.map((l) => l[0]).filter(Boolean).sort((a, b) => b.when - a.when);
      const pick = newest.slice(0, n);
      // Fewer channels answered than boxes to fill: top up with their next-newest videos.
      if (pick.length < n) {
        const extra = [].concat.apply([], lists.map((l) => l.slice(1))).sort((a, b) => b.when - a.when);
        extra.forEach((v) => { if (pick.length < n && !pick.some((p) => p.id === v.id)) pick.push(v); });
      }
      if (pick.length || !cachedYT) { store.set("bh.c.yt", { t: Date.now(), v: pick }); renderYouTube(pick); }
      ytBusy = false;
      if (btn) btn.classList.remove("spin");
      if (force) hint(pick.length ? "YouTube refreshed" : "Couldn't reach YouTube right now");
    });
  }
  function renderYouTube(vids) {
    const row = $("yt-row");
    const keep = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.vid;
    row.innerHTML = "";
    if (!vids.length) { row.appendChild(el("div", "yt-empty", "Couldn't load videos right now")); return; }
    vids.forEach((v) => {
      const t = el("div", "vid");
      t.tabIndex = 0;
      t.dataset.nav = "1";
      t.dataset.action = "video";
      t.dataset.vid = v.id;
      const th = el("div", "thumb");
      const img = new Image();
      img.src = v.thumb;
      img.onerror = () => { if (v.thumbAlt && img.src !== v.thumbAlt) img.src = v.thumbAlt; };
      th.appendChild(img);
      t.appendChild(th);
      t.appendChild(el("div", "vt", v.title));
      t.appendChild(el("div", "vm", v.channel + " · " + ago(v.when)));
      row.appendChild(t);
    });
    if (keep) { const k = row.querySelector('[data-vid="' + keep + '"]'); if (k) k.focus({ preventScroll: true }); }
  }
  function playVideo(id) {
    const url = "https://www.youtube.com/watch?v=" + id;
    if (!N) return hint("Preview: would play " + url);
    if (!(N.openUrl && N.openUrl(url, "com.google.android.youtube.tv"))) hint("Couldn't open YouTube");
  }

  // ---------- Live games on your services (rotating), else the next one ----------
  let gameTimer, rotTimer, lastGame = 0, currentGame = null, gameList = [], gameIdx = 0, gameMode = "live";
  function ymd(d) { return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0"); }
  function netKey(name) {
    // Exact (case-insensitive) match so "ESPN+" doesn't count as "ESPN".
    const map = (CFG.games || {}).networkApps || {};
    const n = String(name || "").trim().toLowerCase();
    return Object.keys(map).find((k) => k.toLowerCase() === n) || null;
  }
  function loadGame() {
    const G = CFG.games || {};
    const cg = store.get("bh.c.games", null);
    if (cg && !lastGame && Date.now() - cg.t < 5 * 60000 && cg.list && cg.list.length) {
      gameList = cg.list; gameMode = cg.mode; showGame(0, false);
    }
    const tomorrow = new Date(Date.now() + 86400000);
    const urls = [];
    (G.leagues || []).forEach((lg) => {
      const base = "https://site.api.espn.com/apis/site/v2/sports/" + lg.sport + "/" + lg.league + "/scoreboard";
      urls.push({ lg, url: base });
      if (lg.league === "nba") urls.push({ lg, url: base + "?dates=" + ymd(tomorrow) });
    });
    Promise.all(urls.map((u) => getJSON(u.url).then((d) => (d.events || []).map((ev) => parseEvent(ev, u.lg))).catch(() => []))).then((lists) => {
      lastGame = Date.now();
      const seen = new Set();
      const all = [].concat.apply([], lists)
        .filter((g) => g && !seen.has(g.id) && seen.add(g.id))
        .filter((g) => g.keys.length); // only games on your services
      const live = all.filter((g) => g.state === "in").sort((a, b) => b.rank - a.rank);
      const next = all.filter((g) => g.state === "pre" && g.when > Date.now() - 600000).sort((a, b) => a.when - b.when);
      const prevId = currentGame && currentGame.id;
      gameMode = live.length ? "live" : "next";
      gameList = live.length ? live : next.slice(0, 1);
      gameIdx = Math.max(0, gameList.findIndex((g) => g.id === prevId));
      store.set("bh.c.games", { t: Date.now(), list: gameList, mode: gameMode });
      showGame(gameIdx, false);
      clearInterval(rotTimer);
      if (gameList.length > 1) rotTimer = setInterval(() => showGame(gameIdx + 1, true), ((G.rotateSeconds || 10) * 1000));
      clearTimeout(gameTimer);
      gameTimer = setTimeout(loadGame, live.length ? 30000 : 300000);
    });
  }
  function showGame(i, animate) {
    if (!gameList.length) { currentGame = null; return renderGame(null); }
    gameIdx = ((i % gameList.length) + gameList.length) % gameList.length;
    currentGame = gameList[gameIdx];
    const box = $("gamebox");
    if (animate && box.firstChild) {
      box.classList.add("swap");
      setTimeout(() => { renderGame(currentGame); box.classList.remove("swap"); }, 220);
    } else renderGame(currentGame);
  }
  function parseEvent(ev, lg) {
    const c = ev.competitions && ev.competitions[0];
    if (!c) return null;
    const st = (c.status && c.status.type) || {};
    const sides = (c.competitors || []).slice().sort((a) => (a.homeAway === "away" ? -1 : 1)).map((x) => ({
      ab: (x.team && x.team.abbreviation) || "",
      logo: (x.team && x.team.logo) || "",
      score: x.score && typeof x.score === "object" ? x.score.displayValue : x.score,
      rec: x.records && x.records[0] && x.records[0].summary,
    }));
    // Every network this game airs on, from both ESPN broadcast lists.
    const nets = [];
    (c.broadcasts || []).forEach((b) => (b.names || []).forEach((n) => nets.push(n)));
    (c.geoBroadcasts || []).forEach((b) => b.media && b.media.shortName && nets.push(b.media.shortName));
    const keys = Array.from(new Set(nets.map(netKey).filter(Boolean)));
    const national = (c.broadcasts || []).some((b) => b.market === "national");
    const a = Number(sides[0] && sides[0].score) || 0, h = Number(sides[1] && sides[1].score) || 0;
    const period = (c.status && c.status.period) || 0;
    const rank = (national ? 40 : 0) - Math.abs(a - h) * 2 + period * 4; // close, late, national first
    return {
      id: ev.id, league: lg.label || lg.league.toUpperCase(), lgKey: lg.league,
      state: st.state, detail: st.shortDetail || st.detail || "", when: Date.parse(ev.date),
      sides, keys, network: keys[0] || "", rank,
    };
  }
  function appsFor(game) {
    const map = (CFG.games || {}).networkApps || {};
    return [].concat.apply([], (game.keys || []).map((k) => map[k] || []));
  }
  function serviceName(game) {
    const installed = new Set(allApps.map((a) => a.pkg));
    const pkg = appsFor(game).find((p) => installed.has(p)) || appsFor(game)[0];
    const app = pkg && appByPkg(pkg);
    if (app) return app.label;
    return { "com.sling": "Sling", "com.peacocktv.peacockandroid": "Peacock", "com.amazon.amazonvideo.livingroom": "Prime Video",
      "com.netflix.ninja": "Netflix", "com.gotv.nflgamecenter.us.lite": "NFL" }[pkg] || game.network;
  }
  function countdown(ms) {
    const m = Math.max(0, Math.round((ms - Date.now()) / 60000));
    if (m < 60) return "in " + m + "m";
    const h = Math.floor(m / 60);
    if (h < 24) return "in " + h + "h " + (m % 60) + "m";
    return "in " + Math.round(h / 24) + "d";
  }
  function renderGame(g) {
    const box = $("gamebox");
    box.innerHTML = "";
    if (!g) {
      box.removeAttribute("tabindex");
      delete box.dataset.nav;
      const head = el("div", "panel-head");
      head.appendChild(el("span", "panel-title", "Games"));
      box.appendChild(head);
      box.appendChild(el("div", "yt-empty", "No NFL or NBA games on your services right now"));
      return;
    }
    box.tabIndex = 0;
    box.dataset.nav = "1";
    box.dataset.action = "game";
    const head = el("div", "panel-head");
    head.appendChild(el("span", "gb-pill " + (g.state === "in" ? "live" : "next"), g.state === "in" ? "LIVE" : "NEXT UP"));
    head.appendChild(el("span", "gb-league", g.league));
    if (gameList.length > 1) {
      const dots = el("span", "gb-dots");
      gameList.forEach((_, k) => dots.appendChild(el("i", k === gameIdx ? "on" : "")));
      head.appendChild(dots);
    }
    box.appendChild(head);
    const teams = el("div", "gb-teams");
    const a = Number(g.sides[0] && g.sides[0].score), h = Number(g.sides[1] && g.sides[1].score);
    g.sides.forEach((s, i) => {
      const row = el("div", "gb-team");
      if (g.state === "in" && a !== h) row.classList.add((i === 0 ? a > h : h > a) ? "lead" : "trail");
      if (s.logo) { const im = new Image(); im.alt = ""; im.onerror = () => im.remove(); im.src = s.logo; row.appendChild(im); }
      row.appendChild(el("span", "ab", s.ab));
      if (g.state !== "in" && s.rec) row.appendChild(el("span", "rec", s.rec));
      if (g.state === "in") row.appendChild(el("span", "pts", s.score != null ? s.score : ""));
      teams.appendChild(row);
    });
    box.appendChild(teams);
    const foot = el("div", "gb-foot");
    if (g.state === "in") {
      foot.appendChild(el("span", "clock-txt", g.detail));
    } else {
      const when = new Date(g.when);
      const today = new Date().toDateString() === when.toDateString();
      foot.appendChild(el("span", "clock-txt",
        (today ? "Tonight " : when.toLocaleDateString(undefined, { weekday: "short" }) + " ") +
        when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) + " · " + countdown(g.when)));
    }
    foot.appendChild(el("span", "gb-watch", "on " + serviceName(g) + " ›"));
    box.appendChild(foot);
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
      t.setAttribute("aria-label", app.label);
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
    } else if (a === "video") {
      playVideo(el.dataset.vid);
    } else if (a === "ytrefresh") {
      loadYouTube(true);
    } else if (a === "game") {
      if (currentGame) openApp(appsFor(currentGame));
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
    if (pickerOpen) return pickerKey(e);
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
      if (dir === "right" && document.activeElement && document.activeElement.id === "gamebox" && gameList.length > 1) {
        showGame(gameIdx + 1, true);
        clearInterval(rotTimer);
        rotTimer = setInterval(() => showGame(gameIdx + 1, true), (((CFG.games || {}).rotateSeconds || 10) * 1000));
        return;
      }
      return move(dir);
    }
    if (k === "Enter" || k === " " || k === "NumpadEnter") { e.preventDefault(); return activate(document.activeElement); }
    if (k === "Escape" || k === "Backspace" || k === "GoBack" || k === "BrowserBack") { e.preventDefault(); return back(); }
    if (k === "ContextMenu" || k === "e") { e.preventDefault(); return setEditing(!editing); }
  });


  // ---------- experience picker (shown when the TV turns on) ----------
  let pickerOpen = false, pickTimer = null, pickLeft = 0;
  const PICK_SECONDS = 10;
  function showPicker() {
    const p = $("picker");
    const hr = new Date().getHours();
    $("pk-greet").textContent = (hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening") + ", Luke";
    $("pk-time").textContent = $("time").textContent;
    pickerOpen = true;
    p.classList.add("show");
    p.setAttribute("aria-hidden", "false");
    const last = store.get("bh.lastChoice", "brosi");
    const card = p.querySelector('[data-choice="' + last + '"]') || p.querySelector(".pk-card");
    card.focus({ preventScroll: true });
    pickLeft = PICK_SECONDS;
    tickPick();
    clearInterval(pickTimer);
    pickTimer = setInterval(tickPick, 1000);
  }
  function tickPick() {
    const f = document.activeElement;
    const name = f && f.dataset && f.dataset.choice === "google" ? "Google TV" : "Brosi Home";
    $("pk-count").textContent = pickLeft > 0 ? "Opening " + name + " in " + pickLeft + "…" : "";
    if (pickLeft-- <= 0) choose(f && f.dataset ? f.dataset.choice : "brosi");
  }
  function stopCountdown() { clearInterval(pickTimer); pickTimer = null; $("pk-count").textContent = ""; }
  function hidePicker() {
    stopCountdown();
    pickerOpen = false;
    const p = $("picker");
    p.classList.remove("show");
    p.setAttribute("aria-hidden", "true");
  }
  function choose(which) {
    which = which === "google" ? "google" : "brosi";
    store.set("bh.lastChoice", which);
    if (which === "google") {
      if (N && N.openStockHome) N.openStockHome(); else hint("Preview: would open Google TV");
      setTimeout(hidePicker, 600);
    } else {
      hidePicker();
      focusFirst();
    }
  }
  function pickerKey(e) {
    const k = e.key;
    const cards = Array.from(document.querySelectorAll(".pk-card"));
    const i = cards.indexOf(document.activeElement);
    if (k === "ArrowLeft" || k === "ArrowRight") {
      e.preventDefault();
      stopCountdown(); // any input means they're choosing themselves
      const next = cards[(i + (k === "ArrowRight" ? 1 : -1) + cards.length) % cards.length];
      next.focus({ preventScroll: true });
      return true;
    }
    if (k === "Enter" || k === " " || k === "NumpadEnter") {
      e.preventDefault();
      choose(document.activeElement && document.activeElement.dataset.choice);
      return true;
    }
    if (k === "Escape" || k === "Backspace" || k === "GoBack" || k === "BrowserBack") {
      e.preventDefault();
      choose("brosi");
      return true;
    }
    e.preventDefault();
    return true; // swallow other keys while open
  }
  window.onNativePick = showPicker;

  // ---------- native hooks ----------
  window.onNativeBack = () => { if (pickerOpen) choose("brosi"); else back(); };
  window.onNativeMenu = () => { if (!pickerOpen) setEditing(!editing); };
  window.onNativeHome = () => { if (editing) setEditing(false); focusFirst(); };
  window.onAppsChanged = () => { loadApps(); };
  window.onNativeResume = () => {
    tickClock();
    if (Date.now() - lastWeather > 15 * 60000) loadWeather();
    if (Date.now() - lastGame > 60000) loadGame();
    if (Date.now() - lastYT > 20 * 60000) loadYouTube();
    renderDock();
  };

  // ---------- instant launch: keep the interface itself on the TV ----------
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    try { navigator.serviceWorker.register("sw.js").catch(() => {}); } catch (e) {}
  }

  // ---------- boot ----------
  tickClock();
  setInterval(tickClock, 1000);
  loadApps();
  renderDock();
  loadWeather();
  setInterval(loadWeather, 15 * 60000);
  loadGame();
  loadYouTube();
  setInterval(loadYouTube, 30 * 60000);
  setInterval(() => { if (currentGame && currentGame.state !== "in") renderGame(currentGame); }, 60000); // tick countdown
  focusFirst();
  if (N && N.takeLaunchMode && N.takeLaunchMode() === "pick") showPicker();
  if (!N && /[?&]pick\b/.test(location.search)) showPicker(); // browser preview: ?pick
})();
