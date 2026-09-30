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
| **Prospect & Trial** | Log every enquiry and trial as a card with name, contact number, enquiry date, trial date and time, scheduler and remarks. **Check in** a trial when they arrive and they show under "In the gym now" with how long they've been in, a notes box and talking points. Checking in adds "Came for trial 30/9" to Remarks. **Check out** asks how it went (signed, didn't sign, came with friends, no-show). One-tap tags (asked about rates, promotions, free trial or facilities; came with friends, comparing gyms, student, beginner and so on) add characteristics to Remarks. Each card shows the next follow-up with its message ready to copy. **Copy row for sheet** copies the row in the online sheet's column order: click the Name cell of an empty row and paste. Cards show whether they're in the sheet yet or changed since. | 4.4, 4.6 |
| **Payments** | The monthly dues chase. Paste the yellow members (name, phone, amount) from Membr or a spreadsheet. The hub counts down to the 8th at 00:00, gives you one member at a time with the reminder already written (/DuesReminder, or /SecondDeduction on the 7th), opens it in WhatsApp and marks them as sent. Track Reminded, Promised and Paid, and copy a summary for the EOD report. | 7.4, 10 |
| **Calculators** | Freeze fee, cancellation prorata and quick quotes (including Duo/Trio bundles). Drafts the freeze or cancellation email for you to post in Discord for vetting. | 7.1, 7.2, 8.1 |
| **Scripts** | Every WhatsApp script, grouped by category, with your name filled in. Edit any of them or add your own. Mark a script as a promotion with start and end dates: it appears on the start date and moves to Expired after the end date. Export the scripts to load them on another computer. | 7, 8, 13 |
| **Onboarding** | Tracks each new staff member through the 2-week plan (shift 1 to shift 15). Each topic comes with a question to ask the NotebookLM notebook for self-study. | Onboarding plan |
| **Ask & Redact** | **Redact:** paste a member's message and get a version with card numbers, NRIC, phone numbers, emails, dates and addresses replaced by placeholders, safe to paste into NotebookLM or any cloud AI. **Private AI:** optional, answers handbook questions using an AI model that runs on this computer (see below). | 1 ("never enter member personal data into any AI tool") |

Anything still open in the handbook's manager checklist shows a yellow **pending CONFIRM #n** badge. The two calculation rules that are still open (partial freeze weeks, prorata divisor) can be switched in Settings once the manager decides.

## Where the data goes

Nowhere. Everything you type is saved in this browser on this computer (localStorage).

* The page has a security policy that stops the browser from sending anything to the internet. The only address it's allowed to contact is a local AI server on the same computer (`localhost:11434`).
* No fonts, scripts or images are loaded from the web.
* Prospect & Trial keeps full names and contact numbers because they go into the online sheet. Remarks are blocked if they contain an NRIC or card number.
* The Payments tab keeps member names, phone numbers and amounts, which is why it lives here and not online. **Open in WhatsApp** hands the message to WhatsApp, the same as typing it yourself. Use **Settings → Delete old data** to clear payment lists older than two months.
* The private AI refuses questions that contain NRIC, card numbers, phone numbers and similar, and offers to replace them.

Use **Settings → Export backup** now and then. Clearing the browser's data wipes the hub.

## Optional: private AI on this computer

1. Install [Ollama](https://ollama.com) on the front-desk computer.
2. Open a terminal and run `ollama pull llama3.1:8b` (about 5 GB, once). Any model works: type its name in Settings.
3. Save the Staff Handbook from Word as **Plain Text (.txt)** and load it under **Ask & Redact → Load handbook**.
4. If the badge says "not running" while Ollama is open, set an environment variable `OLLAMA_ORIGINS` to `*`, then restart Ollama. Pages opened from a file need this before they can talk to Ollama.

An 8B model needs about 8 GB of free RAM and answers in a few seconds to a minute, depending on the computer. It's slower and less accurate than NotebookLM, so treat it as the option for questions that involve member situations. Always check fees and dates against the handbook.

## New draft scripts

The hub adds some messages the handbook doesn't have yet. They show a **draft** badge until someone edits and saves them: /DuesReminder, /TrialReminder, /TrialNoSign, /TrialFriends, /Reengage, /WelcomeReview, /PTOffer and /ReferFriend. Ask the manager to approve the wording (and add the Google review link to /WelcomeReview).

## Editing the content

Scripts are edited in the Scripts tab. Checklists, rates, follow-up journeys (the steps and their timings), the online sheet's columns (`sheet.columns`, in order, with which ones are left blank), the dues dates and onboarding steps live in `data.js`. Open it in Notepad, change the text, save and refresh the page. For example, once the manager confirms staff hours, fix the `[staff hours]` placeholder in the `/Changecard` script.

## Files

```
index.html   page shell and security policy
style.css    look and feel (follows the computer's light/dark setting)
data.js      all content from the handbook, edit this
app.js       the logic
```
