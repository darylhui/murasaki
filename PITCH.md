# AI for front-desk operations at AFO: proposal

*Prepared by [Your name], front desk, Anytime Fitness Orchard*

## The ask

Approval to pilot two low-cost tools at AFO for 4 weeks:

1. **The NotebookLM staff notebook**, already built. It holds the Staff Handbook so staff can ask "what do I do on an opening shift?" or take a quiz.
2. **AFO Shift Hub**, a dashboard that runs on the front-desk computer with no internet connection. It turns the handbook into checklists, calculators, ready-to-copy scripts and an onboarding tracker.

Neither tool replaces training or the manager. Both help new staff get up to speed faster and help everyone make fewer mistakes on a busy shift.

## The problem

A front-desk shift juggles walk-ins, WhatsApp, email and Instagram with timed cleanliness checks, stock counts, maintenance logs, sales and prospect sheets, the EOD report and Membr. New staff have 2 weeks and around 15 shifts to learn all of it, mostly from the manager or an RA.

Where time and accuracy are lost today:

* **Onboarding depends on the trainer being there.** Questions pile up on the manager, including on off days.
* **Fee calculations by hand.** Freeze fees and cancellation prorata are worked out on the spot, then checked in Discord.
* **Missed timings.** Seven photo checks between 7PM and 10PM on a closing shift, on top of enquiries.
* **Follow-ups slip.** The handbook sets a follow-up schedule (day 2 to 3, day 5 to 7, 2 weeks, 48 to 72 hours after a tour, 3 days after a trial). Nothing reminds staff when one is due.
* **Member data and AI.** As staff start using ChatGPT and similar tools, nothing stops someone pasting a member's NRIC or card number into one.

## What each tool does

### NotebookLM staff notebook (live)
* Answers handbook questions with a citation back to the exact line.
* Generates quizzes for T&Cs, pricing and procedures.
* The handbook has been rewritten for it, with a manager checklist of 20 open items (the `CONFIRM #` boxes) so the AI never repeats a contradiction.

### AFO Shift Hub (working prototype)
| Feature | Saves |
|---|---|
| Shift checklists with a countdown to the next photo check, notes and a one-click handover report | Missed checks, forgotten handover items |
| Freeze and cancellation calculators that draft the email ready for Discord vetting | Calculation errors, re-typing templates |
| Quick quote, including Duo/Trio bundles | Looking up rates mid-conversation |
| All WhatsApp shortcuts, searchable, name filled in | Hunting for the right template |
| Follow-up queue (initials only) that flags what's due today | Leads going cold |
| Onboarding tracker for the 2-week plan, with a NotebookLM study question for each topic | Trainer time; a clear view of where each new hire is |
| Redactor: removes card numbers, NRIC, phone numbers, emails and addresses before anything is pasted into an AI | PDPA risk |
| Optional private AI that runs on the computer itself | Lets staff ask about member situations without data leaving the club |

## Why a local dashboard

The club holds personal data covered by Singapore's PDPA: names, NRIC, dates of birth, addresses, card details. The Shift Hub is built so that none of it can leave the computer:

* It opens from a file. There's no website, server, account or subscription.
* A browser security policy blocks every internet request from the page.
* Data is stored only in the browser on the front-desk computer, with a manual backup button.
* It's free, and the content is edited in a single text file (no developer needed).

## Options considered

| Option | Good for | Watch out for | Cost |
|---|---|---|---|
| **NotebookLM** (current) | Q&A over the handbook with citations, quizzes, audio overviews for onboarding | Cloud-based: never enter member data. Use a company Google Workspace account rather than personal ones | Free, or included in Workspace |
| **ChatGPT / Claude (team plans)** | Drafting replies and emails, rewriting SOPs, analysing exported (anonymised) sales data | Same cloud caveat. Business plans have stronger data terms than free personal accounts | About US$25 to 30 per user per month |
| **Local dashboard (Shift Hub)** | Daily execution: checklists, calculators, templates, reminders, onboarding tracking | Data is per computer, so it needs backups. Doesn't sync between clubs | Free |
| **Local AI (Ollama)** | AI help with member situations, fully offline | Slower and less accurate than cloud models. Needs a computer with about 8 GB of free RAM | Free |
| **Automations on Google Sheets** (Apps Script or Gemini in Sheets) | Follow-up reminders, EOD checks, expiring-promo alerts, maintenance escalations | Needs a sheet owner. Test on a copy first | Free with Workspace |
| **Agentic workflows** (e.g. an AI drafting WhatsApp or Instagram replies automatically) | Speed of first response | Highest risk: member data flows through third parties, and AI replies could go out unchecked. Needs HQ approval | Varies |

## Recommended roadmap

**Phase 1: pilot (weeks 1 to 4, no cost)**
* Manager resolves the 20 `CONFIRM #` items in the handbook, then it's uploaded to NotebookLM.
* Shift Hub goes on the AFO front-desk computer.
* The next new hire is onboarded with both tools alongside the normal plan.

**Phase 2: connect to the sheets (month 2)**
* Apps Script reminders on the Prospect & Trial list and Maintenance Log (e.g. a Discord message when a follow-up is overdue or a machine has been Out of Order for over 48 hours).
* Promotions tab: automatically mark expired promotions so the AI never quotes them.

**Phase 3: other clubs (month 3+)**
* If the pilot works, copy the notebook and the Shift Hub to other clubs. Only `data.js` needs changing.
* Review agentic reply-drafting with HQ, with a human always approving before anything is sent.

## How we'll measure the pilot

| Measure | How |
|---|---|
| Time for a new hire to pass the pricing and T&C tests | Onboarding tracker dates vs. the current plan (shift 4) |
| Questions sent to the manager per week by new staff | Count on Discord / WhatsApp |
| Freeze and cancellation emails sent back during Discord vetting | Count in Discord |
| Cleanliness photo checks posted on time | Discord timestamps |
| Follow-ups done on schedule | Follow-up queue vs. DSR |

## What I need

1. Approval to run the pilot at AFO for 4 weeks.
2. 30 minutes with the manager to resolve the handbook's `CONFIRM #` items.
3. Permission to put the Shift Hub on the front-desk computer.
4. (Optional) A company Google Workspace account to own the NotebookLM notebook, instead of a personal one.
