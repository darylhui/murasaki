// Shift Hub — runs entirely in the browser. No build step, no server.
// All data is kept in this browser's localStorage on this computer.
(function () {
  "use strict";

  const D = window.AFO;
  const KEY = "afo-shift-hub-v1";
  const main = document.getElementById("main");

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const dayDiff = (a, b) => Math.round((parse(ymd(b)) - parse(ymd(a))) / 864e5);
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const longDate = (d) => (d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : "");
  const shortDate = (d) => (d ? `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}` : "");
  const money = (n) => "$" + (Math.round(n * 100) / 100).toFixed(2);
  const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const uid = () => Math.random().toString(36).slice(2, 10);
  const todayStr = () => ymd(new Date());
  const pendingBadge = (p) => (p ? `<span class="badge pending" title="Still to be confirmed by the manager in the handbook">pending ${esc(p)}</span>` : "");

  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 1800);
  }
  async function copy(text, what = "Copied") {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove();
    }
    toast(what);
  }

  // ---------- state ----------
  const defaults = () => ({
    settings: {
      name: "", title: "Club Associate",
      ollamaUrl: "http://localhost:11434", model: "llama3.1:8b",
      partialWeeks: "up", divisor: "30",
    },
    days: {}, leads: [], trainees: [], activeTrainee: null,
    dues: {}, eod: {}, scripts: null, scriptSeed: [],
    calc: {}, ui: {}, handbook: "", tab: "today",
  });
  let S;
  try { S = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch { S = defaults(); }
  function init() {
    S.settings = Object.assign(defaults().settings, S.settings);
    S.ui = S.ui || {}; S.dues = S.dues || {}; S.leads = S.leads || [];
    migrateLeads(); seedScripts();
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast("Could not save: browser storage is blocked or full"); } };

  const me = () => S.settings.name.trim() || "[Your Name]";
  // This outlet's details: Settings → Outlet, falling back to data.js.
  const OUTLET_FIELDS = [
    ["name", "Outlet name", "Anytime Fitness Orchard"], ["short", "Short name", "AF Orchard"], ["code", "Outlet code", "AFO"],
    ["area", "Area (shown in the sidebar)", "Orchard"], ["phone", "Phone", ""], ["email", "Email", ""], ["address", "Address", ""],
    ["vpaFreezeCancel", "VPA for freezes and cancellations", ""], ["vpaLatePayment", "VPA for late payments", ""],
  ];
  function club() {
    const o = S.settings.outlet || {}, c = Object.assign({}, D.club);
    OUTLET_FIELDS.forEach(([k]) => { if (o[k] !== undefined && (o[k].trim() || !["name", "short", "code"].includes(k))) c[k] = o[k].trim(); });
    return c;
  }
  function applyOutlet() {
    const c = club();
    document.title = `${c.code} Shift Hub`;
    const small = document.querySelector(".brand-text small");
    if (small) small.textContent = `${c.area || c.code} · offline`;
  }
  // Fill a script's placeholders. [Month]/[Amount] are only replaced when given.
  function fill(text, v = {}) {
    const c = club();
    let t = text.replaceAll("[Your Name]", me()).replaceAll("[NAME]", (v.name || "").trim() || "[NAME]")
      .replaceAll("[Outlet Short]", c.short).replaceAll("[Outlet Code]", c.code).replaceAll("[Outlet Phone]", c.phone)
      .replaceAll("[Outlet]", c.name).replaceAll("[Freeze VPA]", c.vpaFreezeCancel).replaceAll("[Late VPA]", c.vpaLatePayment);
    if (v.month) t = t.replaceAll("[Month]", v.month);
    if ("amount" in v) {
      const a = parseFloat(v.amount);
      t = isNaN(a) ? t.replaceAll(" of $[Amount]", "").replaceAll("$[Amount]", "the outstanding amount") : t.replaceAll("[Amount]", a.toFixed(2));
    }
    return t;
  }

  // ---------- personal-data detection (used before anything goes to any AI) ----------
  const PII = [
    { tag: "[EMAIL]", label: "email address", re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
    { tag: "[CARD]", label: "card number", re: /\b\d(?:[ -]?\d){12,18}\b/g },
    { tag: "[NRIC]", label: "NRIC / FIN", re: /\b[STFGM]\d{7}[A-Z]\b/gi },
    { tag: "[PHONE]", label: "phone number", re: /(?:\+?65[ -]?)?\b[3689]\d{3}[ -]?\d{4}\b/g },
    { tag: "[DATE]", label: "date (e.g. date of birth)", re: /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g },
    { tag: "[EXPIRY]", label: "card expiry", re: /\b(?:0[1-9]|1[0-2])\/\d{2}\b/g },
    { tag: "[POSTAL]", label: "postal code", re: /\b(?:singapore|S|postal(?: code)?:?)\s?\(?\d{6}\)?/gi },
    { tag: "[BLOCK]", label: "block number", re: /\b(?:blk|block)\s*\d+[A-Z]?\b/gi },
    { tag: "[UNIT]", label: "unit number", re: /#\d{1,3}-\d{1,5}\b/g },
  ];
  function redact(text, names = []) {
    const found = {};
    let out = text;
    for (const p of PII) {
      out = out.replace(p.re, () => { found[p.label] = (found[p.label] || 0) + 1; return p.tag; });
    }
    names.map((n) => n.trim()).filter(Boolean).forEach((n, i) => {
      const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const label = "Member " + String.fromCharCode(65 + (i % 26));
      out = out.replace(re, () => { found["name"] = (found["name"] || 0) + 1; return label; });
    });
    return { out, found };
  }
  const hasPII = (t) => Object.keys(redact(t).found).length > 0;

  // ---------- navigation ----------
  const TABS = { today: renderToday, followups: renderFollowups, payments: renderPayments, calc: renderCalc, scripts: renderScripts, onboarding: renderOnboarding, ask: renderAsk, settings: renderSettings };
  function go(tab) {
    if (!TABS[tab]) tab = "today";
    S.tab = tab; save();
    document.querySelectorAll(".nav-btn").forEach((b) => {
      if (b.dataset.tab === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    render();
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  function render() {
    main.innerHTML = TABS[S.tab]();
    if (S.tab === "calc") updateCalc();
    if (S.tab === "scripts") updateScripts();
    if (S.tab === "ask") { updateRedact(); checkAI(); }
    updateBadge();
  }
  document.querySelector(".nav").addEventListener("click", (e) => {
    const b = e.target.closest(".nav-btn");
    if (b) go(b.dataset.tab);
  });

  // ================= TODAY =================
  function day() {
    const k = todayStr();
    if (!S.days[k]) {
      const h = new Date().getHours();
      S.days[k] = { shift: h < 14 ? "opening" : h < 18 ? "mid" : "closing", done: {}, notes: {}, handover: "" };
    }
    return S.days[k];
  }
  const dueDate = (hm) => { const [h, m] = hm.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d; };

  function renderToday() {
    const d = day();
    const shift = D.shifts.find((s) => s.id === d.shift) || D.shifts[0];
    const now = new Date();
    const doneCount = shift.items.filter((i) => d.done[i.id]).length;
    const next = shift.items.filter((i) => i.due && !d.done[i.id]).sort((a, b) => a.due.localeCompare(b.due))[0];
    let nextHtml = `<p class="muted">No timed checks left on this shift.</p>`;
    if (next) {
      const mins = Math.round((dueDate(next.due) - now) / 60000);
      const when = mins >= 0 ? `in ${mins >= 60 ? Math.floor(mins / 60) + "h " : ""}${mins % 60} min` : `<span class="overdue">${-mins} min overdue</span>`;
      nextHtml = `<div class="next-up"><span class="big">${esc(next.due)}</span><div><b>${esc(next.text)}</b><p class="small muted">${when}${next.photo ? " · photo to Discord" : ""}</p></div></div>`;
    }

    const items = shift.items.map((i) => {
      const done = d.done[i.id];
      const overdue = i.due && !done && now > addMin(dueDate(i.due), 15);
      const meta = done ? `done ${esc(done)}` : i.due ? `<span class="${overdue ? "overdue" : ""}">due ${esc(i.due)}</span>` : "";
      return `<li class="check ${done ? "done" : ""}">
        <input type="checkbox" id="c-${i.id}" data-act="tick" data-id="${i.id}" ${done ? "checked" : ""} aria-label="${esc(i.text)}">
        <label class="t" for="c-${i.id}"><span>${esc(i.text)}</span>${i.photo ? '<span class="badge">photo</span>' : ""}${pendingBadge(i.pending)}</label>
        <span class="meta">${meta}</span>
        <div class="note"><input type="text" placeholder="Note (if something couldn't be done, say why)" data-note="${i.id}" value="${esc(d.notes[i.id] || "")}"></div>
      </li>`;
    }).join("");

    return `
      <div class="page-head">
        <div><h1>${esc(greeting())}${S.settings.name ? ", " + esc(S.settings.name) : ""}</h1>
        <p>${esc(longDate(now))} · checklists from handbook section 11</p></div>
        <div class="seg" role="group" aria-label="Shift">${D.shifts.map((s) => `<button data-act="shift" data-id="${s.id}" aria-pressed="${s.id === shift.id}">${esc(s.label)}</button>`).join("")}</div>
      </div>
      <div class="grid grid-2">
        <section class="card"><h2>Next timed check</h2>${nextHtml}</section>
        <section class="card"><h2>Progress</h2>
          <div class="stats"><div class="stat"><b>${doneCount}/${shift.items.length}</b><span>${esc(shift.label)} tasks done</span></div>
          <div class="stat"><b>${dueFollowups().length}</b><span>follow-ups due</span></div>
          ${S.leads.some(inGym) ? `<div class="stat"><b>${S.leads.filter(inGym).length}</b><span>trials in the gym</span></div>` : ""}
          ${S.dues[ym(new Date())] && new Date().getDate() < D.dues.deadlineDay ? `<div class="stat"><b>${duesStats(duesList(ym(new Date()))).out}</b><span>members still to pay</span></div>` : ""}</div>
          <progress max="${shift.items.length}" value="${doneCount}" aria-label="Shift progress"></progress>
        </section>
      </div>
      <div class="grid grid-2" style-gap>
        <section class="card">
          <div class="card-head"><h2>${esc(shift.label)} checklist</h2><button class="btn btn-sm btn-ghost" data-act="reset-day">Reset</button></div>
          <ul class="checklist">${items}</ul>
        </section>
        <div class="stack">
          <section class="card"><h2>What "clean" means</h2><ul class="plain">${D.cleanStandard.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
            <p class="small muted" style-top>A check isn't complete until the photo is in Discord. Log equipment faults in the Maintenance Log.</p></section>
          ${shift.id === "closing" ? "" : `<section class="card"><h2>Handover to next shift</h2>
            <label class="field">Pinned emails and WhatsApps, trials and tours booked, anything unfinished. Use initials.
              <textarea data-handover placeholder="e.g. MX - cancellation, awaiting payment screenshot">${esc(d.handover)}</textarea></label>
            <div class="row" style-top><button class="btn btn-primary" data-act="copy-handover">Copy handover report</button></div>
          </section>`}
        </div>
      </div>
      ${shift.id === "closing" ? `<div style-gap>${renderEod()}</div>` : ""}`;
  }
  const addMin = (d, m) => new Date(d.getTime() + m * 60000);
  function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }

  function handoverText() {
    const d = day();
    const shift = D.shifts.find((s) => s.id === d.shift);
    const lines = [`${club().code} handover · ${longDate(new Date())} · ${shift.label} · ${me()}`, ""];
    const notDone = shift.items.filter((i) => !d.done[i.id]);
    lines.push(`Checklist: ${shift.items.length - notDone.length}/${shift.items.length} done`);
    if (notDone.length) lines.push("Not done:", ...notDone.map((i) => `- ${i.text}${d.notes[i.id] ? " (" + d.notes[i.id] + ")" : ""}`));
    const noted = shift.items.filter((i) => d.done[i.id] && d.notes[i.id]);
    if (noted.length) lines.push("Notes:", ...noted.map((i) => `- ${i.text}: ${d.notes[i.id]}`));
    const due = dueFollowups();
    const gym = S.leads.filter(inGym);
    if (gym.length) lines.push("", "Trials still in the gym:", ...gym.map((l) => `- ${initials(l.name)}, in since ${time12(new Date(l.checkIn))}`));
    const notIn = unlogged().length;
    if (notIn) lines.push(`Prospect & Trial sheet: ${notIn} row${notIn > 1 ? "s" : ""} not copied in yet`);
    if (due.length) lines.push("", `Follow-ups due: ${due.length}`, ...due.map(({ l, n }) => `- ${initials(l.name)} (${l.channel}): ${n.action}`));
    const cur = S.dues[ym(new Date())];
    if (cur && cur.members.length && new Date().getDate() < D.dues.deadlineDay) { const st = duesStats(cur.members); lines.push("", `Dues: ${st.paid}/${st.total} paid, ${st.out} outstanding, ${st.todo} not contacted yet`); }
    if (d.handover.trim()) lines.push("", "Handover:", d.handover.trim());
    return lines.join("\n");
  }

  // ================= PROSPECT & TRIAL =================
  // Each person follows a journey (data.js → journeys). `anchor` is the date
  // the journey counts from and `step` is the index of the next step to do.
  // Full names and numbers are kept because they go into the online Prospect &
  // Trial sheet; they stay in this browser otherwise.
  // Follow-up sequences: the defaults from data.js until someone edits a step
  // (Scripts → Follow-up steps); then the edited copy saved in S.journeys.
  const journeys = () => S.journeys || D.journeys;
  const journey = (id) => journeys().find((j) => j.id === id) || journeys()[0];
  const CHANNELS = D.sources; // "How did the prospect find out about us"
  // Earlier versions recorded how someone got in touch, not how they found us.
  const OLD_CHANNEL = { "Walk-in": "On-Site (Posters/Walk-in/Gym-floor duty)", Website: "AF Website", "Instagram / FB": "Social Content (IG/FB Organic)", Referral: "Word-of-mouth (Referral)" };
  const TRIAL_STAGES = ["trial", "nosign", "friends"];

  function migrateLeads() {
    const map = { enquiry: "enquiry", tour: "nosign", trial: "nosign" };
    S.leads.forEach((l) => {
      if (!l.stage) { // saved by the first version
        l.stage = map[l.rule] || "enquiry"; l.anchor = l.date || todayStr();
        l.step = (l.done || []).length; l.name = l.who || "?"; l.history = [];
        ["rule", "done", "date", "who"].forEach((k) => delete l[k]);
      }
      delete l.sheetExtra; // an earlier version kept raw values for these columns
      if ((l.v || 0) < 5 && l.v !== undefined) {
        l.channel = OLD_CHANNEL[l.channel] || (CHANNELS.includes(l.channel) ? l.channel : "");
        l.scheduleAppt = l.scheduleAppt || (l.trialDate ? "Yes" : "TBC");
      }
      if (l.v === 4) l.v = 5;
      if (l.v === 3) {
        l.v = 5;
        l.remarks = (l.remarks || "").replace(/Came for trial (\d{1,2}\/\d{1,2}) \d{1,2}:\d{2}[ap]m(?:–\d{1,2}:\d{2}[ap]m \(\d+ min\))?/g, "Came for trial $1");
      }
      if (!l.v) {
        l.v = 5;
        l.channel = OLD_CHANNEL[l.channel] || ""; l.scheduleAppt = l.trialDate ? "Yes" : "TBC";
        l.enquiryDate = l.enquiryDate || l.created || l.anchor || todayStr();
        l.remarks = l.remarks ?? (l.interest ? "Looking for: " + l.interest : "");
        delete l.interest;
        l.phone = l.phone || ""; l.scheduler = l.scheduler || ""; l.trialTime = l.trialTime || ""; l.followedUp = l.followedUp || "";
        if (!l.trialDate && TRIAL_STAGES.includes(l.stage)) l.trialDate = l.anchor;
        l.history = l.history || [];
      }
    });
  }

  function leadNext(l) {
    if (l.closed) return null;
    const j = journey(l.stage);
    const step = j.steps[l.step];
    if (!step) return null;
    return { ...step, idx: l.step, total: j.steps.length, due: addDays(parse(l.anchor), step.d), journey: j };
  }
  function dueFollowups() {
    const today = parse(todayStr());
    return S.leads.map((l) => ({ l, n: leadNext(l) })).filter((x) => x.n && x.n.due <= today && !inGym(x.l));
  }

  // Skips steps that were already overdue when the journey starts (e.g.
  // "confirm tomorrow's trial" for a trial booked for today).
  function startJourney(l, stage, anchor, note) {
    l.stage = stage; l.anchor = anchor; l.step = 0;
    const j = journey(stage);
    const today = parse(todayStr());
    while (j.steps[l.step] && !j.steps[l.step].outcome && addDays(parse(anchor), j.steps[l.step].d) < today && l.step < j.steps.length - 1) l.step++;
    if (note) l.history.push({ d: todayStr(), t: note });
  }

  function parseDateInput(v) {
    v = (v || "").trim();
    let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = v.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
    if (m) { const y = m[3] ? (m[3].length === 2 ? "20" + m[3] : m[3]) : new Date().getFullYear(); return `${y}-${pad(m[2])}-${pad(m[1])}`; }
    return null;
  }
  function parseTimeInput(v) {
    const m = (v || "").trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
    if (!m) return "";
    let h = Number(m[1]);
    if (m[3] === "pm" && h < 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
    return h < 24 ? `${pad(h)}:${m[2] || "00"}` : "";
  }
  // Add a tag to remarks, or take it out again if it's already there.
  function toggleTag(remarks, tag) {
    const parts = (remarks || "").split(/\s*;\s*/).filter(Boolean);
    const i = parts.findIndex((p) => p.toLowerCase() === tag.toLowerCase());
    if (i >= 0) parts.splice(i, 1); else parts.push(tag);
    return parts.join("; ");
  }
  const hasTag = (remarks, tag) => (remarks || "").split(/\s*;\s*/).some((p) => p.toLowerCase() === tag.toLowerCase());
  const tagChips = (remarks, act, id = "") => D.remarkTags.map((g) => `<div class="tag-group"><span class="small muted">${esc(g.group)}</span>
    ${g.tags.map((t) => `<button class="tag" aria-pressed="${hasTag(remarks, t)}" data-act="${act}" data-id="${id}" data-tag="${esc(t)}">${esc(t.replace(/^Asked about /, ""))}</button>`).join("")}</div>`).join("");

  const touch = (l) => { l.updatedAt = Date.now(); };
  function addRemark(l, text) { l.remarks = (l.remarks ? l.remarks.trim().replace(/[;.]$/, "") + "; " : "") + text; touch(l); }
  const time12 = (d) => { let h = d.getHours(); const m = pad(d.getMinutes()); const ap = h < 12 ? "am" : "pm"; h = h % 12 || 12; return `${h}:${m}${ap}`; };
  const hm12 = (hm) => { if (!hm) return ""; const [h, m] = hm.split(":").map(Number); const x = new Date(); x.setHours(h, m); return time12(x).replace(/am$/, " AM").replace(/pm$/, " PM"); };
  const dm = (s) => { const d = parse(s); return d ? `${d.getDate()}/${d.getMonth() + 1}` : ""; };

  // ---- trial check-in / check-out
  const inGym = (l) => l.checkIn && !l.checkOut && ymd(new Date(l.checkIn)) === todayStr();
  const awaitingOutcome = (l) => l.stage === "trial" && !l.closed && l.checkIn && (l.checkOut || ymd(new Date(l.checkIn)) !== todayStr());
  function checkIn(l) {
    const now = new Date();
    l.checkIn = now.getTime(); l.checkOut = null;
    if (!l.trialDate || l.stage !== "trial") l.trialDate = todayStr();
    if (!l.trialTime) l.trialTime = hhmm(now);
    if (l.stage !== "trial") startJourney(l, "trial", l.trialDate, "Came for trial");
    l.anchor = l.trialDate;
    l.step = journey("trial").steps.findIndex((s) => s.outcome);
    const remark = `Came for trial ${dm(todayStr())}`;
    if (!(l.remarks || "").includes(remark)) addRemark(l, remark);
  }
  function checkOut(l) { l.checkOut = Date.now(); touch(l); }
  function recordTrial(l, outcome) {
    if (inGym(l)) checkOut(l);
    l.trialOutcome = outcome; l.trialDate = l.trialDate || l.anchor; l.outcomeDate = todayStr();
    if (outcome === "signed") l.signedDate = todayStr();
    const text = { signed: "Signed", nosign: "Didn't sign", friends: "Didn't sign", noshow: "No-show" }[outcome];
    if (outcome === "friends" && !hasTag(l.remarks, "Came with friends")) addRemark(l, "Came with friends");
    addRemark(l, text);
    if (outcome === "signed") startJourney(l, "member", todayStr(), "Signed after trial");
    if (outcome === "nosign") startJourney(l, "nosign", l.trialDate, text);
    if (outcome === "friends") startJourney(l, "friends", l.trialDate, text);
    if (outcome === "noshow") startJourney(l, "enquiry", todayStr(), text);
  }

  // ---- the online sheet
  function sheetDate(s) {
    const d = parse(s);
    if (!d) return "";
    return (D.sheet && D.sheet.dateFormat) === "D MMM YYYY" ? `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}` : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
  const raw = (l, k) => (l.sheetRaw && l.sheetRaw[k]) || "";
  function cell(l, field) {
    switch (field) {
      case "name": return l.name;
      case "phone": { // drop a +65 country code so it reads like the other local numbers
        const local = (l.phone || "").replace(/^\s*\+?65[\s-]*(?=[3689]\d{3}[\s-]?\d{4}\s*$)/, "");
        return local;
      }
      case "waLink": {
        const n = waNumber(l.phone);
        if (n.length < 8) return "";
        const url = `https://wa.me/${n}`;
        return S.settings.waLinkStyle === "text" ? url : `=HYPERLINK("${url}")`;
      }
      case "enquiryDate": return sheetDate(l.enquiryDate) || raw(l, "enquiryDate");
      case "source": return l.channel || "";
      case "scheduleAppt": return l.scheduleAppt || "";
      case "scheduler": return l.scheduler;
      case "trialDate": return sheetDate(l.trialDate) || raw(l, "trialDate") || "TBC";
      case "trialTime": return hm12(l.trialTime) || raw(l, "trialTime") || "TBC";
      case "followedUp": return sheetDate(l.followedUp) || raw(l, "followedUp");
      case "remarks": return l.remarks;
      default: return "";
    }
  }
  // The online Prospect & Trial sheet's columns, in order. This is fixed on
  // purpose: every copied row has exactly these 11 cells, whatever type of
  // prospect it is or what's been filled in. A column with nothing to put in
  // it is left blank, never dropped. Trial Date and Trial Time say TBC when
  // there isn't one. Whatsapp Link is a clickable wa.me link built from the
  // contact number.
  const SHEET_COLUMNS = [
    { label: "Name", field: "name" },
    { label: "Contact Number", field: "phone" },
    { label: "Whatsapp Link", field: "waLink" },
    { label: "Date of Enquiry", field: "enquiryDate" },
    { label: "How did the prospect find out about us", field: "source" },
    { label: "Schedule for Appt", field: "scheduleAppt" },
    { label: "Scheduler", field: "scheduler" },
    { label: "Trial Date", field: "trialDate" },
    { label: "Trial Time", field: "trialTime" },
    { label: "Followed Up", field: "followedUp" },
    { label: "Remarks", field: "remarks" },
  ];
  // Makes a value safe to paste as one cell: tabs and line breaks would split
  // it across cells, a double quote at the start makes Sheets swallow the
  // following cells, and = + - @ at the start would be read as a formula.
  function sheetCell(v) {
    return String(v ?? "")
      .replace(/[\t\r\n\u2028\u2029\v\f]+/g, " ")
      .replace(/"/g, "'")
      .trim()
      .replace(/^[=+\-@\s]+/, "");
  }
  // The WhatsApp link is built by the hub from digits only, so it's safe as a formula.
  const sheetCells = (l) => SHEET_COLUMNS.map((c) => (c.field === "waLink" ? cell(l, c.field) : sheetCell(cell(l, c.field))));
  const sheetRow = (l) => sheetCells(l).join("\t");
  const sheetState = (l) => (!l.loggedAt ? "new" : (l.updatedAt || 0) > l.loggedAt ? "changed" : "logged");
  const unlogged = () => S.leads.filter((l) => sheetState(l) !== "logged");

  // ---- sync with the Excel sheet
  // Each entry can carry `sheetRow`, its row number in the Excel sheet. Rows
  // copied back are laid out by row number, so one paste into the Name cell of
  // the first row updates every row in place. Whatsapp Link is always rebuilt
  // from the contact number, so it isn't read on import.
  // Dates or times the hub can't read are kept as typed in `sheetRaw` and
  // written back as-is.
  const rowsInUse = () => S.leads.filter((l) => l.sheetRow).map((l) => l.sheetRow);
  const nextRow = () => Math.max(Math.max(1, ...rowsInUse()) + 1, Number(S.settings.nextSheetRow) || 2);
  const leadAtRow = (r, except) => S.leads.find((l) => l.sheetRow === r && l.id !== except);

  // Splits text copied from Excel or Google Sheets into rows of cells.
  // Cells that contain line breaks or tabs come wrapped in double quotes.
  function parseTSV(text) {
    const rows = [];
    let row = [], cellText = "", i = 0, quoted = false;
    text = text.replace(/\r\n?/g, "\n");
    while (i < text.length) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cellText += '"'; i += 2; continue; }
        if (ch === '"') { quoted = false; i++; continue; }
        cellText += ch; i++; continue;
      }
      if (ch === '"' && cellText === "") { quoted = true; i++; continue; }
      if (ch === "\t") { row.push(cellText); cellText = ""; i++; continue; }
      if (ch === "\n") { row.push(cellText); rows.push(row); row = []; cellText = ""; i++; continue; }
      cellText += ch; i++;
    }
    if (cellText !== "" || row.length) { row.push(cellText); rows.push(row); }
    return rows;
  }

  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  // Reads a date the way the sheet shows it. Day comes first (Singapore), unless
  // the second number can only be a day.
  function parseSheetDate(s) {
    s = (s || "").trim();
    if (!s) return "";
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m) return okDate(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (m) {
      let d = +m[1], mo = +m[2];
      if (mo > 12 && d <= 12) [d, mo] = [mo, d];
      return okDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], mo, d);
    }
    m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s,-]*(\d{2,4})?$/);
    const monthOf = (w) => MON[w.toLowerCase()] || MON[w.slice(0, 3).toLowerCase()];
    if (m && monthOf(m[2])) return okDate(m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : new Date().getFullYear(), monthOf(m[2]), +m[1]);
    m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(\d{4})?$/);
    if (m && monthOf(m[1])) return okDate(m[3] ? +m[3] : new Date().getFullYear(), monthOf(m[1]), +m[2]);
    if (/^\d{5}$/.test(s)) return ymd(addDays(new Date(1899, 11, 30, 12), +s)); // Excel date serial
    return null;
  }
  function okDate(y, mo, d) {
    const x = new Date(y, mo - 1, d, 12);
    return x.getMonth() === mo - 1 && x.getDate() === d ? ymd(x) : null;
  }
  function parseSheetTime(s) {
    s = (s || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!s) return "";
    const m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?$/);
    if (!m) return null;
    let h = +m[1];
    const ap = m[3] && m[3][0];
    if (ap === "p" && h < 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    return h < 24 && (m[2] || "00") < "60" ? `${pad(h)}:${m[2] || "00"}` : null;
  }

  const normName = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const digits = (s) => (s || "").replace(/\D/g, "").replace(/^65(?=\d{8}$)/, "");

  // Turns pasted text into a plan: one item per sheet row, saying what will
  // happen to it. Nothing changes until the plan is applied.
  // Which column holds what. A copy from the sheet normally has all 11
  // columns, but if Whatsapp Link, How did they find us and Schedule for Appt
  // are hidden or left out, it has 8. With the header row we go by the header
  // names; without it we work out which of the two layouts it is.
  const LAYOUT_11 = ["name", "phone", "", "enquiryDate", "source", "scheduleAppt", "scheduler", "trialDate", "trialTime", "followedUp", "remarks"];
  const LAYOUT_8 = ["name", "phone", "enquiryDate", "scheduler", "trialDate", "trialTime", "followedUp", "remarks"];
  const FIELD_LABEL = { name: "Name", phone: "Contact Number", enquiryDate: "Date of Enquiry", source: "How did they find us", scheduleAppt: "Schedule for Appt", scheduler: "Scheduler", trialDate: "Trial Date", trialTime: "Trial Time", followedUp: "Followed Up", remarks: "Remarks" };
  function headerField(h) {
    h = (h || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!h) return null;
    if (/whats ?app|link/.test(h)) return "";
    if (/find out|found us|how did|source/.test(h)) return "source";
    if (/schedule for|appt|appointment/.test(h)) return "scheduleAppt";
    if (/scheduler|scheduled by/.test(h)) return "scheduler";
    if (/trial/.test(h) && /time/.test(h)) return "trialTime";
    if (/trial/.test(h)) return "trialDate";
    if (/follow/.test(h)) return "followedUp";
    if (/remark|note/.test(h)) return "remarks";
    if (/enquir|inquir/.test(h)) return "enquiryDate";
    if (/contact|phone|number|mobile|hp/.test(h)) return "phone";
    if (/name/.test(h)) return "name";
    return null;
  }
  function detectLayout(rows, mode) {
    const first = rows.findIndex((r) => r.some((x) => (x || "").trim()));
    const head = first >= 0 ? rows[first].map(headerField) : [];
    const isHeader = head[0] === "name" && head.filter((f) => f !== null).length >= 4;
    if (isHeader && mode === "auto") return { fields: head.map((f) => f || ""), headerAt: first, how: "from the header row" };
    const data = rows.filter((r, i) => i !== (isHeader ? first : -1) && r.some((x) => (x || "").trim()));
    if (mode === "11") return { fields: LAYOUT_11, headerAt: isHeader ? first : -1, how: "as all 11 columns" };
    if (mode === "8") return { fields: LAYOUT_8, headerAt: isHeader ? first : -1, how: "as 8 columns" };
    const width = Math.max(0, ...data.map((r) => { let n = r.length; while (n && !(r[n - 1] || "").trim()) n--; return n; }));
    const isDate = (v) => !!parseSheetDate(v);
    const score8 = data.filter((r) => isDate(r[2])).length, score11 = data.filter((r) => isDate(r[3])).length;
    const eleven = width >= 10 || (width === 9 && score11 >= score8) || (width <= 8 && score11 > score8 && width > 3);
    return eleven ? { fields: LAYOUT_11, headerAt: -1, how: "as all 11 columns" } : { fields: LAYOUT_8, headerAt: -1, how: "as 8 columns (no Whatsapp Link, How did they find us or Schedule for Appt)" };
  }
  // Matches a "How did they find us" value to one of the dropdown options.
  function matchSource(v) {
    v = (v || "").trim();
    if (!v) return "";
    const low = v.toLowerCase();
    const exact = CHANNELS.find((o) => o.toLowerCase() === low);
    if (exact) return exact;
    const hints = [[/website|web/, 0], [/organic|social|content/, 1], [/paid|ads?\b/, 2], [/edm|email/, 3], [/on-?site|walk|poster|floor/, 4], [/word|referr|friend/, 5], [/corporate|company/, 6]];
    const hit = hints.find(([re]) => re.test(low));
    return hit ? CHANNELS[hit[1]] : v;
  }
  function matchAppt(v) {
    v = (v || "").trim();
    return D.apptOptions.find((o) => o.toLowerCase() === v.toLowerCase()) || v;
  }

  function planImport(text, startRow, mode = "auto") {
    const plan = [], notes = [];
    const claimed = new Set();
    const rows = parseTSV(text);
    const layout = detectLayout(rows, mode);
    rows.forEach((cells, i) => {
      const row = startRow + i;
      const c = cells.map((x) => (x || "").trim());
      if (!c.some(Boolean)) return; // blank row: keeps its place, nothing to import
      if (i === layout.headerAt) return;
      if (c.length > layout.fields.length && c.slice(layout.fields.length).some(Boolean)) notes.push(`Row ${row} has more columns than expected. The extra ones were ignored.`);
      const v = {};
      layout.fields.forEach((f, k) => { if (f && !(f in v)) v[f] = c[k] || ""; });
      const name = v.name || "", phone = v.phone || "", scheduler = v.scheduler || "", remarks = v.remarks || "";
      const enq = v.enquiryDate || "", tDate = v.trialDate || "", tTime = v.trialTime || "", followed = v.followedUp || "";
      if (!name) { notes.push(`Row ${row} has no name, so it was skipped.`); return; }
      const data = { name, phone, scheduler, remarks, sheetRaw: {} };
      if ("source" in v) data.channel = matchSource(v.source);
      if ("scheduleAppt" in v) data.scheduleAppt = matchAppt(v.scheduleAppt);
      for (const [k, v, fn] of [["enquiryDate", enq, parseSheetDate], ["trialDate", tDate, parseSheetDate], ["followedUp", followed, parseSheetDate], ["trialTime", tTime, parseSheetTime]]) {
        if (/^(tbc|tba|-|nil|na|n\/a)$/i.test(v)) { data[k] = ""; continue; } // "TBC" means not set yet
        const p = fn(v);
        data[k] = p || "";
        if (p === null) data.sheetRaw[k] = v; // couldn't read it: keep it exactly as typed
      }
      // The same person already in the hub: same name, and the same number if both have one.
      const same = S.leads.filter((l) => !claimed.has(l.id) && normName(l.name) === normName(name) && (!digits(phone) || !digits(l.phone) || digits(l.phone) === digits(phone)));
      const match = same.find((l) => l.sheetRow === row) || same[0] || null;
      if (match) claimed.add(match.id);
      plan.push({ row, data, match, action: match ? "update" : "new" });
    });
    // Someone else in the hub sitting on a row that's now taken loses that row number.
    plan.forEach((p) => {
      const o = leadAtRow(p.row, p.match && p.match.id);
      p.occupant = o && !claimed.has(o.id) ? o : null;
    });
    return { plan, notes, layout };
  }

  function applyImport(plan) {
    const now = Date.now();
    const today = todayStr();
    const recent = (d) => d && dayDiff(parse(d), parse(today)) <= 14;
    let added = 0, updated = 0;
    plan.forEach(({ row, data, match, occupant }) => {
      if (occupant && occupant !== match) occupant.sheetRow = null; // that row now belongs to someone else
      let l = match;
      if (l) {
        const oldTrial = l.trialDate;
        Object.assign(l, data, { sheetRow: row });
        if (data.trialDate && data.trialDate !== oldTrial && data.trialDate >= today && !l.closed) startJourney(l, "trial", data.trialDate, "Trial date from sheet");
        updated++;
      } else {
        l = { id: uid(), v: 5, type: "imported", created: today, history: [], channel: "", cat: "WARM", ...data, sheetRow: row };
        const signed = /\bsigned\b/i.test(data.remarks) && !/(didn.?t|did not|not|never)\s+sign/i.test(data.remarks);
        if (signed) { startJourney(l, "member", data.trialDate || data.enquiryDate || today); l.closed = true; l.outcome = "Signed (from sheet)"; }
        else if (data.trialDate && data.trialDate >= today) startJourney(l, "trial", data.trialDate, "Imported from sheet");
        else if (data.trialDate && recent(data.trialDate)) { l.trialOutcome = "nosign"; startJourney(l, "nosign", data.trialDate, "Imported from sheet"); }
        else if (!data.trialDate && recent(data.enquiryDate)) startJourney(l, "enquiry", data.enquiryDate, "Imported from sheet");
        else { startJourney(l, "enquiry", data.enquiryDate || today); l.closed = true; l.outcome = "Imported from sheet (older than 2 weeks)"; }
        S.leads.push(l); added++;
      }
      l.updatedAt = now; l.loggedAt = now;
    });
    return { added, updated };
  }

  // Rows from..to, one line per sheet row. A row with no entry in the hub is
  // copied as 11 empty cells so every other row still lands in its place.
  function exportRange(from, to) {
    const lines = [], gaps = [];
    for (let r = from; r <= to; r++) {
      const l = leadAtRow(r);
      if (l) lines.push(sheetRow(l)); else { lines.push("\t".repeat(SHEET_COLUMNS.length - 1)); gaps.push(r); }
    }
    return { text: lines.join("\n"), gaps, leads: S.leads.filter((l) => l.sheetRow >= from && l.sheetRow <= to) };
  }
  const gapText = (g) => (g.length > 8 ? g.slice(0, 8).join(", ") + ` and ${g.length - 8} more` : g.join(", "));

  function renderSync() {
    const rows = rowsInUse();
    const min = rows.length ? Math.min(...rows) : 0, max = rows.length ? Math.max(...rows) : 0;
    const from = Number(S.ui.expFrom) || min, to = Number(S.ui.expTo) || max;
    const ex = rows.length ? exportRange(Math.min(from, to), Math.max(from, to)) : null;
    const unnumbered = S.leads.filter((l) => !l.sheetRow).length;
    const pendingRows = unlogged().filter((l) => l.sheetRow).map((l) => l.sheetRow);
    const imp = S.ui.impText ? planImport(S.ui.impText, Number(S.ui.impStart) || 1, S.ui.impLayout || "auto") : null;
    const actionBadge = (p) => p.action === "new" ? '<span class="badge ok">new</span>' : `<span class="badge">update</span>${p.match.sheetRow && p.match.sheetRow !== p.row ? ` <span class="small muted">was row ${p.match.sheetRow}</span>` : ""}`;
    return `<details class="card sync" ${S.ui.syncOpen ? "open" : ""} data-sync>
      <summary><h2>Sync with your Excel sheet</h2>
        <span class="small muted">${rows.length ? `${rows.length} entries on rows ${min}–${max}` : "No row numbers yet"}${pendingRows.length ? ` · <b class="warn-text">${pendingRows.length} changed since last copy</b>` : ""}</span></summary>
      <div class="grid grid-2" style-top>
        <div class="stack">
          <h3>1 · Paste in from Excel</h3>
          <p class="small muted">In your sheet, select the rows (all 11 columns, Name to Remarks; the header row is fine too) and copy. Paste them here.</p>
          <textarea id="imp-text" rows="5" placeholder="Paste rows from your sheet here">${esc(S.ui.impText || "")}</textarea>
          <label class="field">Row number of the first row you copied<input type="number" id="imp-start" min="1" value="${esc(S.ui.impStart || "")}" placeholder="e.g. 1 if you copied the header row"></label>
          ${imp ? `<label class="field">Columns in what you pasted<select id="imp-layout">
              <option value="auto" ${(S.ui.impLayout || "auto") === "auto" ? "selected" : ""}>Work it out for me</option>
              <option value="11" ${S.ui.impLayout === "11" ? "selected" : ""}>All 11 columns (Name to Remarks)</option>
              <option value="8" ${S.ui.impLayout === "8" ? "selected" : ""}>8 columns (without Whatsapp Link, How did they find us, Schedule for Appt)</option></select></label>
            <p class="small">Reading it ${esc(imp.layout.how)}: ${imp.layout.fields.map((f) => (f ? esc(FIELD_LABEL[f]) : "<s>skipped</s>")).join(" · ")}</p>
            ${imp.notes.map((n) => `<div class="notice warn">${esc(n)}</div>`).join("")}
            ${imp.plan.length ? `<div class="table-wrap"><table class="sheet-preview"><thead><tr><th>Row</th><th>Name</th><th>Contact</th><th>Enquiry</th><th>Found us</th><th>Appt</th><th>Scheduler</th><th>Trial date</th><th>Trial time</th><th>Followed up</th><th>Remarks</th><th></th></tr></thead><tbody>
              ${imp.plan.map((p) => `<tr><td>${p.row}</td><td>${esc(p.data.name)}</td><td>${esc(p.data.phone)}</td><td>${esc(sheetDate(p.data.enquiryDate) || p.data.sheetRaw.enquiryDate || "")}</td><td>${esc(p.data.channel || "")}</td><td>${esc(p.data.scheduleAppt || "")}</td><td>${esc(p.data.scheduler)}</td><td>${esc(sheetDate(p.data.trialDate) || p.data.sheetRaw.trialDate || "")}</td><td>${esc(hm12(p.data.trialTime) || p.data.sheetRaw.trialTime || "")}</td><td>${esc(sheetDate(p.data.followedUp) || p.data.sheetRaw.followedUp || "")}</td><td class="wrap">${esc(p.data.remarks)}</td><td>${actionBadge(p)}${p.occupant ? ` <span class="small overdue">replaces ${esc(p.occupant.name)}</span>` : ""}</td></tr>`).join("")}
              </tbody></table></div>
              <div class="row"><button class="btn btn-primary" data-act="imp-apply">Import ${imp.plan.length} row${imp.plan.length > 1 ? "s" : ""}</button><button class="btn btn-ghost" data-act="imp-clear">Clear</button>
              <span class="small muted">${imp.plan.filter((p) => p.action === "new").length} new · ${imp.plan.filter((p) => p.action === "update").length} updated</span></div>
              <p class="small muted">New entries from the last 2 weeks get follow-ups. Older ones, and anyone whose remarks say they signed, are filed under Finished. Whatsapp Link isn't imported: it's always rebuilt from the contact number.</p>` : `<div class="notice">No rows with a name found.</div>`}` : ""}
        </div>
        <div class="stack">
          <h3>2 · Copy back to Excel</h3>
          ${rows.length ? `<div class="fields">
              <label class="field">From row<input type="number" id="exp-from" min="1" value="${from}"></label>
              <label class="field">To row<input type="number" id="exp-to" min="1" value="${to}"></label>
            </div>
            <div class="row"><button class="btn btn-primary" data-act="exp-copy">Copy rows ${Math.min(from, to)}–${Math.max(from, to)}</button>
              ${from !== min || to !== max ? `<button class="btn btn-ghost" data-act="exp-all">All rows (${min}–${max})</button>` : ""}</div>
            <p class="small">Then in Excel, click the <b>Name</b> cell in <b>row ${Math.min(from, to)}</b> and paste. Each row lands on its own row number.</p>
            ${ex.gaps.length ? `<div class="notice warn">${ex.gaps.length > 1 ? `Rows ${esc(gapText(ex.gaps))} aren't` : `Row ${ex.gaps[0]} isn't`} in the hub, so pasting will blank ${ex.gaps.length > 1 ? "those rows" : "that row"} in Excel. Import ${ex.gaps.length > 1 ? "them" : "it"} first, or copy a range that skips ${ex.gaps.length > 1 ? "them" : "it"}.</div>` : ""}`
            : `<p class="small muted">Import your sheet first, or give your entries row numbers below.</p>`}
          ${unnumbered ? `<div class="notice">${unnumbered} entr${unnumbered > 1 ? "ies don't" : "y doesn't"} have a row number yet.
            <div class="row" style-top><label class="field">Starting at row<input type="number" id="num-start" min="1" value="${nextRow()}"></label>
            <button class="btn btn-sm" data-act="num-assign">Number them</button></div></div>` : ""}
          <label class="field">Next new prospect goes in row<input type="number" id="next-row" min="2" value="${nextRow()}"></label>
          <label class="field">Whatsapp Link column<select id="wa-style">
            <option value="formula" ${S.settings.waLinkStyle !== "text" ? "selected" : ""}>Clickable link (=HYPERLINK formula)</option>
            <option value="text" ${S.settings.waLinkStyle === "text" ? "selected" : ""}>Plain link text</option></select></label>
        </div>
      </div>
    </details>`;
  }


  // Blocks NRIC and card details in remarks. Names and numbers are allowed:
  // they belong in the sheet.
  const sensitive = (t) => /\b[STFGM]\d{7}[A-Z]\b/i.test(t) || /\b\d(?:[ -]?\d){12,18}\b/.test(t);

  function monthStats() {
    const cur = todayStr().slice(0, 7);
    const inMonth = (d) => d && d.slice(0, 7) === cur;
    const trials = S.leads.filter((l) => l.trialOutcome && l.trialOutcome !== "noshow" && inMonth(l.trialDate || l.outcomeDate));
    const signed = trials.filter((l) => l.trialOutcome === "signed").length;
    const reasons = {};
    S.leads.filter((l) => l.reason && inMonth(l.reasonDate)).forEach((l) => { reasons[l.reason] = (reasons[l.reason] || 0) + 1; });
    const enquiries = S.leads.filter((l) => inMonth(l.enquiryDate)).length;
    return { trials: trials.length, signed, enquiries, reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]) };
  }

  // ---- rendering
  function leadCard(l, mode = "list") {
    const n = leadNext(l);
    const today = parse(todayStr());
    const j = journey(l.stage);
    const isProspect = j.kind === "prospect";
    const chips = [];
    chips.push(l.sheetRow ? `<span class="chip chip-row" title="Row number in your Excel sheet">Row ${l.sheetRow}</span>` : `<span class="chip" title="No row number in the Excel sheet yet">No row</span>`);
    if (l.trialDate) chips.push(`<span class="chip ${l.trialDate === todayStr() ? "chip-accent" : ""}">Trial ${l.trialDate === todayStr() ? "today" : shortDate(parse(l.trialDate))}${l.trialTime ? " · " + esc(hm12(l.trialTime)) : ""}</span>`);
    chips.push(`<span class="chip">Enquired ${esc(shortDate(parse(l.enquiryDate)))}</span>`);
    if (l.channel) chips.push(`<span class="chip">${esc(l.channel)}</span>`);
    if (l.scheduleAppt) chips.push(`<span class="chip">Appt: ${esc(l.scheduleAppt)}</span>`);
    if (l.followedUp) chips.push(`<span class="chip">Followed up ${esc(shortDate(parse(l.followedUp)))}</span>`);
    const wa = l.phone ? `<a class="link" href="https://wa.me/${waNumber(l.phone)}" target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>` : "";

    let body = "", acts = [];
    if (mode === "gym") {
      const mins = Math.round((Date.now() - l.checkIn) / 60000);
      body = `<p class="gym-time"><span class="live-dot" aria-hidden="true"></span>In since ${time12(new Date(l.checkIn))} · <b>${mins} min</b></p>
        <label class="field">Notes from your chat (saved to Remarks)<textarea rows="3" data-remarks="${l.id}" placeholder="What are they looking for? What's stopping them?">${esc(l.remarks)}</textarea></label>
        <div class="tags">${tagChips(l.remarks, "lead-tag", l.id)}</div>`;
      acts = [`<button class="btn btn-primary" data-act="lead-trial" data-o="signed" data-id="${l.id}">Signed up</button>`,
        `<button class="btn" data-act="lead-checkout" data-id="${l.id}">Check out</button>`];
    } else if (mode === "outcome") {
      const mins = l.checkOut ? Math.round((l.checkOut - l.checkIn) / 60000) : 0;
      body = `<p class="small muted">Trial finished${mins ? ` · ${time12(new Date(l.checkIn))}–${time12(new Date(l.checkOut))}` : ""}. How did it go?</p>`;
      acts = [["signed", "Signed", "btn-primary"], ["nosign", "Didn't sign", ""], ["friends", "With friends, not keen", ""]]
        .map(([o, t, c]) => `<button class="btn btn-sm ${c}" data-act="lead-trial" data-o="${o}" data-id="${l.id}">${t}</button>`);
    } else if (mode === "arriving") {
      body = l.remarks ? `<p class="small remarks">${esc(l.remarks)}</p>` : "";
      acts = [`<button class="btn btn-primary" data-act="lead-checkin" data-id="${l.id}">Check in</button>`,
        `<button class="btn btn-sm btn-ghost" data-act="lead-trial" data-o="noshow" data-id="${l.id}">No-show</button>`,
        `<button class="btn btn-sm btn-ghost" data-act="lead-book" data-id="${l.id}">Reschedule</button>`];
    } else if (n) {
      const diff = dayDiff(today, n.due);
      const when = diff < 0 ? `<span class="overdue">${-diff}d overdue</span>` : diff === 0 ? `<span class="overdue">due today</span>` : `in ${diff}d · ${shortDate(n.due)}`;
      body = `<div class="next"><span class="small muted">Next · step ${n.idx + 1} of ${n.total} · ${when}</span><b>${esc(n.action)}</b></div>
        ${l.remarks ? `<p class="small remarks">${esc(l.remarks)}</p>` : ""}`;
      if (n.outcome) {
        acts.push(`<button class="btn btn-sm btn-primary" data-act="lead-checkin" data-id="${l.id}">Check in</button>`,
          `<button class="btn btn-sm" data-act="lead-trial" data-o="noshow" data-id="${l.id}">No-show</button>`,
          `<button class="btn btn-sm" data-act="lead-book" data-id="${l.id}">Reschedule</button>`);
      } else {
        if (n.script) acts.push(`<button class="btn btn-sm btn-primary" data-act="lead-copy" data-id="${l.id}">Copy ${esc(n.script)}</button>`);
        acts.push(`<button class="btn btn-sm" data-act="lead-step" data-id="${l.id}" title="Marks today as the Followed Up date">Done</button>`);
        if (isProspect && l.stage !== "trial") acts.push(`<button class="btn btn-sm" data-act="lead-book" data-id="${l.id}">Book trial</button>`, `<button class="btn btn-sm" data-act="lead-checkin" data-id="${l.id}">Check in now</button>`);
        if (isProspect) acts.push(`<button class="btn btn-sm" data-act="lead-signed" data-id="${l.id}">Signed up</button>`);
      }
      if (["nosign", "friends", "enquiry"].includes(l.stage)) acts.push(`<select class="reason" data-reason="${l.id}" aria-label="Why didn't they sign?"><option value="">Why not?</option>${D.lostReasons.map((r) => `<option ${l.reason === r ? "selected" : ""}>${esc(r)}</option>`).join("")}</select>`);
    } else {
      body = `<p class="small muted">${esc(l.outcome || "All steps done")}</p>${l.remarks ? `<p class="small remarks">${esc(l.remarks)}</p>` : ""}`;
    }

    const ss = sheetState(l);
    const sheetBtn = `<button class="sheet-btn ${ss}" data-act="lead-row" data-id="${l.id}" title="Copies the row for the online sheet. Click the Name cell of an empty row and paste.">
      ${ss === "logged" ? "✓ In sheet" : ss === "changed" ? "↻ Changed, copy row again" : "⧉ Copy row for sheet"}</button>`;
    const due = n && !["gym", "outcome", "arriving"].includes(mode) && n.due <= today;
    return `<article class="lead ${mode} ${due ? "is-due" : ""}">
      <header>
        <div class="who"><h3>${esc(l.name)}</h3><div class="small muted">${esc(l.phone || "no number")} ${wa}</div></div>
        <div class="row tight">${isProspect ? `<button class="badge badge-btn ${(l.cat || "warm").toLowerCase()}" data-act="lead-cat" data-id="${l.id}" title="Priority: tap to change">${esc(l.cat || "WARM")}</button>` : ""}<span class="badge">${esc(j.label)}</span></div>
      </header>
      <div class="chips">${chips.join("")}</div>
      ${body}
      ${acts.length ? `<div class="row acts">${acts.join("")}</div>` : ""}
      <footer>${sheetBtn}<span class="spacer"></span>
        <button class="btn btn-sm btn-ghost" data-act="lead-edit" data-id="${l.id}">Edit</button>
        ${n ? `<button class="btn btn-sm btn-ghost" data-act="lead-close" data-id="${l.id}">Close</button>` : `<button class="btn btn-sm btn-ghost btn-danger" data-act="lead-del" data-id="${l.id}">Delete</button>`}</footer>
    </article>`;
  }

  function renderFollowups() {
    const today = parse(todayStr());
    const gym = S.leads.filter(inGym);
    const outcome = S.leads.filter((l) => !inGym(l) && awaitingOutcome(l));
    const arriving = S.leads.filter((l) => l.stage === "trial" && !l.closed && l.trialDate === todayStr() && !l.checkIn);
    const special = new Set([...gym, ...outcome, ...arriving].map((l) => l.id));
    const f = S.ui.fuFilter || "due";
    const q = (S.ui.fuQ || "").toLowerCase();
    const open = S.leads.map((l) => ({ l, n: leadNext(l) })).filter((x) => x.n && !special.has(x.l.id)).sort((a, b) => a.n.due - b.n.due);
    const match = {
      due: (x) => x.n.due <= today,
      trial: (x) => x.l.stage === "trial",
      prospect: (x) => x.n.journey.kind === "prospect",
      member: (x) => x.n.journey.kind === "member",
      all: () => true,
    };
    const fq = S.ui.fq || {};
    const seqList = journeys();
    const stepSeq = seqList.find((j) => j.id === fq.seq);
    const maxSteps = Math.max(...seqList.map((j) => j.steps.length));
    const prio = { HOT: 0, WARM: 1, COLD: 2 };
    const shown = open.filter((x) => match[f](x) && (!q || (x.l.name + " " + x.l.phone).toLowerCase().includes(q))
        && (!fq.seq || x.l.stage === fq.seq)
        && (fq.step === undefined || fq.step === "" || x.n.idx === Number(fq.step))
        && (!fq.cat || (x.l.cat || "WARM") === fq.cat)
        && (!fq.src || (fq.src === "-" ? !x.l.channel : x.l.channel === fq.src)))
      .sort((a, b) => fq.sort === "prio" ? (prio[a.l.cat || "WARM"] - prio[b.l.cat || "WARM"]) || (a.n.due - b.n.due)
        : fq.sort === "name" ? a.l.name.localeCompare(b.l.name)
        : fq.sort === "row" ? (a.l.sheetRow || 1e9) - (b.l.sheetRow || 1e9)
        : a.n.due - b.n.due);
    const filtering = fq.seq || (fq.step !== undefined && fq.step !== "") || fq.cat || fq.src;
    const sel = (key, label, options) => `<label class="field">${label}<select data-fq="${key}">${options.map(([v, t]) => `<option value="${esc(v)}" ${String(fq[key] ?? "") === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
    const filterBar = `<div class="filters">
        ${sel("seq", "Sequence", [["", "All"], ...seqList.map((j) => [j.id, j.label])])}
        ${sel("step", "Step", [["", "Any step"], ...(stepSeq ? stepSeq.steps.map((s, i) => [i, `Step ${i + 1}: ${s.action}`]) : Array.from({ length: maxSteps }, (_, i) => [i, `Step ${i + 1}`]))])}
        ${sel("cat", "Priority", [["", "All"], ["HOT", "HOT"], ["WARM", "WARM"], ["COLD", "COLD"]])}
        ${sel("src", "Found us via", [["", "All"], ...CHANNELS.map((c) => [c, c]), ["-", "Not set"]])}
        ${sel("sort", "Sort by", [["", "Due date"], ["prio", "Priority"], ["name", "Name"], ["row", "Sheet row"]])}
        ${filtering ? '<button class="btn btn-sm btn-ghost" data-act="fq-clear">Clear filters</button>' : ""}
      </div>`;
    const done = S.leads.filter((l) => !leadNext(l));
    const st = monthStats();
    const pending = unlogged().length;
    const segBtn = (id, label) => `<button data-act="fu-filter" data-id="${id}" aria-pressed="${f === id}">${label} <span class="muted">${open.filter(match[id]).length}</span></button>`;
    const tile = (n, label, cls = "") => `<div class="tile ${cls}"><b>${n}</b><span>${label}</span></div>`;

    return `
      <div class="page-head"><div><h1>Prospect &amp; Trial</h1>
        <p>Log enquiries and trials here, check trials in and out, and copy each row straight into the online sheet.</p></div>
        <button class="btn btn-primary" data-act="lead-new">+ New prospect</button></div>
      <div class="tiles">
        ${tile(gym.length, "in the gym now", gym.length ? "tile-live" : "")}
        ${tile(arriving.length, "trials still to arrive today")}
        ${tile(dueFollowups().length, "follow-ups due")}
        ${tile(pending, "not in the sheet yet", pending ? "tile-warn" : "")}
      </div>
      ${renderSync()}
      ${S.ui.leadDraft ? renderLeadEditor() : ""}
      ${gym.length || outcome.length ? `<section class="band band-live"><div class="band-head"><h2><span class="live-dot" aria-hidden="true"></span>In the gym now</h2>
          <p class="small muted">Good moment for a chat: ${esc(D.trialTalk[0])}</p></div>
        <div class="lead-grid">${gym.map((l) => leadCard(l, "gym")).join("")}${outcome.map((l) => leadCard(l, "outcome")).join("")}</div>
        <details class="talk"><summary>Talking points</summary><ol class="small">${D.trialTalk.map((t) => `<li>${esc(t)}</li>`).join("")}</ol></details></section>` : ""}
      ${arriving.length ? `<section class="band"><div class="band-head"><h2>Trials today</h2><p class="small muted">Check them in when they arrive.</p></div>
        <div class="lead-grid">${arriving.sort((a, b) => (a.trialTime || "").localeCompare(b.trialTime || "")).map((l) => leadCard(l, "arriving")).join("")}</div></section>` : ""}
      <section class="band">
        <div class="band-head row">
          <div class="seg" role="group" aria-label="Show">${segBtn("due", "Due now")}${segBtn("trial", "Trials booked")}${segBtn("prospect", "Prospects")}${segBtn("member", "New members")}${segBtn("all", "All")}</div>
          <span class="spacer"></span>
          <input type="text" id="fu-q" class="w-auto" placeholder="Search name or number" value="${esc(S.ui.fuQ || "")}">
          ${pending ? `<button class="btn" data-act="lead-rows" title="Copies every row from the first to the last changed one, laid out by row number">Copy ${pending} changed row${pending > 1 ? "s" : ""}</button>` : ""}
        </div>
        ${filterBar}
        ${filtering ? `<p class="small muted">Showing ${shown.length} of ${open.filter(match[f]).length}.</p>` : ""}
        ${shown.length ? `<div class="lead-grid">${shown.map(({ l }) => leadCard(l)).join("")}</div>` : `<div class="empty card">${q ? `No one matches "${esc(q)}".` : f === "due" ? "Nothing due right now." : "No one here yet."}</div>`}
      </section>
      <div class="grid">
        <section class="card">
          <h2>This month</h2>
          <div class="stats">
            <div class="stat"><b>${st.enquiries}</b><span>enquiries logged</span></div>
            <div class="stat"><b>${st.trials}</b><span>trials done</span></div>
            <div class="stat"><b>${st.signed}</b><span>signed after trial</span></div>
            <div class="stat"><b>${st.trials ? Math.round((st.signed / st.trials) * 100) + "%" : "–"}</b><span>trial conversion</span></div>
          </div>
          <h3 style-top>Why they didn't sign</h3>
          ${st.reasons.length ? `<ul class="plain small">${st.reasons.map(([r, c]) => `<li>${esc(r)}: <b>${c}</b></li>`).join("")}</ul>` : `<p class="small muted">Pick a reason under "Why not?" on a card and it's counted here.</p>`}
          <p class="small muted" style-top>${pendingBadge("CONFIRM #6")} Follow-up timings follow handbook 4.6.</p>
        </section>
      </div>
      ${done.length ? `<section class="card" style-top><details><summary>Finished or closed (${done.length})</summary>
        <div class="lead-grid" style-top>${done.slice(-30).reverse().map((l) => leadCard(l)).join("")}</div>
        <button class="btn btn-sm" data-act="lead-clear" style-top>Delete all finished</button></details></section>` : ""}
      <div style-gap>${renderLeadPreview()}</div>`;
  }

  function renderLeadEditor() {
    const d = S.ui.leadDraft;
    const type = D.customerTypes.find((t) => t.id === d.type) || D.customerTypes[0];
    const isNew = !d.id;
    const showTrial = isNew ? type.trial : true;
    const f = (k, label, type2 = "text", extra = "") => `<label class="field">${label}<input type="${type2}" data-ld="${k}" value="${esc(d[k] || "")}" ${extra}></label>`;
    const preview = { ...d, remarks: d.remarks };
    return `<section class="card editor" id="lead-editor">
      <div class="card-head"><h2>${isNew ? "New prospect" : "Edit " + esc(d.name)}</h2><button class="btn btn-sm btn-ghost" data-act="ld-cancel" aria-label="Close">✕</button></div>
      ${isNew ? `<div class="type-pick" role="radiogroup" aria-label="How did they come in?">${D.customerTypes.map((t) => `<button role="radio" aria-checked="${t.id === type.id}" data-act="ld-type" data-id="${t.id}">${esc(t.label)}</button>`).join("")}</div>` : ""}
      <div class="fields" style-top>
        ${f("name", "Name", "text", 'autocomplete="off" maxlength="60"')}
        ${f("phone", "Contact number", "tel", 'autocomplete="off" placeholder="9123 4567"')}
        ${f("enquiryDate", "Date of enquiry", "date")}
        <label class="field">How did they find out about us<select data-ld="channel"><option value="">Not set</option>${[...CHANNELS, ...(d.channel && !CHANNELS.includes(d.channel) ? [d.channel] : [])].map((c) => `<option ${d.channel === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
        <label class="field">Schedule for Appt<select data-ld="scheduleAppt">${D.apptOptions.map((c) => `<option ${(d.scheduleAppt || "TBC") === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
        ${showTrial ? f("trialDate", "Trial date", "date") + f("trialTime", "Trial time", "time") : ""}
        ${f("scheduler", "Scheduler")}
        ${!isNew ? f("followedUp", "Followed up", "date") : ""}
        ${f("sheetRow", "Row in Excel sheet", "number", 'min="1" step="1"')}
        ${type.journey !== "member" || !isNew ? `<label class="field">Category<select data-ld="cat">${["HOT", "WARM", "COLD"].map((c) => `<option ${d.cat === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>` : ""}
      </div>
      <div class="tags" style-top>${tagChips(d.remarks, "ld-tag")}</div>
      <label class="field" style-top>Remarks<textarea data-ld="remarks" rows="2" placeholder="Tap the tags above, or type anything else">${esc(d.remarks || "")}</textarea></label>
      <div class="row" style-top><button class="btn btn-primary" data-act="ld-save">${isNew ? (type.checkIn ? "Add and check in" : "Add") : "Save"}</button>
        <button class="btn" data-act="ld-cancel">Cancel</button><span class="small overdue" id="ld-msg"></span></div>
      <details class="small" style-top><summary>Preview the sheet row</summary><div class="table-wrap"><table class="sheet-preview"><thead><tr>${SHEET_COLUMNS.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>
        <tbody id="ld-preview">${previewRow(preview)}</tbody></table></div></details>
    </section>`;
  }

  const previewRow = (d) => `<tr>${sheetCells(d).map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`;
  function updateLeadPreview() { const el = document.getElementById("ld-preview"); if (el && S.ui.leadDraft) el.innerHTML = previewRow(S.ui.leadDraft); }

  function newLeadDraft(typeId = S.ui.fuType || "trial-booked") {
    const t = D.customerTypes.find((x) => x.id === typeId) || D.customerTypes[0];
    return { id: null, type: t.id, name: "", phone: "", enquiryDate: todayStr(), channel: t.source || "", scheduleAppt: t.appt || "TBC",
      trialDate: t.trial ? (t.id === "trial-booked" ? ymd(addDays(new Date(), 1)) : todayStr()) : "", trialTime: "",
      scheduler: S.settings.name || "", cat: "WARM", remarks: "", sheetRow: String(nextRow()) };
  }

  function saveLead() {
    const d = S.ui.leadDraft;
    const msg = document.getElementById("ld-msg");
    d.name = (d.name || "").trim(); d.phone = (d.phone || "").trim();
    if (!d.name) { msg.textContent = "Add their name."; return; }
    if (d.phone && waNumber(d.phone).length < 8) { msg.textContent = "That contact number looks too short."; return; }
    if (sensitive(d.remarks || "")) { msg.textContent = "Remarks look like they contain an NRIC or card number. Remove it."; return; }
    const rowNum = String(d.sheetRow || "").trim() === "" ? null : Number(d.sheetRow);
    if (rowNum !== null && !(Number.isInteger(rowNum) && rowNum >= 1)) { msg.textContent = "The row number must be a whole number, 1 or more."; return; }
    const taken = rowNum && leadAtRow(rowNum, d.id);
    if (taken) { msg.textContent = `Row ${rowNum} is already ${taken.name}. Pick another row, or change theirs first.`; return; }
    d.sheetRow = rowNum;
    const fields = ["name", "phone", "enquiryDate", "channel", "scheduleAppt", "trialDate", "trialTime", "scheduler", "followedUp", "cat", "remarks", "sheetRow"];
    if (d.id) {
      const l = S.leads.find((x) => x.id === d.id);
      const trialMoved = l.stage === "trial" && d.trialDate && d.trialDate !== l.trialDate;
      ["enquiryDate", "trialDate", "trialTime", "followedUp"].forEach((k) => { if (l.sheetRaw && k in d && d[k] !== l[k]) delete l.sheetRaw[k]; });
      fields.forEach((k) => { if (k in d) l[k] = d[k]; });
      if (trialMoved) startJourney(l, "trial", d.trialDate, "Trial moved");
      touch(l);
      S.ui.leadDraft = null; save(); render(); toast("Saved"); return;
    }
    const type = D.customerTypes.find((t) => t.id === d.type);
    const l = { id: uid(), v: 5, type: type.id, created: todayStr(), history: [], followedUp: "" };
    fields.forEach((k) => { if (k in d) l[k] = d[k]; });
    if (!type.trial && !type.checkIn) { l.trialDate = ""; l.trialTime = ""; }
    const anchor = { enquiry: l.enquiryDate, trial: l.trialDate || todayStr(), nosign: l.trialDate, friends: l.trialDate, member: type.id === "trial-signed" ? (l.trialDate || todayStr()) : l.enquiryDate }[type.journey] || todayStr();
    startJourney(l, type.journey, anchor, type.label);
    if (type.id === "trial-signed") { l.trialOutcome = "signed"; }
    if (type.id === "trial-nosign") { l.trialOutcome = "nosign"; }
    if (type.id === "trial-friends") { l.trialOutcome = "friends"; }
    if (type.checkIn) checkIn(l);
    touch(l);
    S.leads.push(l); S.ui.fuType = type.id; S.ui.leadDraft = null; save(); render();
    toast(type.checkIn ? `${l.name} checked in` : `${l.name} added`);
  }

  // ================= EOD REPORT (Today → Peak & Closing) =================
  // One report per day in S.eod[date].f. "auto" lines are worked out from the
  // hub but can be overwritten (the typed value wins until it's reset).
  // Pinned emails, pinned WhatsApp and lost and found start from the last
  // report so open cases carry over.
  const EOD_CARRY = ["pinnedEmails", "pinnedWA", "lostFound"];
  function eodDay(date = todayStr()) {
    S.eod = S.eod || {};
    if (!S.eod[date]) {
      const prev = Object.keys(S.eod).filter((k) => k < date).sort().pop();
      const f = {};
      if (prev) EOD_CARRY.forEach((k) => { if (S.eod[prev].f[k]) f[k] = S.eod[prev].f[k]; });
      S.eod[date] = { f };
    }
    return S.eod[date];
  }

  const signedOn = (l) => l.signedDate || (l.trialOutcome === "signed" ? l.outcomeDate : "");
  function eodAuto(date = todayStr()) {
    const ymNow = date.slice(0, 7);
    const tmr = ymd(addDays(parse(date), 1));
    const enq = S.leads.filter((l) => l.enquiryDate === date);
    const bucket = (src) => {
      const c = D.eodChannels;
      if (c.socmed.includes(src)) return "socmed";
      if (c.walkin.includes(src)) return "walkin";
      if (c.physical.includes(src)) return "physical";
      return "others";
    };
    const by = { socmed: 0, walkin: 0, physical: 0, others: 0 };
    enq.forEach((l) => { by[bucket(l.channel || "")]++; });
    const trialsToday = S.leads.filter((l) => (l.checkIn && ymd(new Date(l.checkIn)) === date) || (l.trialDate === date && l.trialOutcome && l.trialOutcome !== "noshow" && l.outcomeDate === date));
    return {
      date: `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][parse(date).getDay()]} ${longDate(parse(date))}`,
      tdyNjm: S.leads.filter((l) => signedOn(l) === date).length,
      mtdNjm: S.leads.filter((l) => (signedOn(l) || "").slice(0, 7) === ymNow && signedOn(l) <= date).length,
      socmed: by.socmed, walkin: by.walkin, physical: by.physical, others: by.others,
      tdyEnq: enq.length,
      trialsTdy: new Set(trialsToday.map((l) => l.id)).size,
      trialsTmr: S.leads.filter((l) => l.stage === "trial" && !l.closed && l.trialDate === tmr).length,
      missed: missedText(date),
    };
  }

  // Today's enquiries and trials that didn't end in a sign-up, numbered 1/N,
  // each with its next step.
  function missedText(date = todayStr()) {
    const list = S.leads.filter((l) => {
      if (signedOn(l)) return false;
      if (l.outcomeDate === date && ["nosign", "friends", "noshow"].includes(l.trialOutcome)) return true;
      if (l.enquiryDate !== date) return false;
      return !(l.stage === "trial" && l.trialDate && l.trialDate >= date); // a booked trial isn't missed yet
    });
    return list.map((l, i) => {
      const what = l.trialOutcome === "noshow" && l.outcomeDate === date ? "no-show for trial"
        : ["nosign", "friends"].includes(l.trialOutcome) && l.outcomeDate === date ? "trialled, didn't sign"
        : "enquiry, no trial booked";
      const n = leadNext(l);
      const next = n ? `Next: ${n.action}, ${shortDate(n.due)}` : "Next: none";
      return `${i + 1}/${list.length} ${l.name} - ${what}${l.reason ? ` (${l.reason})` : ""}. ${next}`;
    }).join("\n");
  }

  // [label, key, kind]. kind: auto (worked out, can be overwritten), count
  // (tallied with +/- during the shift), num/text (typed in), area (multi-line).
  const EOD_LINES = [
    ["TDY NJMS", "tdyNjm", "auto"], ["MTD NJMS", "mtdNjm", "auto"], ["RENEWALS", "renewals", "count"],
    ["TDY ENQUIRIES", "tdyEnq", "auto"], ["PT SIGN UP TRIALS/PACKAGE", "ptSign", "count"], ["PT ENQUIRIES", "ptEnq", "count"],
    ["SOCMED POST/ADS ENQUIRIES", "socmed", "auto"], ["WALK-IN ENQUIRIES", "walkin", "auto"], ["PHYSICAL AD ENQUIRIES", "physical", "auto"],
    ["OTHERS (Google search, Phone  call, WhatsApp, Website)", "others", "auto"],
  ];
  const EOD_LINES2 = [
    ["GYM TRIALS TDY", "trialsTdy", "auto"], ["GYM TRIALS TMR", "trialsTmr", "auto"],
    ["GREEN MEMBERS", "green", "num"], ["YELLOW MEMBERS", "yellow", "num"], ["RED MEMBERS", "red", "num"], ["FROZEN MEMBERS", "frozen", "num"],
  ];
  const EOD_LINES3 = [
    ["GOOGLE REVIEWS", "gr", "num"], ["GOOGLE REVIEWS MTD", "grMtd", "num"], ["GOOGLE REVIEWS REPLIED", "grReplied", "num"],
    ["MEMBER TRANSFER IN", "tIn", "num"], ["MEMBER TRANSFER OUT", "tOut", "num"], ["MTD TRANSFER IN", "mtdIn", "num"], ["MTD TRANSFER OUT", "mtdOut", "num"],
  ];
  function eodVal(key, kind, e, auto) {
    if (e.f[key] !== undefined && e.f[key] !== "") return e.f[key];
    if (key === "tdyEnq") { // always the four channel lines added up, typed-over ones included
      return String(["socmed", "walkin", "physical", "others"].reduce((t, k) => t + (Number(eodVal(k, "auto", e, auto)) || 0), 0));
    }
    if (kind === "auto") return String(auto[key] ?? "");
    if (kind === "count") return "0";
    return "";
  }
  function eodText(date = todayStr()) {
    const e = eodDay(date), a = eodAuto(date);
    const v = (k, kind) => eodVal(k, kind, e, a);
    const line = ([label, key, kind]) => `${label}: ${v(key, kind)}`;
    const block = (label, key, kind = "area") => `${label}: \n${v(key, kind)}`;
    return [
      `Closing Petty Cash: ${v("pettyCash", "text")}`,
      "",
      `EOD Report: ${a.date}`,
      "",
      ...EOD_LINES.map(line),
      "",
      ...EOD_LINES2.map(([l, k, kind]) => (l === "GREEN MEMBERS" ? `${l}:  ${v(k, kind)}` : line([l, k, kind]))),
      "",
      ...EOD_LINES3.map(line),
      "-------------",
      "",
      block("HIGHLIGHTS OF THE DAY", "highlights"),
      " ",
      `MISSED OPPORTUNITIES: \n${v("missed", "auto")}`,
      "",
      block("PINNED EMAILS", "pinnedEmails"),
      "",
      block("PINNED WHATSAPP", "pinnedWA"),
      "",
      block("LOST AND FOUND", "lostFound"),
      "",
      `Others: ${v("others2", "text")}`,
      "",
      block("Handover to AM", "handoverAM"),
    ].join("\n");
  }

  function renderEod() {
    const e = eodDay(), a = eodAuto();
    const numField = ([label, key, kind]) => {
      const typed = e.f[key] !== undefined && e.f[key] !== "";
      if (kind === "count") {
        return `<div class="eod-f"><span class="eod-l">${esc(label)}</span><div class="row tight eod-count">
          <button class="btn btn-sm" data-act="eod-dec" data-id="${key}" aria-label="One less">−</button>
          <input type="number" min="0" data-eod="${key}" value="${esc(eodVal(key, kind, e, a))}" aria-label="${esc(label)}">
          <button class="btn btn-sm" data-act="eod-inc" data-id="${key}" aria-label="One more">+</button></div></div>`;
      }
      if (kind === "auto") {
        return `<div class="eod-f"><span class="eod-l">${esc(label)} <span class="eod-badge" data-badge="${key}">${eodBadge(key, typed)}</span></span>
          <input type="number" min="0" data-eod="${key}" data-auto="1" value="${esc(eodVal(key, kind, e, a))}" aria-label="${esc(label)}"></div>`;
      }
      return `<div class="eod-f"><span class="eod-l">${esc(label)}</span><input type="number" min="0" data-eod="${key}" value="${esc(e.f[key] || "")}" aria-label="${esc(label)}"></div>`;
    };
    const area = (label, key, rows, hint = "") => `<label class="field">${esc(label)}${hint}<textarea rows="${rows}" data-eod="${key}">${esc(e.f[key] || "")}</textarea></label>`;
    const missedTyped = e.f.missed !== undefined && e.f.missed !== "";
    const prev = Object.keys(S.eod).filter((k) => k < todayStr()).sort().pop();
    return `<section class="card stack" id="eod-card">
      <div class="card-head"><h2>EOD report</h2><button class="btn btn-primary" data-act="eod-copy">Copy EOD report</button></div>
      <p class="small muted">Lines marked <span class="badge ok">auto</span> are counted from Prospect &amp; Trial. Type over any of them if the hub missed something. Use + and − during the shift for renewals and PT.</p>
      <label class="field">Closing Petty Cash<input type="text" data-eod="pettyCash" value="${esc(e.f.pettyCash || "")}" placeholder="e.g. $200.00 (no variance)"></label>
      <h3>Today's numbers</h3>
      <div class="eod-grid">${EOD_LINES.map(numField).join("")}</div>
      <p class="small muted">TDY ENQUIRIES is the four channel lines added up. Channels come from "How did they find out about us" on each prospect.</p>
      <h3>Trials and members</h3>
      <div class="eod-grid">${EOD_LINES2.map(numField).join("")}</div>
      <p class="small muted">Member numbers: My Reports › Member Reports › Member Movement in the club system.</p>
      <h3>Reviews and transfers</h3>
      <div class="eod-grid">${EOD_LINES3.map(numField).join("")}</div>
      ${area("Highlights of the day", "highlights", 2)}
      <label class="field"><span>Missed opportunities <span class="eod-badge" data-badge="missed">${eodBadge("missed", missedTyped)}</span></span>
        <textarea rows="4" data-eod="missed" data-auto="1" placeholder="No missed opportunities today">${esc(eodVal("missed", "auto", e, a))}</textarea></label>
      ${area("Pinned emails", "pinnedEmails", 4, prev ? ' <span class="badge">carried over</span>' : "")}
      ${area("Pinned WhatsApp", "pinnedWA", 3, prev ? ' <span class="badge">carried over</span>' : "")}
      ${area("Lost and found", "lostFound", 3, prev ? ' <span class="badge">carried over</span>' : "")}
      <label class="field">Others<input type="text" data-eod="others2" value="${esc(e.f.others2 || "")}"></label>
      ${area("Handover to AM", "handoverAM", 4)}
      <details><summary>Preview</summary><pre class="out" id="eod-preview">${esc(eodText())}</pre></details>
      <div class="row"><button class="btn btn-primary" data-act="eod-copy">Copy EOD report</button><button class="btn btn-ghost" data-act="handover-copy-alt">Copy short handover instead</button></div>
    </section>`;
  }
  const eodBadge = (key, typed) => (typed
    ? `<button class="badge pending badge-btn" data-act="eod-reset" data-id="${key}" title="Typed over. Tap to go back to the hub's count">edited ↺</button>`
    : '<span class="badge ok">auto</span>');
  function updateEodPreview() { const el = document.getElementById("eod-preview"); if (el) el.textContent = eodText(); }

  // ================= SHEET PREVIEW CARDS =================
  // A table of every row as it will be pasted, with a copy button per row.
  // Each page remembers whether its preview is hidden.
  const prevHidden = (page) => !!(S.ui.prevHidden || {})[page];
  function prevShell(page, title, count, actions, table) {
    if (prevHidden(page)) {
      return `<section class="card prev-collapsed"><div class="row"><b>${esc(title)}</b><span class="small muted">${count} row${count === 1 ? "" : "s"} · hidden</span><span class="spacer"></span>
        <button class="btn btn-sm" data-act="prev-toggle" data-id="${page}">Show</button></div></section>`;
    }
    return `<section class="card stack prev-card">
      <div class="card-head"><div><h2>${esc(title)}</h2><p class="small muted">Click ⧉ to copy one row, then paste it into the Name cell of that row in your sheet.</p></div>
        <div class="row">${actions}<button class="btn btn-sm btn-ghost" data-act="prev-toggle" data-id="${page}">Hide</button></div></div>
      ${count ? `<div class="table-wrap prev-wrap">${table}</div>` : `<div class="empty">Nothing to show yet.</div>`}
    </section>`;
  }

  function renderLeadPreview() {
    const list = [...S.leads].sort((a, b) => (a.sheetRow || 1e9) - (b.sheetRow || 1e9) || (a.enquiryDate || "").localeCompare(b.enquiryDate || ""));
    const stateDot = { new: ["dot-new", "Not copied yet"], changed: ["dot-changed", "Changed since last copy"], logged: ["dot-logged", "In the sheet"] };
    const table = `<table class="sheet-preview prev-table"><thead><tr><th>Row</th>${SHEET_COLUMNS.map((c) => `<th>${esc(c.label)}</th>`).join("")}<th class="prev-copy-col"><span class="sr-only">Copy</span></th></tr></thead><tbody>
      ${list.map((l) => {
        const [cls, tip] = stateDot[sheetState(l)];
        return `<tr><td class="num"><span class="dot ${cls}" title="${tip}"></span>${l.sheetRow || "–"}</td>${sheetCells(l).map((v) => `<td title="${esc(v)}">${esc(v)}</td>`).join("")}
          <td class="prev-copy-col"><button class="copy-btn" data-act="lead-row" data-id="${l.id}" title="Copy row ${l.sheetRow || ""}" aria-label="Copy ${esc(l.name)}'s row">⧉</button></td></tr>`;
      }).join("")}</tbody></table>`;
    const rows = rowsInUse();
    const actions = rows.length ? `<button class="btn btn-sm" data-act="exp-all">Copy all rows (${Math.min(...rows)}–${Math.max(...rows)})</button>` : "";
    return prevShell("followups", "Sheet preview", list.length, actions, table);
  }

  // Payments rows: Name | Contact Number | Amount | Status | Last Contact | Note
  const DUES_COLUMNS = ["Name", "Contact Number", "Amount", "Status", "Last Contact", "Note"];
  const duesCells = (m) => [m.name, m.phone, m.amount ? money(parseFloat(m.amount)) : "", statusLabel(m.status), m.last || "", m.note || ""].map(sheetCell);
  function renderDuesPreview() {
    const list = duesList();
    const table = `<table class="sheet-preview prev-table"><thead><tr><th>#</th>${DUES_COLUMNS.map((c) => `<th>${c}</th>`).join("")}<th class="prev-copy-col"><span class="sr-only">Copy</span></th></tr></thead><tbody>
      ${list.map((m, i) => `<tr><td class="num">${i + 1}</td>${duesCells(m).map((v) => `<td title="${esc(v)}">${esc(v)}</td>`).join("")}
        <td class="prev-copy-col"><button class="copy-btn" data-act="dues-row" data-id="${m.id}" aria-label="Copy ${esc(m.name)}'s row">⧉</button></td></tr>`).join("")}</tbody></table>`;
    const actions = list.length ? `<button class="btn btn-sm" data-act="dues-rows">Copy all ${list.length} rows</button>` : "";
    return prevShell("payments", `Sheet preview · ${monthName(duesMonth())}`, list.length, actions, table);
  }

  // ================= PAYMENTS (monthly dues chase) =================
  // Payments are collected on the 1st at 00:00. Members who haven't paid are
  // chased until the 8th at 00:00, when EZpay makes its second deduction.
  const DUES_STATUS = [
    ["todo", "Not contacted"], ["sent", "Reminded"], ["second", "7th reminder sent"],
    ["promised", "Promised to pay"], ["paid", "Paid"], ["unreachable", "No reply / other"],
  ];
  const statusLabel = (s) => (DUES_STATUS.find((x) => x[0] === s) || DUES_STATUS[0])[1];
  const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const duesMonth = () => S.ui.duesMonth || ym(new Date());
  const duesList = (m = duesMonth()) => (S.dues[m] = S.dues[m] || { members: [] }).members;
  const monthName = (m) => MONTHS[Number(m.slice(5, 7)) - 1];
  const waNumber = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length === 8 ? "65" + d : d; };

  function duesPhase(m = duesMonth()) {
    const [y, mo] = m.split("-").map(Number);
    const deadline = new Date(y, mo - 1, D.dues.deadlineDay, 0, 0);
    const second = new Date(y, mo - 1, D.dues.secondDeductionDay);
    const now = new Date();
    const isSecondDay = ymd(now) === ymd(second);
    return { deadline, isSecondDay, closed: now >= deadline, msLeft: deadline - now, script: isSecondDay ? "/SecondDeduction" : "/DuesReminder" };
  }

  function duesQueue() {
    const ph = duesPhase();
    const want = ph.isSecondDay ? ["todo", "sent", "promised"] : ["todo"];
    return duesList().filter((m) => want.includes(m.status)).sort((a, b) => (a.skipped || 0) - (b.skipped || 0));
  }
  function duesMessage(m) {
    const s = findScript(duesPhase().script);
    return s ? fill(s.text, { name: m.name.split(" ")[0], month: monthName(duesMonth()), amount: m.amount }) : "";
  }
  function duesStats(list = duesList()) {
    const paid = list.filter((m) => m.status === "paid");
    const out = list.filter((m) => m.status !== "paid");
    const sum = (a) => a.reduce((t, m) => t + (parseFloat(m.amount) || 0), 0);
    return { total: list.length, paid: paid.length, out: out.length, outSum: sum(out), todo: list.filter((m) => m.status === "todo").length };
  }

  function parseMembers(text) {
    const out = [];
    text.split(/\r?\n/).forEach((line) => {
      let raw = line.trim();
      if (!raw) return;
      let phone = "", amount = "";
      const pm = raw.match(/(?:\+?65[ -]?)?\b([3689]\d{3})[ -]?(\d{4})\b/);
      if (pm) { phone = pm[1] + pm[2]; raw = raw.replace(pm[0], " "); }
      const am = raw.match(/\$\s?(\d+(?:\.\d{1,2})?)/) || raw.match(/\b(\d+\.\d{2})\b/) || raw.match(/\b(\d{2,4})\b/);
      if (am) { amount = am[1]; raw = raw.replace(am[0], " "); }
      const name = raw.replace(/"/g, "").replace(/[,\t;|]+/g, " ").replace(/\s+/g, " ").trim();
      if (!name || (/^(name|member)/i.test(name) && !phone && !amount)) return;
      out.push({ name, phone, amount });
    });
    return out;
  }
  function importMembers(text) {
    const list = duesList();
    let added = 0, dup = 0;
    parseMembers(text).forEach((p) => {
      if (list.some((m) => (p.phone && m.phone === p.phone) || m.name.toLowerCase() === p.name.toLowerCase())) { dup++; return; }
      list.push({ id: uid(), ...p, status: "todo", last: "", note: "" });
      added++;
    });
    save(); render();
    toast(`${added} added${dup ? `, ${dup} already on the list` : ""}`);
  }
  function markDues(m, status) {
    m.status = status;
    m.last = `${shortDate(new Date())} ${hhmm(new Date())}`;
    m.skipped = 0;
  }

  function renderPayments() {
    const m = duesMonth();
    const list = duesList(m);
    const ph = duesPhase(m);
    const st = duesStats(list);
    const q = duesQueue();
    const next = q[0];
    const f = S.ui.duesFilter || "open";
    const search = (S.ui.duesQ || "").toLowerCase();
    const rows = list.filter((x) => (f === "all" || (f === "open" ? x.status !== "paid" : x.status === f)) && (!search || (x.name + x.phone).toLowerCase().includes(search)));
    const months = [...new Set([ym(new Date()), ...Object.keys(S.dues)])].sort().reverse();

    let phaseHtml;
    if (ph.closed) phaseHtml = `<div class="notice">EZpay's second deduction ran on ${longDate(ph.deadline)} at 00:00. If it failed for anyone still unpaid here, they now also owe the $${D.fees.latePayment} late payment fee. Mark members Paid as their payments come in.</div>`;
    else {
      const h = Math.floor(ph.msLeft / 36e5), d = Math.floor(h / 24);
      phaseHtml = `<div class="next-up"><span class="big">${d ? `${d}d ${h % 24}h` : `${h}h`}</span><div><b>left to chase before ${D.dues.deadlineDay} ${monthName(m)}, 00:00</b>
        <p class="small muted">${ph.isSecondDay ? `Today is the ${D.dues.secondDeductionDay}th: send <b>/SecondDeduction</b> to everyone unpaid. EZpay deducts again at 00:00 tonight, and adds the late fee if that fails.` : `Send <b>/DuesReminder</b> to everyone not yet contacted. On the ${D.dues.secondDeductionDay}th, send /SecondDeduction.`}</p></div></div>`;
    }

    let nextHtml = `<div class="empty">${list.length ? (ph.isSecondDay ? "Everyone unpaid has had the 7th reminder." : "Everyone has been contacted.") : "Paste this month's yellow members below to start."}</div>`;
    if (next) {
      const msg = duesMessage(next);
      const link = next.phone ? `https://wa.me/${waNumber(next.phone)}?text=${encodeURIComponent(msg)}` : "";
      nextHtml = `
        <div class="row"><b class="lg">${esc(next.name)}</b><span class="muted">${esc(next.phone || "no phone")}</span>${next.amount ? `<span class="badge">${money(parseFloat(next.amount))}</span>` : ""}<span class="spacer"></span><span class="small muted">${q.length} left in queue</span></div>
        <pre class="out" style-top>${esc(msg)}</pre>
        <div class="row" style-top>
          ${link ? `<a class="btn btn-primary" href="${esc(link)}" target="_blank" rel="noopener noreferrer" data-act="dues-wa" data-id="${next.id}">Open in WhatsApp &amp; mark sent</a>` : ""}
          <button class="btn ${link ? "" : "btn-primary"}" data-act="dues-copy" data-id="${next.id}">Copy message</button>
          <button class="btn" data-act="dues-sent" data-id="${next.id}">Mark sent</button>
          <button class="btn btn-ghost" data-act="dues-skip" data-id="${next.id}">Skip for now</button>
        </div>`;
    }

    const segBtn = (id, label, n) => `<button data-act="dues-filter" data-id="${id}" aria-pressed="${f === id}">${label}${n !== undefined ? ` (${n})` : ""}</button>`;
    const byStatus = (s) => list.filter((x) => x.status === s).length;

    return `
      <div class="page-head"><div><h1>Payments</h1>
        <p>Chase members whose payment failed on the 1st (yellow members) before the ${D.dues.deadlineDay}th. Names and numbers stay on this computer.</p></div>
        <label class="field">Month<select data-act-change="dues-month">${months.map((x) => `<option value="${x}" ${x === m ? "selected" : ""}>${monthName(x)} ${x.slice(0, 4)}</option>`).join("")}</select></label>
      </div>
      <div class="grid">
        <div class="grid grid-2">
          <section class="card"><h2>Deadline</h2>${phaseHtml}</section>
          <section class="card"><h2>${monthName(m)} so far</h2>
            <div class="stats">
              <div class="stat"><b>${st.paid}/${st.total}</b><span>paid</span></div>
              <div class="stat"><b>${st.out}</b><span>outstanding</span></div>
              <div class="stat"><b>${money(st.outSum)}</b><span>still owed</span></div>
              <div class="stat"><b>${st.todo}</b><span>not contacted</span></div>
            </div>
            <progress max="${st.total || 1}" value="${st.paid}" aria-label="Paid"></progress>
            <div class="row" style-top><button class="btn btn-sm" data-act="dues-summary">Copy summary for EOD / handover</button></div>
          </section>
        </div>
        <section class="card"><div class="card-head"><h2>Next to message</h2>${findScript(ph.script)?.draft ? `<span class="badge pending" title="New wording, not in the handbook yet">${ph.script} is a draft</span>` : ""}</div>${nextHtml}</section>
        <section class="card">
          <div class="card-head"><div class="seg" role="group" aria-label="Show">${segBtn("open", "Unpaid", st.out)}${segBtn("todo", "Not contacted", byStatus("todo"))}${segBtn("promised", "Promised", byStatus("promised"))}${segBtn("paid", "Paid", st.paid)}${segBtn("all", "All", st.total)}</div>
            <input type="text" id="dues-q" class="w-auto" placeholder="Search name or number" value="${esc(S.ui.duesQ || "")}"></div>
          ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Member</th><th class="num">Amount</th><th>Status</th><th>Last contact</th><th>Note</th><th></th></tr></thead><tbody>
            ${rows.map((x) => `<tr>
              <td><b>${esc(x.name)}</b><div class="small muted">${esc(x.phone)}</div></td>
              <td class="num">${x.amount ? money(parseFloat(x.amount)) : "–"}</td>
              <td><select data-dues-status="${x.id}" aria-label="Status">${DUES_STATUS.map(([v, l]) => `<option value="${v}" ${x.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></td>
              <td class="small muted">${esc(x.last || "–")}</td>
              <td><input type="text" data-dues-note="${x.id}" value="${esc(x.note || "")}" placeholder="e.g. paying Friday"></td>
              <td class="num"><div class="row">${x.status !== "paid" ? `<button class="btn btn-sm" data-act="dues-paid" data-id="${x.id}">Paid</button>` : ""}<button class="btn btn-sm btn-ghost btn-danger" data-act="dues-del" data-id="${x.id}" aria-label="Remove">✕</button></div></td>
            </tr>`).join("")}</tbody></table></div>` : `<div class="empty">No members match.</div>`}
        </section>
        <div class="grid grid-2">
          <section class="card stack"><h2>Add yellow members</h2>
            <p class="small muted">Paste from Membr or a spreadsheet, one member per line: name, phone number and amount in any order, e.g. <code>Alex Tan, 9123 4567, $118</code>. Duplicates are skipped.</p>
            <textarea id="dues-paste" placeholder="Alex Tan, 9123 4567, $118&#10;Priya R	81234567	158.00"></textarea>
            <div class="row"><button class="btn btn-primary" data-act="dues-import">Add to ${monthName(m)}</button>
              <label class="btn" for="dues-file">Load a .csv or .txt file</label><input type="file" id="dues-file" accept=".csv,.txt,text/plain,text/csv" hidden>
              ${list.length ? `<span class="spacer"></span><button class="btn btn-ghost btn-danger" data-act="dues-clear">Clear ${monthName(m)}</button>` : ""}</div>
          </section>
          <section class="card"><h2>Keeping prospects from getting buried</h2>
            <ul class="plain small">
              <li>Send the reminders in <b>one batch</b> at a quiet time (e.g. the morning of the 2nd), not spread through the shift.</li>
              <li>In WhatsApp Business, give these chats a <b>"Dues"</b> label and your prospects a <b>"Prospect"</b> label. Filter by label to see just one group.</li>
              <li>After sending, <b>archive</b> the chat. With Settings → Chats → <b>Keep chats archived</b> on, replies stay in the Archived folder instead of pushing prospects down. Check that folder twice a shift for payment screenshots.</li>
              <li>This page is the list of who still owes. The Prospect &amp; Trial tab is the list of prospects. You don't need to rely on chat order for either.</li>
            </ul>
          </section>
        </div>
        ${renderDuesPreview()}
      </div>`;
  }

  function duesSummary() {
    const m = duesMonth();
    const st = duesStats();
    const promised = duesList().filter((x) => x.status === "promised");
    return [`${club().code} dues chase · ${monthName(m)} · ${longDate(new Date())}`,
      `Paid: ${st.paid}/${st.total} · Outstanding: ${st.out} (${money(st.outSum)}) · Not contacted yet: ${st.todo}`,
      ...(promised.length ? ["Promised to pay:", ...promised.map((x) => `- ${initials(x.name)}${x.note ? ": " + x.note : ""}`)] : [])].join("\n");
  }
  const initials = (n) => n.split(/\s+/).map((w) => w[0] || "").join("").toUpperCase();

  function updateBadge() {
    const n = dueFollowups().length;
    const b = document.getElementById("fu-count");
    b.hidden = n === 0; b.textContent = n;
    const cur = S.dues[ym(new Date())];
    const out = cur && new Date().getDate() < D.dues.deadlineDay ? duesStats(cur.members).out : 0;
    const p = document.getElementById("dues-count");
    p.hidden = out === 0; p.textContent = out;
  }

  // ================= CALCULATORS =================
  const C = (k, v) => (S.calc[k] ?? v);
  function renderCalc() {
    const rateOpts = (k) => D.rates.map((r) => `<option value="${r.id}" ${C(k, "m12") === r.id ? "selected" : ""}>${esc(r.label)} · $${r.monthly}</option>`).join("");
    const inp = (k, type, label, def = "", extra = "") => `<label class="field">${label}<input type="${type}" data-k="${k}" value="${esc(C(k, def))}" ${extra}></label>`;
    return `
      <div class="page-head"><div><h1>Calculators</h1>
        <p>Freeze fees, cancellation prorata and quotes, with the email drafted for you. Member names typed here never leave this computer.</p></div></div>
      <div class="grid">
        <section class="card">
          <div class="card-head"><h2>Membership freeze</h2>${pendingBadge("CONFIRM #4, #5")}</div>
          <div class="fields">
            ${inp("fz_member", "text", "Member name", "")}
            ${inp("fz_request", "date", "Request received", todayStr())}
            ${inp("fz_month", "text", "Month already processed", MONTHS[new Date().getMonth()])}
            ${inp("fz_start", "date", "Freeze start", "")}
            ${inp("fz_end", "date", "Freeze end", "")}
          </div>
          <div id="fz-out" class="stack" style-top></div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Cancellation prorata</h2>${pendingBadge("CONFIRM #2, #3")}</div>
          <div class="fields">
            ${inp("cn_member", "text", "Member name", "")}
            <label class="field">Monthly fee<select data-k="cn_rate">${rateOpts("cn_rate")}<option value="custom" ${C("cn_rate") === "custom" ? "selected" : ""}>Other amount</option></select></label>
            ${inp("cn_custom", "number", "Other amount ($)", "", 'min="0" step="0.01"')}
            ${inp("cn_notice", "date", "Notice received", todayStr())}
            ${inp("cn_last", "date", "Last day of access", "")}
            <label class="field">Email type<select data-k="cn_type"><option value="manual" ${C("cn_type", "manual") === "manual" ? "selected" : ""}>Manual (pays by VPA)</option><option value="auto" ${C("cn_type") === "auto" ? "selected" : ""}>Automatic (deducted)</option></select></label>
          </div>
          <div id="cn-out" class="stack" style-top></div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Quick quote</h2>${pendingBadge("CONFIRM #16")}</div>
          <div class="fields">
            <label class="field">Membership<select data-k="qt_plan">${rateOpts("qt_plan")}</select></label>
            <label class="field">Bundle<select data-k="qt_bundle"><option value="none">None</option>${D.bundles.map((b) => `<option value="${b.id}" ${C("qt_bundle") === b.id ? "selected" : ""}>${esc(b.label)}</option>`).join("")}</select></label>
          </div>
          <div id="qt-out" class="stack" style-top></div>
        </section>
      </div>`;
  }

  function updateCalc() {
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    const sig = () => `\n\n(Your mail client adds the ${club().code} signature. Check it's there before sending.)`;

    // Freeze
    {
      const req = parse(C("fz_request", todayStr())), st = parse(C("fz_start")), en = parse(C("fz_end"));
      const earliest = req ? addDays(req, 30) : null;
      const out = [];
      if (earliest) out.push(`<p>Earliest start under the 30-day notice rule: <b>${longDate(earliest)}</b> ${pendingBadge("CONFIRM #5")}</p><p class="small muted">If this month's payment has already gone through, the freeze can't start until after that billing period.</p>`);
      if (st && en) {
        const days = dayDiff(st, en) + 1;
        if (days <= 0) out.push(`<div class="notice bad">The end date is before the start date.</div>`);
        else {
          const weeks = S.settings.partialWeeks === "down" ? Math.max(1, Math.floor(days / 7)) : Math.ceil(days / 7);
          const fee = weeks * D.fees.freezePerWeek;
          if (earliest && st < earliest) out.push(`<div class="notice warn">Start date is earlier than ${longDate(earliest)}. Check the notice period.</div>`);
          if (days % 7) out.push(`<div class="notice warn">${days} days is not a whole number of weeks. Partial weeks are being rounded ${S.settings.partialWeeks === "down" ? "down" : "up"} (change in Settings once the manager confirms the rule).</div>`);
          out.push(`<div class="stats"><div class="stat"><b>${days}</b><span>days</span></div><div class="stat"><b>${weeks}</b><span>weeks charged</span></div><div class="stat"><b>${money(fee)}</b><span>freeze fee</span></div></div>`);
          const name = C("fz_member") || "[Member Name]";
          const email = `Subject: Membership Freeze Request

Dear ${name},

We hope this email finds you well.

As we require a 30-day minimum notice, and your ${C("fz_month", MONTHS[new Date().getMonth()]) || "[Month]"} payment has already been processed, the earliest we can freeze your membership will be ${longDate(st)}.

Freeze Details:
Freeze period: ${longDate(st)} to ${longDate(en)} (${days} days)
Fee breakdown: ($${D.fees.freezePerWeek}/week × ${weeks} weeks) = ${money(fee)}

Kindly arrange payment of ${money(fee)} to the VPA below by the end of the month to proceed with your freeze request:
VPA: ${club().vpaFreezeCancel}

When making the payment, please indicate "${club().code} Freezing" in the payment remarks.

Once payment has been made, kindly send us a screenshot of the payment confirmation for our records.

Should you have any questions, please feel free to reach out. We will be happy to assist.` + sig();
          const confirm = `Subject: Membership Freeze Confirmed

Dear ${name},

Thank you for your prompt payment. We have received and verified your payment successfully.

Your membership freeze has been processed according to the details below:
Freeze Start Date: ${longDate(st)}
Freeze End Date: ${longDate(en)}

Please note that club access will be temporarily suspended during the freeze period. Your membership will automatically resume on the reactivation date stated above, and your regular membership billing will continue thereafter in accordance with your membership agreement.` + sig();
          calcEmails.fz = email; calcEmails.fzc = confirm;
          out.push(`<div class="notice warn">Post the draft in Discord for vetting before sending.</div>
            <pre class="out">${esc(email)}</pre>
            <div class="row"><button class="btn btn-primary" data-act="copy-calc" data-id="fz">Copy request email</button><button class="btn" data-act="copy-calc" data-id="fzc">Copy confirmation email</button></div>`);
        }
      } else out.push(`<p class="small muted">Enter the freeze start and end dates to work out the fee and draft the email.</p>`);
      set("fz-out", out.join(""));
    }

    // Cancellation
    {
      const rateId = C("cn_rate", "m12");
      const fee = rateId === "custom" ? parseFloat(C("cn_custom")) : D.rates.find((r) => r.id === rateId)?.monthly;
      const notice = parse(C("cn_notice", todayStr()));
      const suggested = notice ? addDays(notice, 30) : null;
      const last = parse(C("cn_last")) || suggested;
      const out = [];
      if (suggested) out.push(`<p>30 days from the notice: <b>${longDate(suggested)}</b>${C("cn_last") ? "" : " (used as the last day)"}</p>`);
      if (!fee || !last) out.push(`<p class="small muted">Pick the monthly fee to see the prorata.</p>`);
      else {
        const active = last.getDate();
        const dim = new Date(last.getFullYear(), last.getMonth() + 1, 0).getDate();
        const div = S.settings.divisor === "month" ? dim : 30;
        const amt = Math.round((fee / div) * active * 100) / 100;
        const month = MONTHS[last.getMonth()];
        const name = C("cn_member") || "[Member Name]";
        out.push(`<div class="stats"><div class="stat"><b>${active}</b><span>active days in ${month}</span></div><div class="stat"><b>÷ ${div}</b><span>${div === 30 ? "30-day rule" : "days in month"}</span></div><div class="stat"><b>${money(amt)}</b><span>prorated charge</span></div></div>
          <p class="small muted">${money(fee)} ÷ ${div} × ${active} = ${money(amt)}. The divisor is set in Settings ${pendingBadge("CONFIRM #2")}</p>`);
        const head = `Subject: Membership Cancellation Notice

Dear ${name},

We hope this email finds you well.

In accordance with our cancellation policy, all cancellation requests require a 30-day notice period. We hereby acknowledge this email as your official 30-day notice of cancellation. Please see the breakdown of fees for ${month} below.

Prorated Charges:
`;
        const email = C("cn_type", "manual") === "auto"
          ? head + `${month} prorata: (${money(fee)} ÷ ${div} days) × ${active} active days = ${money(amt)}

Payment of ${money(amt)} will be deducted automatically from your account, and your last day of club access will be ${longDate(last)}.

We thank you for being a loyal member of ${club().name}. Should you require any further assistance, please do not hesitate to contact us.` + sig()
          : head + `${month} prorata: (${money(fee)} ÷ ${div} days) × ${active} = ${money(amt)}

Kindly make payment of ${money(amt)} to our VPA below by the end of the month to process your cancellation:
VPA: ${club().vpaFreezeCancel}

Please include "${club().code} Cancellation" in the payment remarks and send us a screenshot as verification of your payment. Should you require any further assistance, please do not hesitate to contact us.` + sig();
        const confirm = `Subject: Membership Cancellation Confirmed

Dear ${name},

Thank you for your prompt payment. We have received and verified your payment successfully.

Your cancellation has been processed, and your final day of club access will be ${longDate(last)} at 11:59PM (2359 hrs).

We would like to thank you for choosing ${club().name} as your fitness provider. It has been our pleasure to be part of your fitness journey, and we wish you all the best in your future endeavours.

Should your circumstances change, we would be delighted to welcome you back in the future.` + sig();
        calcEmails.cn = email; calcEmails.cnc = confirm;
        out.push(`<div class="notice warn">Post the draft in Discord for vetting before sending.</div>
          <pre class="out">${esc(email)}</pre>
          <div class="row"><button class="btn btn-primary" data-act="copy-calc" data-id="cn">Copy notice email</button><button class="btn" data-act="copy-calc" data-id="cnc">Copy confirmation email</button></div>`);
      }
      set("cn-out", out.join(""));
    }

    // Quote
    {
      const plan = D.rates.find((r) => r.id === C("qt_plan", "m12")) || D.rates[2];
      const bundle = D.bundles.find((b) => b.id === C("qt_bundle", "none"));
      const out = [];
      if (bundle && !["m12", "m18"].includes(plan.id)) {
        out.push(`<div class="notice warn">Bundles are listed for 12 and 18 month memberships only. Check the Promotions tab.</div>`);
      } else {
        const monthly = bundle ? Math.round(plan.monthly * (1 - bundle.discount) * 100) / 100 : plan.monthly;
        const enrol = bundle || plan.enrolmentWaived ? 0 : D.fees.enrolment;
        const upfront = enrol + D.fees.accessPass;
        out.push(`<div class="stats"><div class="stat"><b>${money(monthly)}</b><span>per month${bundle ? " per person" : ""}</span></div>
          <div class="stat"><b>${money(upfront)}</b><span>one-time fees${bundle ? " per person" : ""}</span></div></div>
          <p class="small muted">Access Pass ${money(D.fees.accessPass)}${enrol ? ` + Enrolment ${money(enrol)}` : " · Enrolment waived"}. First partial month is prorated ${pendingBadge("CONFIRM #17")}. Check the Promotions tab before quoting.</p>`);
        if (bundle) out.push(`<p class="small">Group of ${bundle.people}: ${money(monthly * bundle.people)} per month in total.</p>`);
      }
      set("qt-out", out.join(""));
    }
  }
  const calcEmails = {};

  // ================= SCRIPTS =================
  // The script library lives in S.scripts so staff can edit it. It's seeded
  // from data.js; built-ins added to data.js later are picked up once.
  const SCRIPT_CATS = ["Enquiries", "Trials", "Members", "Payments", "Promotions", "Other"];
  function seedScripts() {
    if (!Array.isArray(S.scripts)) S.scripts = [];
    if (!S.outletTokens) {
      const swap = [["Anytime Fitness Orchard", "[Outlet]"], ["AF Orchard", "[Outlet Short]"], ["UEN202106218Z (Watchtower Gyms)", "[Late VPA]"], ["UEN202142897EA00#XNAP", "[Freeze VPA]"]];
      S.scripts.forEach((s) => { swap.forEach(([from, to]) => { s.text = s.text.split(from).join(to); }); });
      S.outletTokens = 1;
    }
    S.scriptSeed = S.scriptSeed || [];
    D.scripts.forEach((b) => {
      if (S.scriptSeed.includes(b.key)) return;
      S.scriptSeed.push(b.key);
      if (!findScript(b.key)) S.scripts.push(builtinCopy(b));
    });
  }
  const builtinCopy = (b) => ({ id: uid(), builtin: b.key, key: b.key, cat: b.cat || "Other", type: b.type || "standard", start: "", end: "", when: b.when || "", text: b.text, pending: b.pending || "", draft: !!b.draft });
  function findScript(key) { return S.scripts.find((s) => s.key.toLowerCase() === String(key).toLowerCase()); }

  function scriptStatus(s) {
    const today = todayStr();
    if (s.type !== "promo") return { id: "active", label: "" };
    if (s.start && today < s.start) return { id: "upcoming", label: `starts ${shortDate(parse(s.start))}` };
    if (s.end && today > s.end) return { id: "expired", label: `ended ${shortDate(parse(s.end))}` };
    if (!s.end) return { id: "active", label: "no end date set", warn: true };
    const left = dayDiff(parse(today), parse(s.end));
    return { id: "active", label: left === 0 ? "ends today" : `ends ${shortDate(parse(s.end))} · ${left}d left`, warn: left <= 7 };
  }

  function renderScripts() {
    const f = S.ui.scFilter || "active";
    const count = (fn) => S.scripts.filter(fn).length;
    const segBtn = (id, label, n) => `<button data-act="sc-filter" data-id="${id}" aria-pressed="${f === id}">${label} (${n})</button>`;
    return `
      <div class="page-head"><div><h1>Scripts</h1>
        <p>WhatsApp messages with your name filled in. Standard scripts run all year. Promotion scripts have dates and disappear once they end.</p></div>
        <button class="btn btn-primary" data-act="sc-new">+ New script</button></div>
      <div class="grid">
        ${S.ui.scDraft ? renderScriptEditor() : ""}
        <section class="card">
          <div class="seg" role="group" aria-label="Show">
            ${segBtn("active", "In use", count((s) => scriptStatus(s).id === "active"))}
            ${segBtn("standard", "Standard", count((s) => s.type !== "promo"))}
            ${segBtn("promo", "Promotions", count((s) => s.type === "promo" && scriptStatus(s).id !== "expired"))}
            ${segBtn("expired", "Expired", count((s) => scriptStatus(s).id === "expired"))}
          </div>
          <div class="fields" style-top>
            <label class="field">Search<input type="text" id="sc-q" placeholder="e.g. price, trial, card" value="${esc(S.ui.scQ || "")}"></label>
            <label class="field">Their first name (for [NAME])<input type="text" id="sc-name" value="${esc(S.ui.scName || "")}" autocomplete="off"></label>
          </div>
          ${S.settings.name ? "" : `<div class="notice warn" style-top>Add your name in Settings so it's filled into every script.</div>`}
          <div id="sc-list" style-top></div>
        </section>
        ${renderSequences()}
        <section class="card stack"><h2>Share and sync</h2>
          <p class="small muted">Update the promotions on one computer, export them, then import the file on the other front-desk computers. "Copy all in use" gives you every live script in one go, for updating WhatsApp Business quick replies.</p>
          <div class="row"><button class="btn" data-act="sc-export">Export scripts</button>
            <label class="btn" for="sc-file">Import scripts</label><input type="file" id="sc-file" accept=".json,application/json" hidden>
            <button class="btn" data-act="sc-copy-all">Copy all in use</button></div>
        </section>
      </div>`;
  }

  // Which follow-up steps send this script, e.g. "Didn't sign · step 2".
  function scriptUses(key) {
    const k = String(key).toLowerCase();
    const out = [];
    journeys().forEach((j) => j.steps.forEach((s, i) => { if (s.script && s.script.toLowerCase() === k) out.push(`${j.label} · step ${i + 1}`); }));
    return out;
  }
  // Edits go to a copy of the sequences saved in S.journeys.
  function editableJourneys() {
    if (!S.journeys) S.journeys = JSON.parse(JSON.stringify(D.journeys));
    return S.journeys;
  }
  function renderSequences() {
    const list = journeys();
    const j = list.find((x) => x.id === S.ui.seqId) || list.find((x) => x.id === "nosign") || list[0];
    const opts = (cur) => `<option value="">No message</option>${S.scripts.map((s) => `<option value="${esc(s.key)}" ${cur && cur.toLowerCase() === s.key.toLowerCase() ? "selected" : ""}>${esc(s.key)}${scriptStatus(s).id === "expired" ? " (expired)" : ""}</option>`).join("")}${cur && !findScript(cur) ? `<option selected value="${esc(cur)}">${esc(cur)} (missing)</option>` : ""}`;
    const rows = j.steps.map((s, i) => s.outcome
      ? `<li class="seq-step fixed"><span class="seq-n">${i + 1}</span><div><b>${esc(s.action)}</b><p class="small muted">Day ${s.d} · fixed step: check-in and trial outcome</p></div></li>`
      : `<li class="seq-step"><span class="seq-n">${i + 1}</span>
          <div class="seq-fields">
            <label class="field">Step name<input type="text" data-seq="action" data-i="${i}" value="${esc(s.action)}"></label>
            <label class="field">Days after ${esc(j.anchor.toLowerCase())}<input type="number" data-seq="d" data-i="${i}" value="${s.d}" min="-30" max="365"></label>
            <label class="field">Script<select data-seq="script" data-i="${i}">${opts(s.script)}</select></label>
          </div>
          <div class="row tight seq-acts">
            <button class="btn btn-sm btn-ghost" data-act="seq-up" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
            <button class="btn btn-sm btn-ghost" data-act="seq-down" data-i="${i}" ${i === j.steps.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
            <button class="btn btn-sm btn-ghost btn-danger" data-act="seq-del" data-i="${i}" aria-label="Remove step">✕</button>
          </div></li>`).join("");
    return `<section class="card stack" id="seq-card">
      <div class="card-head"><h2>Follow-up steps</h2>${S.journeys ? '<button class="btn btn-sm btn-ghost" data-act="seq-reset">Reset all to default</button>' : ""}</div>
      <p class="small muted">Choose what each step is called, when it's due and which script it uses. Prospects move through the steps in this order on the Prospect &amp; Trial page.</p>
      <div class="seg" role="group" aria-label="Sequence">${list.map((x) => `<button data-act="seq-pick" data-id="${x.id}" aria-pressed="${x.id === j.id}">${esc(x.label)}</button>`).join("")}</div>
      <ol class="seq-list">${rows}</ol>
      <div class="row"><button class="btn btn-sm" data-act="seq-add">+ Add step</button><span class="small muted">Steps are due in day order. Moving a step up or down changes its number.</span></div>
    </section>`;
  }

  function renderScriptEditor() {
    const d = S.ui.scDraft;
    const orig = d.id && S.scripts.find((s) => s.id === d.id);
    return `<section class="card stack" id="sc-editor">
      <div class="card-head"><h2>${orig ? "Edit " + esc(orig.key) : "New script"}</h2>${orig?.builtin ? '<span class="badge">from handbook</span>' : ""}</div>
      <div class="fields">
        <label class="field">Shortcut<input type="text" data-sd="key" value="${esc(d.key)}" placeholder="/OctPromo"></label>
        <label class="field">Category<select data-sd="cat">${SCRIPT_CATS.map((c) => `<option ${d.cat === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
        <label class="field">Runs<select data-sd="type" data-act-change="sd-type"><option value="standard" ${d.type !== "promo" ? "selected" : ""}>All year (standard)</option><option value="promo" ${d.type === "promo" ? "selected" : ""}>For a period (promotion)</option></select></label>
        ${d.type === "promo" ? `<label class="field">Starts<input type="date" data-sd="start" value="${esc(d.start)}"></label>
        <label class="field">Ends<input type="date" data-sd="end" value="${esc(d.end)}"></label>` : ""}
      </div>
      <label class="field">When to use it<input type="text" data-sd="when" value="${esc(d.when)}" placeholder="e.g. Anyone asking about October's promotion"></label>
      <label class="field">Message<textarea data-sd="text" rows="9">${esc(d.text)}</textarea></label>
      <p class="small muted">Placeholders: <code>[Your Name]</code> <code>[NAME]</code> (their first name) <code>[Outlet]</code> <code>[Outlet Short]</code> <code>[Outlet Code]</code> <code>[Outlet Phone]</code> <code>[Freeze VPA]</code> <code>[Late VPA]</code> (from Settings → Outlet) <code>[Month]</code> <code>[Amount]</code> (Payments tab only).</p>
      <div class="row"><button class="btn btn-primary" data-act="sd-save">Save</button><button class="btn" data-act="sd-cancel">Cancel</button>
        <span class="small overdue" id="sd-msg"></span><span class="spacer"></span>
        ${orig?.builtin ? `<button class="btn btn-ghost" data-act="sd-restore">Restore handbook wording</button>` : ""}
        ${orig ? `<button class="btn btn-ghost btn-danger" data-act="sd-delete">Delete</button>` : ""}</div>
    </section>`;
  }

  function updateScripts() {
    const el = document.getElementById("sc-list");
    if (!el) return;
    const f = S.ui.scFilter || "active";
    const q = (S.ui.scQ || "").toLowerCase();
    const list = S.scripts.filter((s) => {
      const st = scriptStatus(s).id;
      if (f === "active" && st !== "active") return false;
      if (f === "standard" && s.type === "promo") return false;
      if (f === "promo" && (s.type !== "promo" || st === "expired")) return false;
      if (f === "expired" && st !== "expired") return false;
      return !q || (s.key + s.when + s.text + s.cat).toLowerCase().includes(q);
    });
    const groups = SCRIPT_CATS.map((c) => [c, list.filter((s) => (SCRIPT_CATS.includes(s.cat) ? s.cat : "Other") === c)]).filter(([, l]) => l.length);
    el.innerHTML = groups.length ? groups.map(([c, l]) => `<div class="stage"><h3>${esc(c)}</h3>${l.map((s) => {
      const st = scriptStatus(s);
      return `<div class="script">
        <div class="row"><code>${esc(s.key)}</code>
          ${s.type === "promo" ? `<span class="badge ${st.id === "expired" ? "bad" : st.warn ? "pending" : "ok"}">${st.id === "upcoming" ? "upcoming · " : "promo · "}${esc(st.label)}</span>` : ""}
          ${s.draft ? '<span class="badge pending" title="New wording, not in the handbook yet">draft</span>' : ""}${pendingBadge(s.pending)}
          <span class="spacer"></span>
          <button class="btn btn-sm btn-ghost" data-act="sc-edit" data-id="${s.id}">Edit</button>
          <button class="btn btn-sm btn-primary" data-act="copy-script" data-id="${s.id}">Copy</button></div>
        <p class="small muted">${esc(s.when)}</p>
        ${scriptUses(s.key).length ? `<div class="chips">${scriptUses(s.key).map((u) => `<span class="chip chip-row">${esc(u)}</span>`).join("")}</div>` : ""}
        <details><summary>Preview</summary><pre class="out">${esc(fill(s.text, { name: S.ui.scName }))}</pre></details>
      </div>`;
    }).join("")}</div>`).join("") : `<div class="empty">${q ? `No script matches "${esc(q)}".` : "Nothing here."}</div>`;
  }

  function saveScriptDraft() {
    const d = S.ui.scDraft;
    const msg = document.getElementById("sd-msg");
    d.key = d.key.trim();
    if (!/^\/\S+$/.test(d.key)) { msg.textContent = "Shortcut must start with / and have no spaces, e.g. /OctPromo"; return; }
    const clash = S.scripts.find((s) => s.key.toLowerCase() === d.key.toLowerCase() && s.id !== d.id);
    if (clash) { msg.textContent = `${d.key} already exists.`; return; }
    if (!d.text.trim()) { msg.textContent = "The message is empty."; return; }
    if (d.type === "promo" && d.start && d.end && d.end < d.start) { msg.textContent = "The end date is before the start date."; return; }
    if (d.type !== "promo") { d.start = ""; d.end = ""; }
    const existing = S.scripts.find((s) => s.id === d.id);
    if (existing && existing.key !== d.key && scriptUses(existing.key).length) {
      editableJourneys().forEach((j) => j.steps.forEach((s) => { if (s.script && s.script.toLowerCase() === existing.key.toLowerCase()) s.script = d.key; }));
    }
    if (existing) Object.assign(existing, d, { draft: false });
    else S.scripts.push({ ...d, id: uid(), pending: "", draft: false });
    S.ui.scDraft = null; save(); render(); toast(`${d.key} saved`);
  }

  // ================= ONBOARDING =================
  const allOb = () => D.onboarding.flatMap((s) => s.items);
  const obDone = (t) => allOb().filter((i) => ["done", "passed"].includes(t.items[i.id]?.status)).length;

  function renderOnboarding() {
    const t = S.trainees.find((x) => x.id === S.activeTrainee) || S.trainees[0];
    const total = allOb().length;
    const list = S.trainees.map((x) => `<button class="btn btn-sm" data-act="ob-pick" data-id="${x.id}" aria-pressed="${t && x.id === t.id}">${esc(x.name)} · ${obDone(x)}/${total}</button>`).join("");
    let body = `<div class="empty">Add a new staff member to start tracking their first two weeks.</div>`;
    if (t) {
      const stages = D.onboarding.map((s) => `
        <div class="stage"><h3>${esc(s.stage)}</h3>
          ${s.items.map((i) => {
            const st = t.items[i.id]?.status || "";
            const opts = i.test ? [["", "Not yet"], ["practising", "Practising"], ["passed", "Passed"]] : [["", "Not yet"], ["shown", "Shown"], ["done", "Can do it"]];
            return `<div class="ob-item">
              <div><span>${esc(i.text)}</span> ${i.test ? '<span class="badge">test</span>' : ""} ${i.owner ? `<span class="badge">${esc(i.owner)}</span>` : ""}
                ${t.items[i.id]?.date ? `<span class="small muted">· ${esc(shortDate(parse(t.items[i.id].date)))}</span>` : ""}</div>
              <select data-ob="${i.id}" aria-label="Status">${opts.map(([v, l]) => `<option value="${v}" ${st === v ? "selected" : ""}>${l}</option>`).join("")}</select>
              ${i.ask ? `<div class="ask">Study it in NotebookLM: "${esc(i.ask)}" <button class="btn btn-sm btn-ghost" data-act="copy-ask" data-q="${esc(i.ask)}">Copy question</button></div>` : ""}
            </div>`;
          }).join("")}
        </div>`).join("");
      const dayN = dayDiff(parse(t.start), parse(todayStr())) + 1;
      body = `
        <div class="card-head"><div><h2>${esc(t.name)}</h2><p class="small muted">Started ${esc(longDate(parse(t.start)))} · day ${dayN} of probation (14)</p></div>
          <div class="row"><button class="btn btn-sm" data-act="ob-copy">Copy progress</button><button class="btn btn-sm btn-ghost btn-danger" data-act="ob-del" data-id="${t.id}">Remove</button></div></div>
        <div class="stats"><div class="stat"><b>${obDone(t)}/${total}</b><span>milestones done</span></div></div>
        <progress max="${total}" value="${obDone(t)}" aria-label="Onboarding progress"></progress>
        ${stages}`;
    }
    return `
      <div class="page-head"><div><h1>Onboarding</h1>
        <p>The 2-week plan from the onboarding doc, with a NotebookLM question for each topic so new staff can self-study between shifts.</p></div></div>
      <div class="grid">
        <section class="card"><h2>New staff</h2>
          <div class="row">${list}</div>
          <div class="fields" style-top>
            <label class="field">First name<input type="text" id="ob-name" autocomplete="off"></label>
            <label class="field">First shift<input type="date" id="ob-start" value="${todayStr()}"></label>
          </div>
          <div class="row" style-top><button class="btn btn-primary" data-act="ob-add">Add</button></div>
        </section>
        <section class="card">${body}</section>
      </div>`;
  }

  // ================= ASK & REDACT =================
  function renderAsk() {
    const hb = S.handbook;
    return `
      <div class="page-head"><div><h1>Ask &amp; Redact</h1>
        <p>Strip personal details before asking any cloud AI, or ask a private AI that runs on this computer.</p></div></div>
      <div class="grid grid-2">
        <section class="card stack">
          <h2>1 · Redact before asking NotebookLM, ChatGPT or Claude</h2>
          <p class="small muted">Paste a member's message or your question. Card numbers, NRIC, phone numbers, emails, dates, postal codes and unit numbers are replaced with placeholders. Names can't be spotted automatically, so list them below.</p>
          <label class="field">Text<textarea id="rd-in" placeholder="Paste here">${esc(S.calc.rd_in || "")}</textarea></label>
          <label class="field">Names to hide (comma separated)<input type="text" id="rd-names" value="${esc(S.calc.rd_names || "")}" autocomplete="off"></label>
          <div id="rd-out"></div>
        </section>
        <section class="card stack">
          <div class="card-head"><h2>2 · Private AI (runs on this computer)</h2><span class="badge" id="ai-status">checking…</span></div>
          <div class="row" id="ai-fix"></div>
          <p class="small muted">Uses <b>Ollama</b>, a free app that runs an AI model on this computer with no internet connection needed. See the README for the one-time setup.</p>
          <div class="row"><label class="btn btn-sm" for="hb-file">Load handbook (.txt or .md)</label><input type="file" id="hb-file" accept=".txt,.md,text/plain" hidden>
            <span class="small muted">${hb ? `Handbook loaded · ${Math.round(hb.length / 1000)}k characters` : "No handbook loaded: answers use only the rates, scripts and checklists built into this hub."}</span>
            ${hb ? '<button class="btn btn-sm btn-ghost" data-act="hb-clear">Remove</button>' : ""}</div>
          <label class="field">Question<textarea id="ai-q" placeholder="e.g. A member wants to freeze from 1 November. What do I do?">${esc(S.calc.ai_q || "")}</textarea></label>
          <div class="row"><button class="btn btn-primary" data-act="ai-ask">Ask</button><span class="small muted">Always check fees and dates against the handbook.</span></div>
          <div id="ai-out"></div>
        </section>
      </div>`;
  }
  function updateRedact() {
    const el = document.getElementById("rd-out");
    if (!el) return;
    const text = S.calc.rd_in || "";
    if (!text.trim()) { el.innerHTML = ""; return; }
    const { out, found } = redact(text, (S.calc.rd_names || "").split(","));
    const keys = Object.keys(found);
    el.innerHTML = `${keys.length ? `<div class="notice ok">Removed: ${keys.map((k) => `${found[k]} × ${esc(k)}`).join(", ")}</div>` : `<div class="notice">Nothing detected. Double-check for names and addresses.</div>`}
      <pre class="out" style-top>${esc(out)}</pre>
      <div class="row" style-top><button class="btn btn-primary" data-act="copy-redacted">Copy safe version</button></div>`;
    updateRedact.last = out;
  }

  // The exact name of the installed model to use, e.g. "gpt-oss:20b" when
  // Settings says "gpt-oss". Found when the Ask tab checks Ollama.
  let aiModel = "";
  async function checkAI() {
    const el = document.getElementById("ai-status");
    if (!el) return;
    const fix = document.getElementById("ai-fix");
    if (fix) fix.innerHTML = "";
    try {
      const r = await fetch(S.settings.ollamaUrl.replace(/\/$/, "") + "/api/tags");
      const j = await r.json();
      const names = (j.models || []).map((m) => m.name);
      const want = (S.settings.model || "").trim();
      aiModel = names.find((n) => n === want) || names.find((n) => n === want + ":latest") || names.find((n) => n.split(":")[0] === want.split(":")[0]) || "";
      if (aiModel) { el.textContent = `ready · ${aiModel}`; el.className = "badge ok"; return; }
      el.textContent = names.length ? `model ${want} not installed` : "no models installed";
      el.className = "badge pending";
      if (fix && names.length) fix.innerHTML = `<span class="small muted">You have:</span> ${names.map((n) => `<button class="btn btn-sm" data-act="ai-use" data-id="${esc(n)}">Use ${esc(n)}</button>`).join(" ")}`;
      else if (fix) fix.innerHTML = `<span class="small muted">In Command Prompt run <code>ollama pull ${esc(want || "llama3.1:8b")}</code>, then come back to this tab.</span>`;
    } catch {
      aiModel = "";
      el.textContent = "not running";
      el.className = "badge bad";
    }
  }

  function knowledge() {
    const k = [];
    const c = club();
    k.push(`Club: ${c.name} (${c.code}), ${c.address}. Phone ${c.phone}. Email ${c.email}. VPA for freezes and cancellations: ${c.vpaFreezeCancel}. VPA for late payments: ${c.vpaLatePayment}.`);
    k.push("Membership rates: " + D.rates.map((r) => `${r.label} $${r.monthly}/month${r.enrolmentWaived ? " (enrolment fee waived)" : ""}`).join("; ") + ".");
    k.push(`Fees: enrolment $${D.fees.enrolment}, access pass $${D.fees.accessPass}, freeze $${D.fees.freezePerWeek}/week, late payment $${D.fees.latePayment}. 30 days notice for freezes and cancellations.`);
    k.push("Bundles: " + D.bundles.map((b) => `${b.label} ${b.discount * 100}% off 12 or 18 month rate, enrolment waived, access pass still applies`).join("; ") + ".");
    k.push("Shift checklists:\n" + D.shifts.map((s) => `${s.label}: ` + s.items.map((i) => i.text + (i.due ? ` (by ${i.due})` : "")).join("; ")).join("\n"));
    k.push("Cleanliness standard: " + D.cleanStandard.join("; ") + ".");
    k.push("Follow-up journeys (day counted from the anchor date):\n" + journeys().map((j) => `${j.label} (from ${j.anchor}): ` + j.steps.map((s) => `day ${s.d}: ${s.action}${s.script ? " (" + s.script + ")" : ""}`).join("; ")).join("\n"));
    k.push(`Monthly dues: payments are collected on the ${D.dues.collectDay}st at 00:00. Unpaid (yellow) members are chased until the ${D.dues.deadlineDay}th at 00:00. EZpay makes a second deduction at 00:00 on the ${D.dues.deadlineDay}th; if that fails a $${D.fees.latePayment} late fee is added.`);
    k.push("WhatsApp scripts in use today:\n" + S.scripts.filter((s) => scriptStatus(s).id === "active").map((s) => `${s.key} (${s.cat}${s.type === "promo" && s.end ? ", promotion until " + s.end : ""}) — ${s.when}\n${fill(s.text)}`).join("\n\n"));
    return k.join("\n\n");
  }

  async function askAI() {
    const out = document.getElementById("ai-out");
    const q = (S.calc.ai_q || "").trim();
    if (!q) return;
    if (hasPII(q)) {
      out.innerHTML = `<div class="notice bad">This question looks like it contains personal details (${Object.keys(redact(q).found).join(", ")}). The handbook says never to enter member data into any AI tool. Describe the situation with placeholders like "Member A".</div>
        <div class="row" style-top><button class="btn" data-act="ai-redact">Replace them for me</button></div>`;
      return;
    }
    out.innerHTML = `<p class="muted">Thinking… (the first answer can take a minute while the model loads${/^gpt-oss/i.test(aiModel || S.settings.model) ? "; gpt-oss is a large model, so give it a little longer" : ""})</p>`;
    const system = `You are the ${club().code} Shift Hub assistant for front desk staff at ${club().name} in Singapore.
Answer ONLY from the reference material below. If the answer is not in it, say "The handbook doesn't cover this. Ask the escalation contact." Never invent prices, fees, dates, promotions or policies.
Where the material says [CONFIRM #n], tell the staff member that the rule is still being confirmed by the manager.
Be brief and practical. Use numbered steps for procedures. Refer to members as "the member", never ask for personal details.

=== HUB REFERENCE ===
${knowledge()}
${S.handbook ? "\n=== STAFF HANDBOOK ===\n" + S.handbook.slice(0, 60000) : ""}`;
    try {
      const r = await fetch(S.settings.ollamaUrl.replace(/\/$/, "") + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign(
          { model: aiModel || S.settings.model, stream: false, options: { temperature: 0.2, num_ctx: 16384 }, messages: [{ role: "system", content: system }, { role: "user", content: q }] },
          // gpt-oss reasons before it answers; keep that short so replies come back faster.
          /^gpt-oss/i.test(aiModel || S.settings.model) ? { think: "low" } : {})),
      });
      if (!r.ok) throw new Error((await r.text()) || r.status);
      const j = await r.json();
      const answer = (j.message && j.message.content || "").trim();
      out.innerHTML = answer ? `<pre class="out">${esc(answer)}</pre>`
        : `<div class="notice warn">The model didn't give an answer this time. Try asking again, or more simply.</div>`;
    } catch (e) {
      out.innerHTML = `<div class="notice bad">Couldn't reach the local AI at ${esc(S.settings.ollamaUrl)}. Is Ollama running, and was it started with this page allowed? See the README. <br><span class="small">${esc(e.message || e)}</span></div>`;
    }
  }

  // ================= SETTINGS =================
  function renderSettings() {
    const s = S.settings;
    const sel = (k, opts) => `<select data-s="${k}">${opts.map(([v, l]) => `<option value="${v}" ${s[k] === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    return `
      <div class="page-head"><div><h1>Settings</h1><p>Saved in this browser only.</p></div></div>
      <div class="grid grid-2">
        <section class="card stack"><h2>You</h2>
          <label class="field">Your name (used in scripts)<input type="text" data-s="name" value="${esc(s.name)}"></label>
          <label class="field">Job title<input type="text" data-s="title" value="${esc(s.title)}"></label>
        </section>
        <section class="card stack"><h2>Outlet</h2>
          <p class="small muted">Scripts, emails, the EOD report and the app's title use these, so each outlet sets its own.</p>
          ${OUTLET_FIELDS.map(([k, label]) => `<label class="field">${label}<input type="text" data-outlet="${k}" value="${esc(club()[k] || "")}"></label>`).join("")}
          <p class="small muted">Already-edited scripts that name another outlet need editing by hand.</p>
        </section>
        <section class="card stack"><h2>Rules still being confirmed</h2>
          <label class="field">Freeze: partial weeks ${pendingBadge("CONFIRM #4")}${sel("partialWeeks", [["up", "Round up (10 days = 2 weeks)"], ["down", "Round down (10 days = 1 week)"]])}</label>
          <label class="field">Cancellation: prorata divisor ${pendingBadge("CONFIRM #2")}${sel("divisor", [["30", "Always 30 days"], ["month", "Days in that month"]])}</label>
        </section>
        <section class="card stack"><h2>Private AI</h2>
          <label class="field">Ollama address${sel("ollamaUrl", [["http://localhost:11434", "http://localhost:11434"], ["http://127.0.0.1:11434", "http://127.0.0.1:11434"]])}</label>
          <label class="field">Model name<input type="text" data-s="model" value="${esc(s.model)}"></label>
        </section>
        <section class="card stack"><h2>Backup</h2>
          <p class="small muted">Everything lives in this browser. Export a backup file now and then, and before clearing browser data.</p>
          <div class="row"><button class="btn" data-act="export">Export backup</button>
            <label class="btn" for="imp-file">Import backup</label><input type="file" id="imp-file" accept=".json,application/json" hidden></div>
          <div class="row"><button class="btn btn-danger" data-act="prune">Delete old data (checklists over 30 days, payment lists over 2 months)</button>
            <button class="btn btn-danger" data-act="wipe">Erase everything</button></div>
        </section>
      </div>`;
  }

  // ================= events =================
  main.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    const d = day();
    switch (act) {
      case "tick":
        if (b.checked) d.done[id] = hhmm(new Date()); else delete d.done[id];
        save(); render(); break;
      case "shift": d.shift = id; save(); render(); break;
      case "reset-day": if (confirm("Clear today's ticks and notes?")) { S.days[todayStr()] = null; delete S.days[todayStr()]; day(); save(); render(); } break;
      case "copy-handover": case "handover-copy-alt": copy(handoverText(), "Handover copied"); break;
      case "eod-copy": copy(eodText(), "EOD report copied. Paste it into Discord"); break;
      case "eod-inc": case "eod-dec": {
        const e = eodDay(); const n = Math.max(0, (Number(e.f[id]) || 0) + (act === "eod-inc" ? 1 : -1));
        e.f[id] = String(n); save();
        const el = document.querySelector(`[data-eod="${id}"]`); if (el) el.value = n;
        updateEodPreview(); break;
      }
      case "eod-reset": { delete eodDay().f[id]; save(); render(); break; }
      case "prev-toggle": S.ui.prevHidden = Object.assign({}, S.ui.prevHidden, { [id]: !prevHidden(id) }); save(); render(); break;
      case "dues-row": { const m = duesList().find((x) => x.id === id); copy(duesCells(m).join("\t"), `${m.name}'s row copied`); break; }
      case "dues-rows": copy(duesList().map((m) => duesCells(m).join("\t")).join("\n"), "All rows copied"); break;

      case "fu-filter": S.ui.fuFilter = id; save(); render(); break;
      case "fq-clear": S.ui.fq = { sort: (S.ui.fq || {}).sort }; save(); render(); break;
      case "lead-new": S.ui.leadDraft = newLeadDraft(); save(); render(); document.querySelector('[data-ld="name"]')?.focus(); break;
      case "ld-type": { const keep = S.ui.leadDraft; S.ui.leadDraft = Object.assign(newLeadDraft(id), { name: keep.name, phone: keep.phone, remarks: keep.remarks, scheduler: keep.scheduler || S.settings.name, sheetRow: keep.sheetRow }); save(); render(); break; }
      case "ld-save": saveLead(); break;
      case "ld-tag": {
        const d = S.ui.leadDraft; d.remarks = toggleTag(d.remarks, b.dataset.tag); save();
        b.setAttribute("aria-pressed", hasTag(d.remarks, b.dataset.tag));
        document.querySelector('[data-ld="remarks"]').value = d.remarks; updateLeadPreview(); break;
      }
      case "lead-tag": {
        const l = S.leads.find((x) => x.id === id); l.remarks = toggleTag(l.remarks, b.dataset.tag); touch(l); save();
        b.setAttribute("aria-pressed", hasTag(l.remarks, b.dataset.tag));
        const ta = document.querySelector(`[data-remarks="${id}"]`); if (ta) ta.value = l.remarks; break;
      }
      case "ld-cancel": S.ui.leadDraft = null; save(); render(); break;
      case "lead-edit": { const l = S.leads.find((x) => x.id === id); S.ui.leadDraft = { id: l.id, type: l.type, name: l.name, phone: l.phone, enquiryDate: l.enquiryDate, channel: l.channel || "", scheduleAppt: l.scheduleAppt || "TBC", trialDate: l.trialDate || "", trialTime: l.trialTime || "", scheduler: l.scheduler || "", followedUp: l.followedUp || "", cat: l.cat || "WARM", remarks: l.remarks || "", sheetRow: l.sheetRow ? String(l.sheetRow) : "", sheetRaw: l.sheetRaw }; save(); render(); window.scrollTo(0, 0); break; }
      case "lead-step": { const l = S.leads.find((x) => x.id === id); const n = leadNext(l); if (n) { l.history.push({ d: todayStr(), t: n.action }); l.step++; l.followedUp = todayStr(); touch(l); } save(); render(); break; }
      case "lead-copy": {
        const l = S.leads.find((x) => x.id === id); const n = leadNext(l); const sc = findScript(n.script);
        if (!sc) { toast(`${n.script} isn't in your scripts any more`); break; }
        if (scriptStatus(sc).id === "expired" && !confirm(`${sc.key} has expired. Copy it anyway?`)) break;
        copy(fill(sc.text, { name: /^[A-Z]{1,4}$/.test(l.name) ? "" : l.name.split(" ")[0] }), `${sc.key} copied for ${l.name}`); break;
      }
      case "lead-cat": { const l = S.leads.find((x) => x.id === id); const order = ["HOT", "WARM", "COLD"]; l.cat = order[(order.indexOf(l.cat || "WARM") + 1) % 3]; save(); render(); break; }
      case "lead-checkin": { const l = S.leads.find((x) => x.id === id); checkIn(l); save(); render(); toast(`${l.name} checked in`); break; }
      case "lead-checkout": { const l = S.leads.find((x) => x.id === id); checkOut(l); save(); render(); toast(`${l.name} checked out`); break; }
      case "lead-trial": { const l = S.leads.find((x) => x.id === id); recordTrial(l, b.dataset.o); save(); render(); break; }
      case "lead-book": {
        const l = S.leads.find((x) => x.id === id);
        const v = prompt("Trial date and time (e.g. 14/10 3pm, or 2026-10-14 15:00)", `${dm(ymd(addDays(new Date(), 1)))} `);
        if (v === null) break;
        const parts = v.trim().split(/\s+/);
        const d2 = parseDateInput(parts[0]);
        if (!d2) { toast("Couldn't read that date"); break; }
        const t2 = parseTimeInput(parts.slice(1).join(" "));
        l.trialDate = d2; if (t2) l.trialTime = t2; l.checkIn = null; l.checkOut = null; l.scheduleAppt = "Yes";
        startJourney(l, "trial", d2, "Booked a trial"); touch(l); save(); render(); break;
      }
      case "lead-signed": { const l = S.leads.find((x) => x.id === id); l.signedDate = todayStr(); if (l.stage === "nosign" || l.stage === "friends") { l.trialOutcome = "signed"; l.outcomeDate = todayStr(); } addRemark(l, "Signed"); startJourney(l, "member", todayStr(), "Signed up"); save(); render(); toast(`${l.name} moved to new members`); break; }
      case "lead-close": { const l = S.leads.find((x) => x.id === id); l.closed = true; l.outcome = journey(l.stage).kind === "member" ? "Done" : "Closed, not signing"; save(); render(); break; }
      case "lead-del": if (confirm("Delete this person from the hub? If they have a row number, that row will be copied back blank.")) { S.leads = S.leads.filter((x) => x.id !== id); save(); render(); } break;
      case "lead-clear": if (confirm("Delete everyone in the finished list?")) { S.leads = S.leads.filter((l) => leadNext(l)); save(); render(); } break;
      case "lead-row": {
        const l = S.leads.find((x) => x.id === id);
        copy(sheetRow(l), l.sheetRow ? `Row copied. In Excel, click the Name cell in row ${l.sheetRow} and paste` : "Row copied. Click the Name cell of an empty row and paste");
        l.loggedAt = Date.now(); save(); render(); break;
      }
      case "lead-rows": {
        // New entries without a row number get the next free rows first.
        S.leads.filter((l) => !l.sheetRow && sheetState(l) !== "logged").forEach((l) => { l.sheetRow = nextRow(); });
        const rs = unlogged().map((l) => l.sheetRow);
        const from = Math.min(...rs), to = Math.max(...rs);
        const ex = exportRange(from, to);
        copy(ex.text, `Rows ${from}–${to} copied. In Excel, click the Name cell in row ${from} and paste`);
        ex.leads.forEach((l) => { l.loggedAt = Date.now(); });
        save(); render(); break;
      }
      case "exp-copy": case "exp-all": {
        const rs = rowsInUse();
        let from = act === "exp-all" ? Math.min(...rs) : Number(S.ui.expFrom) || Math.min(...rs);
        let to = act === "exp-all" ? Math.max(...rs) : Number(S.ui.expTo) || Math.max(...rs);
        if (from > to) [from, to] = [to, from];
        if (act === "exp-all") { S.ui.expFrom = from; S.ui.expTo = to; }
        const ex = exportRange(from, to);
        if (ex.gaps.length && !confirm(`${ex.gaps.length > 1 ? `Rows ${gapText(ex.gaps)} aren't` : `Row ${ex.gaps[0]} isn't`} in the hub, so pasting will blank ${ex.gaps.length > 1 ? "them" : "it"} in Excel. Copy anyway?`)) break;
        copy(ex.text, `Rows ${from}–${to} copied. In Excel, click the Name cell in row ${from} and paste`);
        ex.leads.forEach((l) => { l.loggedAt = Date.now(); });
        save(); render(); break;
      }
      case "imp-apply": {
        const { plan } = planImport(S.ui.impText || "", Number(S.ui.impStart) || 1, S.ui.impLayout || "auto");
        const r = applyImport(plan);
        S.ui.impText = ""; S.ui.impStart = ""; S.ui.impStartTouched = false; S.ui.expFrom = ""; S.ui.expTo = "";
        save(); render(); toast(`${r.added} added, ${r.updated} updated from your sheet`); break;
      }
      case "imp-clear": S.ui.impText = ""; S.ui.impStart = ""; S.ui.impStartTouched = false; S.ui.impLayout = "auto"; save(); render(); break;
      case "num-assign": {
        let r = Number(document.getElementById("num-start").value) || nextRow();
        S.leads.filter((l) => !l.sheetRow).sort((x, y) => (x.enquiryDate || x.created || "").localeCompare(y.enquiryDate || y.created || ""))
          .forEach((l) => { while (leadAtRow(r)) r++; l.sheetRow = r++; touch(l); });
        save(); render(); toast("Row numbers given"); break;
      }
      case "copy-due": copy(dueFollowups().map(({ l, n }) => `${l.name} (${l.channel}): ${n.action}`).join("\n") || "No follow-ups due.", "Due list copied"); break;

      case "dues-filter": S.ui.duesFilter = id; save(); render(); break;
      case "dues-wa": case "dues-sent": {
        const m = duesList().find((x) => x.id === id);
        markDues(m, duesPhase().isSecondDay ? "second" : "sent"); save();
        setTimeout(render, act === "dues-wa" ? 300 : 0); break;
      }
      case "dues-copy": { const m = duesList().find((x) => x.id === id); copy(duesMessage(m), `Message for ${m.name.split(" ")[0]} copied`); break; }
      case "dues-skip": { const m = duesList().find((x) => x.id === id); m.skipped = Date.now(); save(); render(); break; }
      case "dues-paid": { const m = duesList().find((x) => x.id === id); markDues(m, "paid"); save(); render(); toast(`${m.name} marked paid`); break; }
      case "dues-del": { const m = duesList().find((x) => x.id === id); if (confirm(`Remove ${m.name} from this month's list?`)) { S.dues[duesMonth()].members = duesList().filter((x) => x.id !== id); save(); render(); } break; }
      case "dues-import": importMembers(document.getElementById("dues-paste").value); break;
      case "dues-clear": if (confirm(`Remove everyone from ${monthName(duesMonth())}'s list?`)) { delete S.dues[duesMonth()]; save(); render(); } break;
      case "dues-summary": copy(duesSummary(), "Summary copied"); break;

      case "copy-calc": copy(calcEmails[id], "Email copied"); break;
      case "copy-script": {
        const sc = S.scripts.find((x) => x.id === id);
        if (scriptStatus(sc).id !== "active" && !confirm(`${sc.key} isn't running right now (${scriptStatus(sc).label}). Copy it anyway?`)) break;
        copy(fill(sc.text, { name: S.ui.scName }), `${sc.key} copied`); break;
      }
      case "sc-filter": S.ui.scFilter = id; save(); render(); break;
      case "seq-pick": S.ui.seqId = id; save(); render(); break;
      case "seq-up": case "seq-down": case "seq-del": case "seq-add": {
        const j = editableJourneys().find((x) => x.id === (S.ui.seqId || "nosign")) || editableJourneys()[0];
        S.ui.seqId = j.id;
        const i = Number(b.dataset.i);
        if (act === "seq-up" && i > 0 && !j.steps[i - 1].outcome) [j.steps[i - 1], j.steps[i]] = [j.steps[i], j.steps[i - 1]];
        if (act === "seq-down" && i < j.steps.length - 1 && !j.steps[i + 1].outcome) [j.steps[i + 1], j.steps[i]] = [j.steps[i], j.steps[i + 1]];
        if (act === "seq-del" && confirm(`Remove step ${i + 1} (${j.steps[i].action})? Anyone on this step moves to the next one.`)) {
          j.steps.splice(i, 1);
          S.leads.forEach((l) => { if (l.stage === j.id && l.step > i) l.step--; }); // keep later steps' people on the same message
        }
        if (act === "seq-add") { const last = j.steps[j.steps.length - 1]; j.steps.push({ d: (last ? last.d : 0) + 7, action: "New step", script: "" }); }
        save(); render(); document.getElementById("seq-card")?.scrollIntoView({ block: "nearest" }); break;
      }
      case "seq-reset": if (confirm("Put every follow-up sequence back to the default steps?")) { S.journeys = null; save(); render(); } break;
      case "sc-new": S.ui.scDraft = { id: null, key: "/", cat: "Promotions", type: "promo", start: todayStr(), end: "", when: "", text: "Hi [NAME]! [Your Name] from [Outlet] here 💜\n" }; save(); render(); break;
      case "sc-edit": { const sc = S.scripts.find((x) => x.id === id); S.ui.scDraft = { id: sc.id, key: sc.key, cat: sc.cat, type: sc.type, start: sc.start || "", end: sc.end || "", when: sc.when, text: sc.text }; save(); render(); break; }
      case "sd-save": saveScriptDraft(); break;
      case "sd-cancel": S.ui.scDraft = null; save(); render(); break;
      case "sd-delete": { const sc = S.scripts.find((x) => x.id === S.ui.scDraft.id); if (confirm(`Delete ${sc.key}?${scriptUses(sc.key).length ? ` It's used in: ${scriptUses(sc.key).join(", ")}. Those steps will have no message.` : ""}`)) {
        if (scriptUses(sc.key).length) editableJourneys().forEach((j) => j.steps.forEach((s) => { if (s.script && s.script.toLowerCase() === sc.key.toLowerCase()) s.script = ""; })); S.scripts = S.scripts.filter((x) => x.id !== sc.id); S.ui.scDraft = null; save(); render(); } break; }
      case "sd-restore": {
        const sc = S.scripts.find((x) => x.id === S.ui.scDraft.id); const b0 = D.scripts.find((x) => x.key === sc.builtin);
        if (b0 && confirm(`Put ${sc.key} back to the handbook wording?`)) { Object.assign(sc, builtinCopy(b0), { id: sc.id }); S.ui.scDraft = null; save(); render(); }
        break;
      }
      case "sc-export": download(`afo-scripts-${todayStr()}.json`, { afoScripts: S.scripts }); break;
      case "sc-copy-all": copy(S.scripts.filter((x) => scriptStatus(x).id === "active").map((x) => `${x.key}\n${fill(x.text)}`).join("\n\n---\n\n"), "All scripts in use copied"); break;

      case "ob-add": {
        const name = document.getElementById("ob-name").value.trim();
        if (!name) return;
        const t = { id: uid(), name, start: document.getElementById("ob-start").value || todayStr(), items: {} };
        S.trainees.push(t); S.activeTrainee = t.id; save(); render(); break;
      }
      case "ob-pick": S.activeTrainee = id; save(); render(); break;
      case "ob-del": if (confirm("Remove this person's onboarding record?")) { S.trainees = S.trainees.filter((x) => x.id !== id); S.activeTrainee = null; save(); render(); } break;
      case "copy-ask": copy(b.dataset.q, "Question copied. Paste it into NotebookLM"); break;
      case "ob-copy": {
        const t = S.trainees.find((x) => x.id === S.activeTrainee) || S.trainees[0];
        const lines = [`Onboarding: ${t.name} (started ${longDate(parse(t.start))}) · ${obDone(t)}/${allOb().length} done`];
        D.onboarding.forEach((s) => {
          const left = s.items.filter((i) => !["done", "passed"].includes(t.items[i.id]?.status));
          if (left.length) lines.push(`${s.stage}: still to do: ${left.map((i) => i.text).join("; ")}`);
        });
        copy(lines.join("\n"), "Progress copied"); break;
      }

      case "copy-redacted": copy(updateRedact.last || "", "Safe version copied"); break;
      case "ai-ask": askAI(); break;
      case "ai-use": S.settings.model = id; save(); checkAI(); toast(`Using ${id}`); break;
      case "ai-redact": { S.calc.ai_q = redact(S.calc.ai_q || "").out; save(); document.getElementById("ai-q").value = S.calc.ai_q; document.getElementById("ai-out").innerHTML = ""; break; }
      case "hb-clear": S.handbook = ""; save(); render(); checkAI(); break;

      case "export": download(`afo-shift-hub-backup-${todayStr()}.json`, S); break;
      case "prune": {
        const cutoff = ymd(addDays(new Date(), -30));
        Object.keys(S.days).forEach((k) => { if (k < cutoff) delete S.days[k]; });
        const mCut = ym(new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1));
        Object.keys(S.dues).forEach((k) => { if (k < mCut) delete S.dues[k]; });
        const eCut = ymd(addDays(new Date(), -60));
        Object.keys(S.eod || {}).forEach((k) => { if (k < eCut) delete S.eod[k]; });
        save(); toast("Old checklists and payment lists deleted"); break;
      }
      case "wipe": if (confirm("Erase all data in the Shift Hub on this computer? Export a backup first if you need it.")) { localStorage.removeItem(KEY); S = defaults(); init(); save(); go("today"); } break;
    }
  });

  function download(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  // Reads a text file chosen by the user. Word and Excel on Windows often save
  // .txt and .csv files as Windows-1252 rather than UTF-8, which garbles names
  // and symbols, so fall back to that when the file isn't valid UTF-8.
  function decodeText(buf) {
    const bytes = new Uint8Array(buf);
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""); }
    catch { return new TextDecoder("windows-1252").decode(bytes); }
  }
  function readFile(input, cb) {
    const f = input.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { cb(decodeText(r.result)); input.value = ""; };
    r.readAsArrayBuffer(f);
  }

  main.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.note !== undefined) { day().notes[t.dataset.note] = t.value; save(); return; }
    if (t.dataset.handover !== undefined) { day().handover = t.value; save(); return; }
    if (t.dataset.eod) {
      const e = eodDay(); e.f[t.dataset.eod] = t.value; save();
      if (t.dataset.auto) { const bd = document.querySelector(`[data-badge="${t.dataset.eod}"]`); if (bd) bd.innerHTML = eodBadge(t.dataset.eod, t.value !== ""); }
      if (["socmed", "walkin", "physical", "others"].includes(t.dataset.eod) && !e.f.tdyEnq) {
        const tot = document.querySelector('[data-eod="tdyEnq"]'); if (tot) tot.value = eodVal("tdyEnq", "auto", e, eodAuto());
      }
      updateEodPreview(); return;
    }
    if (t.dataset.k) { S.calc[t.dataset.k] = t.value; save(); updateCalc(); return; }
    if (t.dataset.s && t.tagName !== "SELECT") { S.settings[t.dataset.s] = t.value; save(); return; }
    if (t.dataset.outlet) { S.settings.outlet = Object.assign({}, S.settings.outlet, { [t.dataset.outlet]: t.value }); save(); applyOutlet(); return; }
    if (t.dataset.sd && t.tagName !== "SELECT") { S.ui.scDraft[t.dataset.sd] = t.value; save(); return; }
    if (t.dataset.seq && t.tagName !== "SELECT") {
      const j = editableJourneys().find((x) => x.id === (S.ui.seqId || "nosign")) || editableJourneys()[0];
      const s = j.steps[Number(t.dataset.i)];
      if (t.dataset.seq === "d") { const n = parseInt(t.value, 10); if (!isNaN(n)) s.d = n; } else s.action = t.value;
      save(); return;
    }
    if (t.dataset.ld !== undefined && t.tagName !== "SELECT") { S.ui.leadDraft[t.dataset.ld] = t.value; save(); updateLeadPreview(); return; }
    if (t.dataset.remarks) { const l = S.leads.find((x) => x.id === t.dataset.remarks); l.remarks = t.value; touch(l); save(); return; }
    if (["imp-text", "imp-start", "exp-from", "exp-to"].includes(t.id)) {
      if (t.id === "imp-text") {
        S.ui.impText = t.value;
        // Copied with the header row? Then the first row is almost always row 1.
        if (!S.ui.impStartTouched) S.ui.impStart = /^\s*name\s*\t/i.test(t.value) ? "1" : "";
      }
      if (t.id === "imp-start") { S.ui.impStart = t.value; S.ui.impStartTouched = true; }
      if (t.id === "exp-from") S.ui.expFrom = t.value;
      if (t.id === "exp-to") S.ui.expTo = t.value;
      save(); rerenderSync(t.id); return;
    }
    if (t.id === "next-row") { S.settings.nextSheetRow = t.value; save(); return; }
    if (t.id === "fu-q") {
      S.ui.fuQ = t.value; save();
      const pos = t.selectionStart; render();
      const el = document.getElementById("fu-q"); el.focus(); el.setSelectionRange(pos, pos); return;
    }
    if (t.dataset.duesNote) { duesList().find((x) => x.id === t.dataset.duesNote).note = t.value; save(); return; }
    if (t.id === "sc-q" || t.id === "sc-name") { S.ui[t.id === "sc-q" ? "scQ" : "scName"] = t.value; save(); updateScripts(); return; }
    if (t.id === "dues-q") {
      S.ui.duesQ = t.value; save();
      const pos = t.selectionStart; render();
      const el = document.getElementById("dues-q"); el.focus(); el.setSelectionRange(pos, pos); return;
    }
    const map = { "rd-in": "rd_in", "rd-names": "rd_names", "ai-q": "ai_q" };
    if (map[t.id]) { S.calc[map[t.id]] = t.value; save(); if (t.id.startsWith("rd-")) updateRedact(); }
  });

  // Re-draw just the sync panel, keeping the cursor where it was.
  function rerenderSync(focusId) {
    const el = main.querySelector("[data-sync]");
    if (!el) return;
    const f = document.getElementById(focusId);
    const pos = f && f.selectionStart != null && f.type !== "number" ? [f.selectionStart, f.selectionEnd] : null;
    const box = document.createElement("div");
    box.innerHTML = renderSync();
    el.replaceWith(box.firstElementChild);
    const g = document.getElementById(focusId);
    if (g) { g.focus(); if (pos) g.setSelectionRange(pos[0], pos[1]); }
  }
  main.addEventListener("toggle", (e) => { if (e.target.matches && e.target.matches("[data-sync]")) { S.ui.syncOpen = e.target.open; save(); } }, true);

  main.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.s && t.tagName === "SELECT") { S.settings[t.dataset.s] = t.value; save(); toast("Saved"); return; }
    if (t.dataset.sd && t.tagName === "SELECT") { S.ui.scDraft[t.dataset.sd] = t.value; save(); if (t.dataset.actChange === "sd-type") render(); return; }
    if (t.dataset.actChange === "dues-month") { S.ui.duesMonth = t.value; save(); render(); return; }
    if (t.dataset.ld !== undefined && t.tagName === "SELECT") { S.ui.leadDraft[t.dataset.ld] = t.value; save(); updateLeadPreview(); return; }
    if (t.dataset.reason) { const l = S.leads.find((x) => x.id === t.dataset.reason); l.reason = t.value; l.reasonDate = todayStr(); if (t.value) addRemark(l, `Reason: ${t.value}`); save(); render(); return; }
    if (t.dataset.duesStatus) { markDues(duesList().find((x) => x.id === t.dataset.duesStatus), t.value); save(); render(); return; }
    if (t.dataset.seq && t.tagName === "SELECT") {
      const j = editableJourneys().find((x) => x.id === (S.ui.seqId || "nosign")) || editableJourneys()[0];
      j.steps[Number(t.dataset.i)].script = t.value; save(); render(); toast("Step updated"); return;
    }
    if (t.dataset.fq) {
      S.ui.fq = Object.assign({}, S.ui.fq, { [t.dataset.fq]: t.value });
      if (t.dataset.fq === "seq") S.ui.fq.step = ""; // step numbers differ per sequence
      // Filtering by step means looking at everyone, not just who's due now.
      if ((t.dataset.fq === "seq" || t.dataset.fq === "step" || t.dataset.fq === "cat" || t.dataset.fq === "src") && t.value && (S.ui.fuFilter || "due") === "due") S.ui.fuFilter = "all";
      save(); render(); return;
    }
    if (t.id === "wa-style") { S.settings.waLinkStyle = t.value; save(); toast("Saved"); return; }
    if (t.id === "imp-layout") { S.ui.impLayout = t.value; save(); rerenderSync("imp-layout"); return; }
    if (t.id === "dues-file") { readFile(t, importMembers); return; }
    if (t.id === "sc-file") {
      readFile(t, (txt) => {
        try {
          const list = JSON.parse(txt).afoScripts;
          if (!Array.isArray(list)) throw new Error();
          let added = 0, updated = 0;
          list.forEach((x) => {
            if (!x.key || !x.text) return;
            const ex = findScript(x.key);
            if (ex) { Object.assign(ex, x, { id: ex.id }); updated++; } else { S.scripts.push({ ...x, id: uid() }); added++; }
          });
          save(); render(); toast(`${added} added, ${updated} updated`);
        } catch { toast("That file isn't a scripts export"); }
      });
      return;
    }
    if (t.dataset.ob) {
      const tr = S.trainees.find((x) => x.id === S.activeTrainee) || S.trainees[0];
      if (t.value) tr.items[t.dataset.ob] = { status: t.value, date: todayStr() }; else delete tr.items[t.dataset.ob];
      save(); render(); return;
    }
    if (t.id === "hb-file") { readFile(t, (txt) => { S.handbook = txt; save(); render(); checkAI(); toast("Handbook loaded"); }); return; }
    if (t.id === "imp-file") {
      readFile(t, (txt) => {
        try {
          const data = JSON.parse(txt);
          if (!data || typeof data !== "object" || !data.settings) throw new Error();
          if (!confirm("Replace everything in the Shift Hub with this backup?")) return;
          S = Object.assign(defaults(), data); init(); save(); go(S.tab); toast("Backup restored");
        } catch { toast("That file isn't a Shift Hub backup"); }
      });
    }
  });

  // Keep the Today view and follow-up badge current without disturbing typing.
  setInterval(() => {
    updateBadge();
    const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if ((S.tab === "today" || (S.tab === "followups" && !S.ui.leadDraft)) && !typing) render();
  }, 30000);

  init();
  applyOutlet();
  go(S.tab);

  // When hosted (e.g. GitHub Pages), cache the hub's files so it keeps working
  // offline and can be installed as an app. Not available when opened as a file.
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
