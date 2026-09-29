// AFO Shift Hub — runs entirely in the browser. No build step, no server.
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
    calc: {}, handbook: "", tab: "today",
  });
  let S;
  try { S = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch { S = defaults(); }
  S.settings = Object.assign(defaults().settings, S.settings);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast("Could not save: browser storage is blocked or full"); } };

  const me = () => S.settings.name.trim() || "[Your Name]";
  const fill = (text, name) => text.replaceAll("[Your Name]", me()).replaceAll("[NAME]", name?.trim() || "[NAME]");

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
  const TABS = { today: renderToday, followups: renderFollowups, calc: renderCalc, scripts: renderScripts, onboarding: renderOnboarding, ask: renderAsk, settings: renderSettings };
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
          <div class="stat"><b>${dueFollowups().length}</b><span>follow-ups due today</span></div></div>
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
          <section class="card"><h2>Handover to next shift</h2>
            <label class="field">Pinned emails and WhatsApps, trials and tours booked, anything unfinished. Use initials.
              <textarea data-handover placeholder="e.g. MX - cancellation, awaiting payment screenshot">${esc(d.handover)}</textarea></label>
            <div class="row" style-top><button class="btn btn-primary" data-act="copy-handover">Copy handover report</button></div>
          </section>
        </div>
      </div>`;
  }
  const addMin = (d, m) => new Date(d.getTime() + m * 60000);
  function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }

  function handoverText() {
    const d = day();
    const shift = D.shifts.find((s) => s.id === d.shift);
    const lines = [`${D.club.code} handover · ${longDate(new Date())} · ${shift.label} · ${me()}`, ""];
    const notDone = shift.items.filter((i) => !d.done[i.id]);
    lines.push(`Checklist: ${shift.items.length - notDone.length}/${shift.items.length} done`);
    if (notDone.length) lines.push("Not done:", ...notDone.map((i) => `- ${i.text}${d.notes[i.id] ? " (" + d.notes[i.id] + ")" : ""}`));
    const noted = shift.items.filter((i) => d.done[i.id] && d.notes[i.id]);
    if (noted.length) lines.push("Notes:", ...noted.map((i) => `- ${i.text}: ${d.notes[i.id]}`));
    const due = dueFollowups();
    if (due.length) lines.push("", `Follow-ups due: ${due.length}`, ...due.map((l) => `- ${l.who} (${l.channel}) ${l.nextNote}`));
    if (d.handover.trim()) lines.push("", "Handover:", d.handover.trim());
    return lines.join("\n");
  }

  // ================= FOLLOW-UPS =================
  function leadNext(l) {
    const rule = D.followUpRules.find((r) => r.id === l.rule) || D.followUpRules[0];
    const idx = rule.steps.findIndex((_, i) => !(l.done || []).includes(i));
    if (idx < 0 || l.closed) return null;
    const step = rule.steps[idx];
    return { idx, due: addDays(parse(l.date), step.d), note: step.note, total: rule.steps.length };
  }
  function dueFollowups() {
    const today = parse(todayStr());
    return S.leads.map((l) => ({ l, n: leadNext(l) })).filter((x) => x.n && x.n.due <= today)
      .map((x) => ({ ...x.l, nextNote: x.n.note }));
  }
  function updateBadge() {
    const n = dueFollowups().length;
    const b = document.getElementById("fu-count");
    b.hidden = n === 0; b.textContent = n;
  }

  function renderFollowups() {
    const today = parse(todayStr());
    const open = S.leads.map((l) => ({ l, n: leadNext(l) })).filter((x) => x.n).sort((a, b) => a.n.due - b.n.due);
    const closed = S.leads.filter((l) => l.closed || !leadNext(l));
    const rows = open.map(({ l, n }) => {
      const diff = dayDiff(today, n.due);
      const when = diff < 0 ? `<span class="overdue">${-diff}d overdue</span>` : diff === 0 ? `<span class="overdue">today</span>` : `in ${diff}d · ${shortDate(n.due)}`;
      return `<tr class="${diff <= 0 ? "is-due" : ""}">
        <td><b>${esc(l.who)}</b><div class="small muted">${esc(l.channel)} · ${esc(shortDate(parse(l.date)))}</div></td>
        <td><span class="badge ${l.cat.toLowerCase()}">${esc(l.cat)}</span></td>
        <td>${esc(n.note)}<div class="small muted">step ${n.idx + 1} of ${n.total}${l.interest ? " · " + esc(l.interest) : ""}</div></td>
        <td>${when}</td>
        <td class="num"><div class="row"><button class="btn btn-sm" data-act="lead-step" data-id="${l.id}">Followed up</button>
          <button class="btn btn-sm" data-act="lead-close" data-id="${l.id}" data-outcome="Signed up">Signed up</button>
          <button class="btn btn-sm btn-ghost" data-act="lead-close" data-id="${l.id}" data-outcome="Closed">Close</button></div></td>
      </tr>`;
    }).join("");
    return `
      <div class="page-head"><div><h1>Follow-ups</h1>
        <p>A reminder queue for the follow-up schedule in handbook 4.6. The DSR is still where every lead is recorded.</p></div></div>
      <div class="grid">
        <section class="card">
          <h2>Add a lead</h2>
          <div class="fields">
            <label class="field">Initials only<input type="text" id="ld-who" maxlength="6" placeholder="e.g. MX" autocomplete="off"></label>
            <label class="field">Channel<select id="ld-channel">${["Walk-in", "WhatsApp", "Instagram / FB", "Email", "Website", "Phone", "Referral"].map((c) => `<option>${c}</option>`).join("")}</select></label>
            <label class="field">Category<select id="ld-cat"><option>HOT</option><option selected>WARM</option><option>COLD</option></select></label>
            <label class="field">Situation<select id="ld-rule">${D.followUpRules.map((r) => `<option value="${r.id}">${esc(r.label)}</option>`).join("")}</select></label>
            <label class="field">Date of enquiry / tour / trial<input type="date" id="ld-date" value="${todayStr()}"></label>
            <label class="field">Looking for (no personal details)<input type="text" id="ld-interest" placeholder="e.g. fat loss, evenings, 12m"></label>
          </div>
          <div class="row" style-top><button class="btn btn-primary" data-act="lead-add">Add to queue</button><span class="small muted" id="ld-msg"></span></div>
          <p class="small muted" style-top>${pendingBadge("CONFIRM #6")} Follow-up timings are still to be confirmed by the manager.</p>
        </section>
        <section class="card">
          <div class="card-head"><h2>Open (${open.length})</h2>${open.length ? '<button class="btn btn-sm" data-act="copy-due">Copy due list</button>' : ""}</div>
          ${open.length ? `<div class="table-wrap"><table><thead><tr><th>Lead</th><th>Cat.</th><th>Next step</th><th>Due</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">Nothing to follow up. Add a lead above.</div>`}
        </section>
        ${closed.length ? `<section class="card"><details><summary>Closed (${closed.length})</summary>
          <div class="table-wrap"><table><tbody>${closed.slice(-50).reverse().map((l) => `<tr><td><b>${esc(l.who)}</b></td><td>${esc(l.channel)}</td><td>${esc(l.outcome || "All steps done")}</td>
          <td class="num"><button class="btn btn-sm btn-ghost btn-danger" data-act="lead-del" data-id="${l.id}">Delete</button></td></tr>`).join("")}</tbody></table></div>
          <button class="btn btn-sm" data-act="lead-clear" style-top>Delete all closed</button></details></section>` : ""}
      </div>`;
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
    const sig = () => `\n\n(Your mail client adds the AFO signature. Check it's there before sending.)`;

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
VPA: ${D.club.vpaFreezeCancel}

When making the payment, please indicate "AFO Freezing" in the payment remarks.

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

We thank you for being a loyal member of Anytime Fitness Orchard. Should you require any further assistance, please do not hesitate to contact us.` + sig()
          : head + `${month} prorata: (${money(fee)} ÷ ${div} days) × ${active} = ${money(amt)}

Kindly make payment of ${money(amt)} to our VPA below by the end of the month to process your cancellation:
VPA: ${D.club.vpaFreezeCancel}

Please include "AFO Cancellation" in the payment remarks and send us a screenshot as verification of your payment. Should you require any further assistance, please do not hesitate to contact us.` + sig();
        const confirm = `Subject: Membership Cancellation Confirmed

Dear ${name},

Thank you for your prompt payment. We have received and verified your payment successfully.

Your cancellation has been processed, and your final day of club access will be ${longDate(last)} at 11:59PM (2359 hrs).

We would like to thank you for choosing Anytime Fitness Orchard as your fitness provider. It has been our pleasure to be part of your fitness journey, and we wish you all the best in your future endeavours.

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
  function renderScripts() {
    return `
      <div class="page-head"><div><h1>WhatsApp scripts</h1>
        <p>Handbook section 13. Your name is filled in from Settings.</p></div></div>
      <section class="card">
        <div class="fields">
          <label class="field">Search<input type="text" id="sc-q" placeholder="e.g. price, trial, card" value="${esc(S.calc.sc_q || "")}"></label>
          <label class="field">Their first name (for [NAME])<input type="text" id="sc-name" value="${esc(S.calc.sc_name || "")}" autocomplete="off"></label>
        </div>
        ${S.settings.name ? "" : `<div class="notice warn" style-top>Add your name in Settings so it's filled into every script.</div>`}
        <div id="sc-list" style-top></div>
      </section>`;
  }
  function updateScripts() {
    const q = (S.calc.sc_q || "").toLowerCase();
    const list = D.scripts.filter((s) => !q || (s.key + s.when + s.text).toLowerCase().includes(q));
    document.getElementById("sc-list").innerHTML = list.length ? list.map((s) => `
      <div class="script">
        <div class="row"><code>${esc(s.key)}</code>${pendingBadge(s.pending)}<span class="spacer"></span><button class="btn btn-sm btn-primary" data-act="copy-script" data-id="${esc(s.key)}">Copy</button></div>
        <p class="small muted">${esc(s.when)}</p>
        <details><summary>Preview</summary><pre class="out">${esc(fill(s.text, S.calc.sc_name))}</pre></details>
      </div>`).join("") : `<div class="empty">No script matches "${esc(q)}".</div>`;
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

  async function checkAI() {
    const el = document.getElementById("ai-status");
    if (!el) return;
    try {
      const r = await fetch(S.settings.ollamaUrl.replace(/\/$/, "") + "/api/tags");
      const j = await r.json();
      const names = (j.models || []).map((m) => m.name);
      const ok = names.some((n) => n === S.settings.model || n.split(":")[0] === S.settings.model.split(":")[0]);
      el.textContent = ok ? `ready · ${S.settings.model}` : `model ${S.settings.model} not installed`;
      el.className = "badge " + (ok ? "ok" : "pending");
    } catch {
      el.textContent = "not running";
      el.className = "badge bad";
    }
  }

  function knowledge() {
    const k = [];
    k.push(`Club: ${D.club.name} (${D.club.code}), ${D.club.address}. Phone ${D.club.phone}. Email ${D.club.email}.`);
    k.push("Membership rates: " + D.rates.map((r) => `${r.label} $${r.monthly}/month${r.enrolmentWaived ? " (enrolment fee waived)" : ""}`).join("; ") + ".");
    k.push(`Fees: enrolment $${D.fees.enrolment}, access pass $${D.fees.accessPass}, freeze $${D.fees.freezePerWeek}/week, late payment $${D.fees.latePayment}. 30 days notice for freezes and cancellations.`);
    k.push("Bundles: " + D.bundles.map((b) => `${b.label} ${b.discount * 100}% off 12 or 18 month rate, enrolment waived, access pass still applies`).join("; ") + ".");
    k.push("Shift checklists:\n" + D.shifts.map((s) => `${s.label}: ` + s.items.map((i) => i.text + (i.due ? ` (by ${i.due})` : "")).join("; ")).join("\n"));
    k.push("Cleanliness standard: " + D.cleanStandard.join("; ") + ".");
    k.push("Follow-up schedule: " + D.followUpRules.map((r) => `${r.label}: ` + r.steps.map((s) => `day ${s.d} ${s.note}`).join(", ")).join("; ") + ".");
    k.push("WhatsApp shortcuts:\n" + D.scripts.map((s) => `${s.key} — ${s.when}`).join("\n"));
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
    out.innerHTML = `<p class="muted">Thinking… (the first answer can take a minute while the model loads)</p>`;
    const system = `You are the AFO Shift Hub assistant for front desk staff at Anytime Fitness Orchard in Singapore.
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
        body: JSON.stringify({ model: S.settings.model, stream: false, options: { temperature: 0.2, num_ctx: 16384 }, messages: [{ role: "system", content: system }, { role: "user", content: q }] }),
      });
      if (!r.ok) throw new Error((await r.text()) || r.status);
      const j = await r.json();
      out.innerHTML = `<pre class="out">${esc(j.message?.content || "(no answer)")}</pre>`;
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
          <div class="row"><button class="btn btn-danger" data-act="prune">Delete checklists older than 30 days</button>
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
      case "copy-handover": copy(handoverText(), "Handover copied"); break;

      case "lead-add": {
        const who = document.getElementById("ld-who").value.trim().toUpperCase();
        const interest = document.getElementById("ld-interest").value.trim();
        const msg = document.getElementById("ld-msg");
        if (!/^[A-Z]{1,4}\d{0,2}$/.test(who)) { msg.textContent = "Use initials only, e.g. MX (up to 4 letters)."; msg.className = "small overdue"; return; }
        if (hasPII(interest)) { msg.textContent = "The 'looking for' note seems to contain personal details. Remove them."; msg.className = "small overdue"; return; }
        S.leads.push({ id: uid(), who, interest, channel: document.getElementById("ld-channel").value, cat: document.getElementById("ld-cat").value, rule: document.getElementById("ld-rule").value, date: document.getElementById("ld-date").value || todayStr(), done: [] });
        save(); render(); toast("Lead added"); break;
      }
      case "lead-step": { const l = S.leads.find((x) => x.id === id); const n = leadNext(l); if (n) l.done.push(n.idx); save(); render(); break; }
      case "lead-close": { const l = S.leads.find((x) => x.id === id); l.closed = true; l.outcome = b.dataset.outcome; save(); render(); break; }
      case "lead-del": S.leads = S.leads.filter((x) => x.id !== id); save(); render(); break;
      case "lead-clear": if (confirm("Delete all closed leads?")) { S.leads = S.leads.filter((l) => leadNext(l)); save(); render(); } break;
      case "copy-due": copy(dueFollowups().map((l) => `${l.who} (${l.channel}, ${l.cat}): ${l.nextNote}`).join("\n") || "No follow-ups due today.", "Due list copied"); break;

      case "copy-calc": copy(calcEmails[id], "Email copied"); break;
      case "copy-script": { const s = D.scripts.find((x) => x.key === id); copy(fill(s.text, S.calc.sc_name), `${s.key} copied`); break; }

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
      case "ai-redact": { S.calc.ai_q = redact(S.calc.ai_q || "").out; save(); document.getElementById("ai-q").value = S.calc.ai_q; document.getElementById("ai-out").innerHTML = ""; break; }
      case "hb-clear": S.handbook = ""; save(); render(); checkAI(); break;

      case "export": {
        const blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = `afo-shift-hub-backup-${todayStr()}.json`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000); break;
      }
      case "prune": {
        const cutoff = ymd(addDays(new Date(), -30));
        Object.keys(S.days).forEach((k) => { if (k < cutoff) delete S.days[k]; });
        save(); toast("Old checklists deleted"); break;
      }
      case "wipe": if (confirm("Erase all data in the Shift Hub on this computer? Export a backup first if you need it.")) { localStorage.removeItem(KEY); S = defaults(); save(); go("today"); } break;
    }
  });

  main.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.note !== undefined) { day().notes[t.dataset.note] = t.value; save(); return; }
    if (t.dataset.handover !== undefined) { day().handover = t.value; save(); return; }
    if (t.dataset.k) { S.calc[t.dataset.k] = t.value; save(); updateCalc(); return; }
    if (t.dataset.s && t.tagName !== "SELECT") { S.settings[t.dataset.s] = t.value; save(); return; }
    const map = { "sc-q": "sc_q", "sc-name": "sc_name", "rd-in": "rd_in", "rd-names": "rd_names", "ai-q": "ai_q" };
    if (map[t.id]) {
      S.calc[map[t.id]] = t.value; save();
      if (t.id.startsWith("sc-")) updateScripts();
      if (t.id.startsWith("rd-")) updateRedact();
    }
  });

  main.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.s && t.tagName === "SELECT") { S.settings[t.dataset.s] = t.value; save(); toast("Saved"); return; }
    if (t.dataset.ob) {
      const tr = S.trainees.find((x) => x.id === S.activeTrainee) || S.trainees[0];
      if (t.value) tr.items[t.dataset.ob] = { status: t.value, date: todayStr() }; else delete tr.items[t.dataset.ob];
      save(); render(); return;
    }
    if (t.id === "hb-file" && t.files[0]) {
      const r = new FileReader();
      r.onload = () => { S.handbook = String(r.result); save(); render(); checkAI(); toast("Handbook loaded"); };
      r.readAsText(t.files[0]);
    }
    if (t.id === "imp-file" && t.files[0]) {
      const r = new FileReader();
      r.onload = () => {
        try {
          const data = JSON.parse(String(r.result));
          if (!data || typeof data !== "object" || !data.settings) throw new Error();
          if (!confirm("Replace everything in the Shift Hub with this backup?")) return;
          S = Object.assign(defaults(), data); save(); go(S.tab); toast("Backup restored");
        } catch { toast("That file isn't a Shift Hub backup"); }
      };
      r.readAsText(t.files[0]);
    }
  });

  // Keep the Today view and follow-up badge current without disturbing typing.
  setInterval(() => {
    updateBadge();
    const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (S.tab === "today" && !typing) render();
  }, 30000);

  go(S.tab);
})();
