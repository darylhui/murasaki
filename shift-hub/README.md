# AFO Shift Hub

A front-desk dashboard for Anytime Fitness Orchard that runs on the club computer, with no internet and no install. It turns the Staff Handbook and the onboarding plan into things you can tick off, copy and calculate.

## Open it

1. Copy the `shift-hub` folder to the front-desk computer (a USB stick is fine).
2. Double-click `index.html`. It opens in Chrome or Edge.
3. Go to **Settings** and enter your name.

Bookmark the page so the next shift can find it.

## What's inside

| Tab | What it does | Handbook section |
|---|---|---|
| **Today** | Opening, mid-day and closing checklists with timed cleanliness checks (10AM, 5PM, 7PM to 9PM, 10PM) and a countdown to the next one. Adds notes when something couldn't be done and copies a handover report. | 11, onboarding plan |
| **Follow-ups** | A reminder queue for leads, using initials only. Works out the next follow-up date from the enquiry, tour or trial date and flags anything due. The DSR is still where every lead is recorded. | 4.4, 4.6 |
| **Calculators** | Freeze fee, cancellation prorata and quick quotes (including Duo/Trio bundles). Drafts the freeze or cancellation email for you to post in Discord for vetting. | 7.1, 7.2, 8.1 |
| **Scripts** | All WhatsApp shortcuts, searchable, with your name filled in. One click to copy. | 7, 13 |
| **Onboarding** | Tracks each new staff member through the 2-week plan (shift 1 to shift 15). Each topic comes with a question to ask the NotebookLM notebook for self-study. | Onboarding plan |
| **Ask & Redact** | **Redact:** paste a member's message and get a version with card numbers, NRIC, phone numbers, emails, dates and addresses replaced by placeholders, safe to paste into NotebookLM or any cloud AI. **Private AI:** optional, answers handbook questions using an AI model that runs on this computer (see below). | 1 ("never enter member personal data into any AI tool") |

Anything still open in the handbook's manager checklist shows a yellow **pending CONFIRM #n** badge. The two calculation rules that are still open (partial freeze weeks, prorata divisor) can be switched in Settings once the manager decides.

## Where the data goes

Nowhere. Everything you type is saved in this browser on this computer (localStorage).

* The page has a security policy that stops the browser from sending anything to the internet. The only address it's allowed to contact is a local AI server on the same computer (`localhost:11434`).
* No fonts, scripts or images are loaded from the web.
* Leads use initials only, and the "looking for" note is blocked if it contains personal details.
* The private AI refuses questions that contain NRIC, card numbers, phone numbers and similar, and offers to replace them.

Use **Settings → Export backup** now and then. Clearing the browser's data wipes the hub.

## Optional: private AI on this computer

1. Install [Ollama](https://ollama.com) on the front-desk computer.
2. Open a terminal and run `ollama pull llama3.1:8b` (about 5 GB, once). Any model works: type its name in Settings.
3. Save the Staff Handbook from Word as **Plain Text (.txt)** and load it under **Ask & Redact → Load handbook**.
4. If the badge says "not running" while Ollama is open, set an environment variable `OLLAMA_ORIGINS` to `*`, then restart Ollama. Pages opened from a file need this before they can talk to Ollama.

An 8B model needs about 8 GB of free RAM and answers in a few seconds to a minute, depending on the computer. It's slower and less accurate than NotebookLM, so treat it as the option for questions that involve member situations. Always check fees and dates against the handbook.

## Editing the content

All checklists, scripts, rates and onboarding steps live in `data.js`. Open it in Notepad, change the text, save and refresh the page. For example, once the manager confirms staff hours, fix the `[staff hours]` placeholder in the `/Changecard` script.

## Files

```
index.html   page shell and security policy
style.css    look and feel (follows the computer's light/dark setting)
data.js      all content from the handbook, edit this
app.js       the logic
```
