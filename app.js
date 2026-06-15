"use strict";

const TZ = "Australia/Brisbane";
const AUS = new Set(["Australia"]);
const KO_ORDER = ["Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Match for third place", "Final"];

// "13:00 UTC-6" + "2026-06-11" -> Date (absolute instant)
function parseKickoff(date, time) {
  const m = time.match(/(\d{1,2}):(\d{2})\s*UTC([+-]\d{1,2})/i);
  if (!m) return null;
  const [, hh, mm, off] = m;
  const sign = off[0] === "-" ? "-" : "+";
  const oh = String(Math.abs(parseInt(off, 10))).padStart(2, "0");
  const d = new Date(`${date}T${hh.padStart(2, "0")}:${mm}:00${sign}${oh}:00`);
  return isNaN(d) ? null : d;
}

const fmtClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
});
const fmtDayKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
});
const fmtDayLabel = new Intl.DateTimeFormat("en-AU", {
  timeZone: TZ, weekday: "long", day: "numeric", month: "long",
});
const fmtDayShort = new Intl.DateTimeFormat("en-AU", {
  timeZone: TZ, weekday: "short", day: "numeric", month: "short",
});

function relText(d, now) {
  const diff = d - now;
  const min = Math.round(diff / 60000);
  if (min <= -150) return null;
  if (min < -5) return "live now";
  if (min < 30) return min <= 0 ? "kicking off" : `in ${min} min`;
  const hrs = diff / 3600000;
  if (hrs < 24) {
    const h = Math.floor(hrs), m = Math.round((hrs - h) * 60);
    return m ? `in ${h}h ${m}m` : `in ${h}h`;
  }
  return null;
}

function scoreState(match, now) {
  if (match.score && match.score.ft) return { kind: "ft", text: `${match.score.ft[0]}–${match.score.ft[1]}` };
  const ko = match._ko;
  if (ko && now - ko > 0 && now - ko < 2.5 * 3600000) return { kind: "live", text: "LIVE" };
  return { kind: "upcoming", text: "" };
}

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

// A fixture row with spoiler-safe score cell. `showDate` adds the date under the time.
function matchRow(m, now, showDate) {
  const isAU = AUS.has(m.team1) || AUS.has(m.team2);
  const tr = el("tr", isAU ? "au" : null);

  const tdTime = el("td", "time");
  tdTime.append(el("span", "clock", fmtClock.format(m._ko)));
  if (showDate) tdTime.append(el("span", "rel", fmtDayShort.format(m._ko)));
  else {
    const rel = relText(m._ko, now);
    if (rel) tdTime.append(el("span", "rel", rel));
  }
  tr.append(tdTime);

  const tdMatch = el("td", "match");
  tdMatch.append(el("div", "teams", `${m.team1} v ${m.team2}`));
  tdMatch.append(el("div", "meta", `${m.group || m.round} · ${m.ground}`));
  if (m.group) {
    tdMatch.classList.add("tappable");
    tdMatch.addEventListener("click", () => goToGroup(m.group));
  }
  tr.append(tdMatch);

  const tdScore = el("td", "score");
  const st = scoreState(m, now);
  if (st.kind === "ft") {
    const b = el("span", "reveal hidden", st.text);
    b.setAttribute("aria-label", "tap to reveal score");
    b.addEventListener("click", () => b.classList.toggle("hidden"));
    tdScore.append(b);
  } else {
    tdScore.append(el("span", "reveal upcoming", st.kind === "live" ? "LIVE" : "–"));
  }
  tr.append(tdScore);
  return tr;
}

function section(headText, isToday) {
  const wrap = el("div", "daygroup");
  const head = el("div", "dayhead" + (isToday ? " today" : ""));
  head.append(el("span", null, headText + (isToday ? " · Today" : "")));
  wrap.append(head);
  return wrap;
}

// ---- views -------------------------------------------------------------

function viewDay(app, matches, now) {
  const todayKey = fmtDayKey.format(now);
  const groups = new Map();
  for (const m of matches) {
    const key = fmtDayKey.format(m._ko);
    (groups.get(key) || groups.set(key, []).get(key)).push(m);
  }
  let anchored = false;
  for (const [key, list] of groups) {
    const wrap = section(fmtDayLabel.format(list[0]._ko), key === todayKey);
    if (!anchored && key >= todayKey) { wrap.id = "anchor"; anchored = true; }
    const table = el("table");
    for (const m of list) table.append(matchRow(m, now, false));
    wrap.append(table);
    app.append(wrap);
  }
}

function viewGroup(app, matches, now) {
  const groups = matches.filter((m) => m.group);
  const byGroup = new Map();
  for (const m of groups) (byGroup.get(m.group) || byGroup.set(m.group, []).get(m.group)).push(m);
  for (const name of [...byGroup.keys()].sort()) {
    const wrap = section(name, false);
    const table = el("table");
    for (const m of byGroup.get(name)) table.append(matchRow(m, now, true));
    wrap.append(table);
    app.append(wrap);
  }
}

function viewKnockout(app, matches, now) {
  const ko = matches.filter((m) => !m.group);
  if (!ko.length) { app.append(el("div", "sub", "Knockout fixtures appear once the bracket is set.")); return; }
  const byRound = new Map();
  for (const m of ko) (byRound.get(m.round) || byRound.set(m.round, []).get(m.round)).push(m);
  for (const round of KO_ORDER) {
    if (!byRound.has(round)) continue;
    const wrap = section(round, false);
    const table = el("table");
    for (const m of byRound.get(round)) table.append(matchRow(m, now, true));
    wrap.append(table);
    app.append(wrap);
  }
}

function viewTable(app, matches) {
  const byGroup = new Map();
  for (const m of matches) {
    if (!m.group) continue;
    if (!byGroup.has(m.group)) byGroup.set(m.group, new Map());
    const tbl = byGroup.get(m.group);
    for (const t of [m.team1, m.team2]) if (!tbl.has(t)) tbl.set(t, { team: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
    if (!m.score || !m.score.ft) continue;
    const [a, b] = m.score.ft;
    const r1 = tbl.get(m.team1), r2 = tbl.get(m.team2);
    r1.p++; r2.p++; r1.gf += a; r1.ga += b; r2.gf += b; r2.ga += a;
    if (a > b) { r1.w++; r1.pts += 3; r2.l++; }
    else if (a < b) { r2.w++; r2.pts += 3; r1.l++; }
    else { r1.d++; r2.d++; r1.pts++; r2.pts++; }
  }

  for (const name of [...byGroup.keys()].sort()) {
    const rows = [...byGroup.get(name).values()].sort((x, y) =>
      y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.team.localeCompare(y.team));
    const wrap = section(name, false);
    wrap.id = groupId(name);
    const t = el("table", "standings");
    const thead = el("tr");
    ["", "P", "W", "D", "L", "GF", "GA", "GD", "Pts"].forEach((h, i) =>
      thead.append(Object.assign(el("th", i === 0 ? "teamcol" : null, h))));
    t.append(thead);
    rows.forEach((r, i) => {
      const tr = el("tr", AUS.has(r.team) ? "au" : null);
      if (i < 2) tr.classList.add("qual");
      const cells = [
        ["teamcol", r.team], [null, r.p], [null, r.w], [null, r.d], [null, r.l],
        [null, r.gf], [null, r.ga], [null, r.gf - r.ga], ["pts", r.pts],
      ];
      for (const [cls, val] of cells) tr.append(el("td", cls, val));
      t.append(tr);
    });
    wrap.append(t);
    app.append(wrap);
  }
}

// ---- controller --------------------------------------------------------

const VIEWS = { day: viewDay, group: viewGroup, knockout: viewKnockout, table: viewTable };
let MATCHES = [];

const groupId = (name) => "grp-" + name.replace(/\s+/g, "-");

function scrollToId(id) {
  const e = document.getElementById(id);
  if (!e) return;
  const bar = document.getElementById("tabs").offsetHeight; // clear sticky tabs
  const y = e.getBoundingClientRect().top + window.scrollY - bar;
  window.scrollTo({ top: Math.max(0, y) });
}

function goToGroup(name) {
  show("table");
  scrollToId(groupId(name));
}

function show(view) {
  localStorage.setItem("wc_view", view);
  for (const b of document.querySelectorAll("#tabs button"))
    b.classList.toggle("active", b.dataset.view === view);
  const app = document.getElementById("app");
  app.textContent = "";
  const now = new Date();
  VIEWS[view](app, MATCHES, now);
  if (view === "day") {
    scrollToId("anchor");
  } else {
    window.scrollTo(0, 0);
  }
}

document.querySelectorAll("#tabs button").forEach((b) =>
  b.addEventListener("click", () => show(b.dataset.view)));

fetch("data.json", { cache: "no-store" })
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((data) => {
    MATCHES = data.matches
      .map((m) => ({ ...m, _ko: parseKickoff(m.date, m.time) }))
      .filter((m) => m._ko)
      .sort((a, b) => a._ko - b._ko);
    document.getElementById("foot").textContent =
      `${MATCHES.length} matches · data: openfootball (updates ~daily) · times in ${TZ}`;
    show(localStorage.getItem("wc_view") || "day");
  })
  .catch((e) => {
    document.getElementById("app").innerHTML =
      `<div class="err">Couldn't load data.json (${e.message}). Run ./fetch.sh.</div>`;
  });
