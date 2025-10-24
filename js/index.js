// js/index.js — robust team picking + request guard + cache-busted squad fetch

const els = {
  form: document.getElementById("team-form"),
  input: document.getElementById("team-input"),
  bg: document.getElementById("bg"),
  name: document.getElementById("team-name"),
  stadium: document.getElementById("stadium"),
  error: document.getElementById("error"),
  next: document.getElementById("next-match"),
  formWrap: document.getElementById("recent-form"),
  bio: document.getElementById("team-bio"),
  players: document.getElementById("key-players"),
};

const API = {
  teamByName: (t) =>
    `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(t)}`,
  nextEvents: (id) =>
    `https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=${id}`,
  lastEvents: (id) =>
    `https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=${id}`,
  squad: (id) =>
    // cache-bust to avoid stale responses
    `https://www.thesportsdb.com/api/v1/json/3/lookup_all_players.php?id=${id}&_=${Date.now()}`,
};

const toHttps = (u) => (u ? u.replace(/^http:\/\//i, "https://") : u);
const viaProxy = (u) =>
  u ? `https://images.weserv.nl/?url=${encodeURIComponent(u.replace(/^https?:\/\//, ""))}` : u;

const pickBG = (team) => {
  const c = [
    team.strTeamFanart1,
    team.strTeamFanart2,
    team.strTeamFanart3,
    team.strTeamBanner,
    team.strStadiumThumb,
  ];
  const found = c.find(Boolean);
  return found ? viaProxy(toHttps(found)) : null;
};

async function fetchJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) {
    console.error("Fetch failed:", url, r.status, r.statusText);
    throw new Error(`HTTP ${r.status}`);
  }
  return r.json();
}

/* ---------- Team selection helper: choose the right team from results ---------- */
function chooseTeamByName(list, query) {
  const q = (query || "").toLowerCase().trim();
  if (!list || !list.length) return null;

  // 1) Exact name match
  const exact = list.find((t) => (t.strTeam || "").toLowerCase() === q);
  if (exact) return exact;

  // 2) Match against alternates (comma-separated)
  const altHit = list.find((t) =>
    (t.strAlternate || "")
      .toLowerCase()
      .split(",")
      .map((s) => s.trim())
      .includes(q)
  );
  if (altHit) return altHit;

  // 3) Partial match in official name
  const partial = list.find((t) => (t.strTeam || "").toLowerCase().includes(q));
  if (partial) return partial;

  // 4) Fallback to first
  return list[0];
}

/* ---------- RENDER HELPERS ---------- */
function renderNextMatch(team, event) {
  if (!event) {
    els.next.textContent = "No upcoming matches found.";
    return;
  }
  const isHome =
    (event.strHomeTeam || "").toLowerCase() === (team.strTeam || "").toLowerCase();
  const opponent = isHome ? event.strAwayTeam : event.strHomeTeam;
  const date =
    event.dateEvent || (event.strTimestamp ? event.strTimestamp.slice(0, 10) : "TBD");
  const comp = event.strLeague || event.strTournament || "—";
  els.next.innerHTML = `
    <div class="next-line"><strong>${team.strTeam}</strong> vs <strong>${opponent}</strong></div>
    <div class="next-chip">${comp}</div>
    <div class="next-chip">${date}</div>
  `;
}

function resultLetter(myGoals, oppGoals) {
  if (myGoals == null || oppGoals == null) return null;
  if (+myGoals > +oppGoals) return "W";
  if (+myGoals < +oppGoals) return "L";
  return "D";
}
function renderRecentForm(team, lastEvents) {
  els.formWrap.innerHTML = "";
  if (!lastEvents || !lastEvents.length) {
    els.formWrap.innerHTML = `<span class="muted">No recent matches found.</span>`;
    return;
  }
  const teamName = (team.strTeam || "").toLowerCase();
  lastEvents.slice(0, 5).forEach((ev) => {
    const isHome = (ev.strHomeTeam || "").toLowerCase() === teamName;
    const my = isHome ? ev.intHomeScore : ev.intAwayScore;
    const opp = isHome ? ev.intAwayScore : ev.intHomeScore;
    const letter = resultLetter(my, opp) || "-";
    const cls = letter.toLowerCase();
    const chip = document.createElement("div");
    chip.className = `form-chip ${cls}`;
    chip.textContent = letter;
    chip.title = `${ev.strEvent} • ${ev.dateEvent} • ${my ?? "?"}-${opp ?? "?"}`;
    els.formWrap.appendChild(chip);
  });
}

function safeLink(url) {
  if (!url) return null;
  const u = url.startsWith("http") ? url : `https://${url.replace(/^@/, "")}`;
  return u;
}
function bioItem(label, value) {
  return `<div class="bio-item"><strong>${label}:</strong> <br/> ${value || "—"}</div>`;
}
function renderBio(team) {
  const formed = team.intFormedYear ? String(team.intFormedYear) : "—";
  const manager = team.strManager || team.strCoach || "—";
  const location = team.strStadiumLocation || team.strCountry || "—";
  const website = safeLink(team.strWebsite);
  const twitter = safeLink(team.strTwitter);
  const instagram = safeLink(team.strInstagram);
  const facebook = safeLink(team.strFacebook);
  const youtube = safeLink(team.strYoutube);

  els.bio.innerHTML = `
    ${bioItem("Founded", formed)}
    ${bioItem("Manager/Coach", manager)}
    ${bioItem("League", team.strLeague || "—")}
    ${bioItem("Location", location)}
    <div class="bio-item">
      <strong>Links:</strong><br/>
      ${website ? `<a href="${website}" target="_blank" rel="noopener">Website</a>` : "—"}
      ${twitter ? ` • <a href="${twitter}" target="_blank" rel="noopener">Twitter</a>` : ""}
      ${instagram ? ` • <a href="${instagram}" target="_blank" rel="noopener">Instagram</a>` : ""}
      ${facebook ? ` • <a href="${facebook}" target="_blank" rel="noopener">Facebook</a>` : ""}
      ${youtube ? ` • <a href="${youtube}" target="_blank" rel="noopener">YouTube</a>` : ""}
    </div>
  `;
}

function renderPlayers(players) {
  els.players.innerHTML = "";
  if (!players || !players.length) {
    els.players.innerHTML = `<span class="muted">No players found.</span>`;
    return;
  }

  const posRank = (p) => {
    const pos = (p.strPosition || "").toLowerCase();
    if (/keep/.test(pos)) return 0;
    if (/def|back/.test(pos)) return 1;
    if (/mid/.test(pos)) return 2;
    if (/forw|wing|strik|attac/.test(pos)) return 3;
    return 4;
  };
  const sorted = [...players].sort((a, b) => {
    const pr = posRank(a) - posRank(b);
    if (pr !== 0) return pr;
    return (a.strPlayer || "").localeCompare(b.strPlayer || "");
  });

  const pick = sorted.slice(0, 12);
  pick.forEach((p) => {
    const photo =
      viaProxy(toHttps(p.strCutout || p.strThumb)) ||
      "https://via.placeholder.com/160x160?text=No+Photo";
    const card = document.createElement("div");
    card.className = "player-card";
    card.innerHTML = `
      <img class="player-photo" src="${photo}" alt="${p.strPlayer || "Player"}"
           onerror="this.src='https://via.placeholder.com/160x160?text=No+Photo'">
      <div class="player-name">${p.strPlayer || "—"}</div>
      <div class="player-pos">${p.strPosition || "—"}</div>
    `;
    els.players.appendChild(card);
  });
}

/* ---------- MAIN FLOW with request guard ---------- */
let activeRequestId = 0;

async function showTeam(query) {
  const requestId = ++activeRequestId;

  try {
    els.error.textContent = "";
    els.next.textContent = "Loading…";
    els.formWrap.innerHTML = "";
    els.bio.innerHTML = "";
    els.players.innerHTML = `<span class="muted">Loading players…</span>`;

    // 1) Get team list
    const tRes = await fetchJSON(API.teamByName(query));
    if (requestId !== activeRequestId) return; // stale

    if (!tRes.teams || !tRes.teams.length)
      throw new Error(`No team found for "${query}"`);

    // 2) Choose the best-matching team
    const team = chooseTeamByName(tRes.teams, query);
    if (!team) throw new Error(`No team found for "${query}"`);

    // Header + BG
    els.name.textContent = team.strTeam || "—";
    els.stadium.textContent = team.strStadium ? `Stadium: ${team.strStadium}` : "—";
    const bg = pickBG(team);
    els.bg.style.backgroundImage = bg ? `url(${bg})` : "none";

    // 3) Next match
    const nextRes = await fetchJSON(API.nextEvents(team.idTeam));
    if (requestId !== activeRequestId) return; // stale
    const nextEvent = nextRes.events && nextRes.events[0] ? nextRes.events[0] : null;
    renderNextMatch(team, nextEvent);

    // 4) Last 5 (form)
    const lastRes = await fetchJSON(API.lastEvents(team.idTeam));
    if (requestId !== activeRequestId) return; // stale
    renderRecentForm(team, lastRes.results || []);

    // 5) Bio
    renderBio(team);

    // 6) Players (use the CORRECT team.idTeam, and cache-bust)
    const squadUrl = API.squad(team.idTeam);
    // Debugging aid (visible in console):
    console.log("Squad URL:", squadUrl, "Team:", team.strTeam, "ID:", team.idTeam);

    const squadRes = await fetchJSON(squadUrl);
    if (requestId !== activeRequestId) return; // stale

    renderPlayers(squadRes.player || []);
  } catch (err) {
    if (requestId !== activeRequestId) return; // stale
    console.error(err);
    els.error.textContent = err.message || "Failed to load team.";
    els.next.textContent = "—";
    els.formWrap.innerHTML = "";
    els.bio.innerHTML = "";
    els.players.innerHTML = "";
  }
}

/* ---------- EVENTS ---------- */
els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = els.input.value.trim();
  if (q) showTeam(q);
});

/* Default load */
showTeam("Real Madrid");
