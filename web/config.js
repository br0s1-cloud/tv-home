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
    count: 3,          // videos shown (newest first, at most one per channel)
    skipShorts: true,
    // Use the channel ID (UC...) when known; otherwise a @handle or name is looked up once on the TV.
    channels: [
      { id: "UCTDMN4NwdZ0VVbvvjTTSqpA", name: "Tim Dillon Show Clips" },
      { id: "UC-AQKm7HUNMmxjdS371MSwg", name: "Channel 5" },
      { id: "UCDVYQ4Zhbm3S2dlz7P1GBDg", name: "NFL" },
      { id: "UCWJ2lWNubArHWmf3FIHbfcQ", name: "NBA" },
      { id: "UCtG-elouHQdUnpN9cVLdltg", name: "A.M. Hoops" },
      { id: "UC3M0vCYuGAEDy7SX1cWSqLw", name: "Higher Levels" },
      { id: "UCfpCQ89W9wjkHc8J_6eTbBg", name: "Outdoor Boys" },
      { id: "UCrvchO1h6lWZAuGaa1LqX9Q", name: "MoreMozi" },
      { id: "UC-uhvujip5deVcEtLxnW8qg", name: "TLDR Global" },
      { handle: "@TLDRbusiness", name: "TLDR Business" },
      { handle: "@30MPC", name: "30 Minutes to President's Club" },
    ],
  },

  // Right box: every live NFL/NBA game on the services you pay for, rotating
  // (~10s each; press Right on the box to skip). If nothing is live, the next one.
  games: {
    leagues: [
      { sport: "football",   league: "nfl", label: "NFL" },
      { sport: "basketball", league: "nba", label: "NBA" },
    ],
    rotateSeconds: 10,
    // TV network (as ESPN lists it) -> the app(s) you'd watch it in. A game only shows
    // if at least one of its networks is listed here. First installed app wins.
    // Your Sling: Orange + Blue, both Sports Extras, and local FOX/NBC/ABC.
    networkApps: {
      "Prime Video": ["com.amazon.amazonvideo.livingroom"],
      "Prime":       ["com.amazon.amazonvideo.livingroom"],
      "Netflix":     ["com.netflix.ninja"],
      "Peacock":     ["com.peacocktv.peacockandroid"],
      "NBC":         ["com.peacocktv.peacockandroid", "com.sling"],
      "NFL Network": ["com.gotv.nflgamecenter.us.lite", "com.sling"],
      "NFL Net":     ["com.gotv.nflgamecenter.us.lite", "com.sling"],
      "NFL+":        ["com.gotv.nflgamecenter.us.lite"],
      "ESPN":        ["com.sling"],
      "ESPN2":       ["com.sling"],
      "TNT":         ["com.sling"],
      "TBS":         ["com.sling"],
      "truTV":       ["com.sling"],
      "FOX":         ["com.sling"],
      "ABC":         ["com.sling"],
      "ESPNU":       ["com.sling"],
      "ESPNEWS":     ["com.sling"],
      "FS1":         ["com.sling"],
      "USA Net":     ["com.sling"],
      "NBA TV":      ["com.sling"],
    },
  },

  // Home screen 2x2: YouTube + Spotify fixed; two "arrow down to flip" stacks.
  // Stacks match installed apps by name, in this order (most used first).
  home: {
    youtube: "com.google.android.youtube.tv",
    music: "com.spotify.tv.android",
    entertainment: ["Netflix", "Prime Video", "Hulu", "Peacock", "Disney", "Max", "HBO", "Paramount",
      "Apple TV", "Tubi", "Pluto", "Crunchyroll", "Plex", "STARZ", "discovery", "AMC", "Philo", "YouTube TV"],
    sports: ["NFL", "NBA", "Sling", "ESPN", "FOX Sports", "CBS Sports", "NBC Sports", "DAZN", "MLB", "NHL",
      "Fubo", "Monumental", "FanDuel"],
  },

  // Live news: newest headlines across these sources (Reuters/AP/FT via Google News).
  news: {
    rotateSeconds: 7,
    sources: [
      { tag: "Reuters", gn: true, url: "https://news.google.com/rss/search?q=when:12h+site:reuters.com&hl=en-US&gl=US&ceid=US:en" },
      { tag: "AP",      gn: true, url: "https://news.google.com/rss/search?q=when:12h+site:apnews.com&hl=en-US&gl=US&ceid=US:en" },
      { tag: "BBC",               url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
      { tag: "FT",      gn: true, url: "https://news.google.com/rss/search?q=when:24h+site:ft.com&hl=en-US&gl=US&ceid=US:en" },
      { tag: "WSJ",               url: "https://feeds.content.dowjones.io/public/rss/RSSWorldNews" },
    ],
  },

  // Markets: rotates through these groups. [symbol, display name] or just "SYMBOL".
  markets: {
    rotateSeconds: 12,
    groups: [
      { name: "Indices & Big Tech/AI", symbols: [["^GSPC", "S&P 500"], ["^IXIC", "Nasdaq"], ["^DJI", "Dow"], "NVDA", "AAPL", "MSFT", "GOOGL", "META"] },
      { name: "Cybersecurity & SaaS",  symbols: ["CRWD", "PANW", "ZS", "NET", "FTNT", "S", "CRM", "NOW"] },
      { name: "Defense & Aerospace",   symbols: ["LMT", "RTX", "NOC", "GD", "LHX", "PLTR", "BA", "KTOS"] },
      { name: "Fortune 500 movers", movers: ["WMT", "AMZN", "AAPL", "UNH", "BRK-B", "CVS", "XOM", "GOOGL", "MCK", "COR",
        "COST", "JPM", "MSFT", "CAH", "CVX", "CI", "F", "BAC", "GM", "ELV", "C", "CNC", "HD", "MPC", "KR", "PSX", "VZ",
        "T", "CMCSA", "WFC", "GS", "MS", "TGT", "PEP", "JNJ", "PG", "DIS", "META", "NVDA", "TSLA", "INTC", "IBM", "ORCL",
        "UPS", "FDX", "LOW"] },
    ],
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
