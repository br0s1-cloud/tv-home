// Edit this file on GitHub to change what the TV shows.
// Changes go live on the TV within ~10 minutes (or after a restart) — no reinstall.
window.TV_CONFIG = {
  weather: {
    city: "Washington, DC",
    lat: 38.8951,
    lon: -77.0364,
    units: "fahrenheit", // or "celsius"
  },

  // Middle box: latest videos from these YouTube channels (newest first).
  // Find a channel ID: open the channel on youtube.com > About > Share > Copy channel ID.
  youtube: {
    count: 3,
    channels: [
      { id: "UCWJ2lWNubArHWmf3FIHbfcQ", name: "NBA" },
      { id: "UCDVYQ4Zhbm3S2dlz7P1GBDg", name: "NFL" },
    ],
  },

  // Right box: the best live NFL/NBA game, or the next big game with a countdown.
  games: {
    leagues: [
      { sport: "football",   league: "nfl", label: "NFL" },
      { sport: "basketball", league: "nba", label: "NBA" },
    ],
    // Which app opens when you press OK on the game, by TV network (first installed wins).
    networkApps: {
      "Prime":   ["com.amazon.amazonvideo.livingroom"],
      "Netflix": ["com.netflix.ninja"],
      "Peacock": ["com.peacocktv.peacockandroid"],
      "NBC":     ["com.peacocktv.peacockandroid", "com.sling"],
      "ESPN":    ["com.sling"],
      "ABC":     ["com.sling"],
      "TNT":     ["com.sling"],
      "TBS":     ["com.sling"],
      "truTV":   ["com.sling"],
      "FOX":     ["com.sling"],
      "FS1":     ["com.sling"],
      "NFL Net": ["com.gotv.nflgamecenter.us.lite", "com.sling"],
      "NBA TV":  ["com.nbaimd.gametime.nba2011", "com.sling"],
    },
    // Then the league's own app, then anything that can show live sports.
    leagueApps: {
      nfl: ["com.gotv.nflgamecenter.us.lite"],
      nba: ["com.nbaimd.gametime.nba2011"],
    },
    fallbackApps: ["com.sling", "com.peacocktv.peacockandroid", "com.amazon.amazonvideo.livingroom"],
  },

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
    "com.sling",
    "com.nbaimd.gametime.nba2011",
    "com.gotv.nflgamecenter.us.lite",
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
