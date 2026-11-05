// Edit this file on GitHub to change what the TV shows.
// Changes go live on the TV within ~10 minutes (or after a restart) — no reinstall.
window.TV_CONFIG = {
  weather: {
    city: "Washington, DC",
    lat: 38.8951,
    lon: -77.0364,
    units: "fahrenheit", // or "celsius"
  },

  // Teams to show scores for. sport/league/abbr follow ESPN's naming.
  teams: [
    { sport: "football",   league: "nfl", abbr: "wsh", name: "Commanders" },
    { sport: "basketball", league: "nba", abbr: "wsh", name: "Wizards" },
    { sport: "hockey",     league: "nhl", abbr: "wsh", name: "Capitals" },
    { sport: "baseball",   league: "mlb", abbr: "wsh", name: "Nationals" },
  ],

  // Only show games within this many days (past results and upcoming).
  scoreWindowDays: 4,

  // First-run app order (by Android package name). Anything not listed
  // goes after these, alphabetically. Reorder on the TV with Edit.
  defaultOrder: [
    "com.google.android.youtube.tv",
    "com.netflix.ninja",
    "com.hulu.livingroomplus",
    "com.disney.disneyplus",
    "com.wbd.stream",
    "com.amazon.amazonvideo.livingroom",
    "com.peacocktv.peacockandroid",
    "com.cbs.ott",
    "com.espn.score_center",
    "com.google.android.youtube.tvunplugged",
    "com.spotify.tv.android",
    "com.apple.atve.androidtv.appletv",
  ],

  // Apps hidden on first run (bloat that can't be uninstalled).
  defaultHidden: [
    "com.google.android.play.games",
    "com.google.android.apps.tv.dreamx",
    "com.google.android.tv.remote.service",
  ],
};
