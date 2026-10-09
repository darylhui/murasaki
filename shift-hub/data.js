// AFO Shift Hub — content config.
// Everything the dashboard shows comes from this file, taken from the
// AFO Staff Handbook (v2) and the onboarding plan. The manager can edit it
// in any text editor; no code changes are needed.
//
// Items marked `pending: "CONFIRM #n"` are still open in the handbook's
// manager checklist. The dashboard shows them with a "pending" badge.

window.AFO = {
  club: {
    // These are the defaults. Each outlet sets its own under Settings → Outlet;
    // scripts use [Outlet], [Outlet Short], [Outlet Code], [Outlet Phone],
    // [Freeze VPA] and [Late VPA] so they follow those settings.
    name: "Anytime Fitness Orchard",
    short: "AF Orchard",
    area: "Orchard",
    code: "AFO",
    phone: "+65 8816 8855",
    email: "Orchard@anytimefitness.sg",
    web: "www.anytimefitness.sg",
    address: "277 Orchard Road, Orchardgateway, #04-01, Singapore 238858",
    clubCodes: "AFO - AFCO - AFB - AFB85 - AFCSM - AFNUT - AFBV - AFGB - AFBTC - AFHO - AFAMKS - AFYE - AFNQW",
    vpaFreezeCancel: "UEN202142897EA00#XNAP",
    vpaLatePayment: "UEN202106218Z (Watchtower Gyms)",
  },

  fees: {
    freezePerWeek: 8,
    latePayment: 15.26,
    enrolment: 95,
    accessPass: 95,
  },

  rates: [
    { id: "m1", label: "1 Month", monthly: 158 },
    { id: "m6", label: "6 Months", monthly: 138 },
    { id: "m12", label: "12 Months", monthly: 118 },
    { id: "m18", label: "18 Months (best value)", monthly: 108 },
    { id: "ss12", label: "Student / Senior, 12 Months", monthly: 98, enrolmentWaived: true },
  ],

  bundles: [
    { id: "duo", label: "Duo (2 people)", people: 2, discount: 0.10 },
    { id: "trio", label: "Trio (3 people)", people: 3, discount: 0.15 },
  ],

  // Shift checklist (handbook section 11). `due` is a 24h "HH:MM" time.
  // `photo: true` means the check is only complete once the photo is in Discord.
  shifts: [
    {
      id: "opening",
      label: "Opening",
      items: [
        { id: "cctv", text: "CCTV check: cameras recording, feed working" },
        { id: "pos-open", text: "Open the POS in Membr, post opening petty cash count in Discord" },
        { id: "clean-open", text: "Opening cleanliness check, including lockers", due: "10:00", photo: true },
        { id: "rf", text: "Complete the RF-Opening Checklist", pending: "CONFIRM #20" },
        { id: "tailgate", text: "Tailgating report (if any) posted" },
        { id: "open-report", text: "Opening report posted in Discord" },
      ],
    },
    {
      id: "mid",
      label: "Mid-day",
      items: [
        { id: "clean-5pm", text: "5PM cleanliness check", due: "17:00", photo: true },
        { id: "walk-grounds", text: "Walk the grounds: litter, spills, rules being followed" },
        { id: "reply-backlog", text: "Clear the WhatsApp, email and DM backlog" },
      ],
    },
    {
      id: "closing",
      label: "Peak & Closing",
      items: [
        { id: "peak-1900", text: "Peak cleanliness check", due: "19:00", photo: true },
        { id: "peak-1930", text: "Peak cleanliness check", due: "19:30", photo: true },
        { id: "peak-2000", text: "Peak cleanliness check", due: "20:00", photo: true },
        { id: "peak-2030", text: "Peak cleanliness check", due: "20:30", photo: true },
        { id: "peak-2100", text: "Peak cleanliness check", due: "21:00", photo: true },
        { id: "clean-close", text: "End of day cleanliness check, including lockers", due: "22:00", photo: true },
        { id: "eod", text: "Post the EOD report in Discord (fill in and copy it below)" },
        { id: "pos-close", text: "Close the POS in Membr; closing petty cash goes in the EOD report" },
        { id: "kpi", text: "Update KPI movement in the DSR form" },
        { id: "logsheet", text: "Update the logsheet (outlet in Remarks, commissions noted)" },
      ],
    },
  ],

  // What "clean" means (onboarding plan, Cleanliness section).
  cleanStandard: [
    "Attachments off the floor, on racks or in their boxes",
    "Amenities topped up: spray bottles, soap, tissues, deodorant, wet wipes",
    "Plates and dumbbells re-racked, same weights on the same racks",
    "Sweat stains wiped off cardio machines",
    "Fans not dusty",
    "Hair cleared from showers",
    "No dust, cobwebs or insects",
  ],

  // Monthly dues chase. Payments are collected on the 1st at 00:00; members
  // who haven't paid (yellow members) are chased until the 8th at 00:00.
  // EZpay makes a second deduction attempt at 00:00 on the 8th; if that fails
  // the late payment fee is added.
  dues: { collectDay: 1, secondDeductionDay: 7, deadlineDay: 8 },

  // Follow-up sequences for the Prospect & Trial tab (the defaults: staff can
  // edit the steps under Scripts → Follow-up steps). Each step is due `d` days after
  // the journey's anchor date (enquiry date, trial date or sign-up date) and
  // suggests a script from the Scripts tab. Timings follow handbook 4.6 where it
  // has one [CONFIRM #6]; the rest are suggestions for the manager to adjust.
  journeys: [
    {
      id: "enquiry", label: "Enquiry, no trial yet", anchor: "Enquiry date", kind: "prospect",
      steps: [
        { d: 0, action: "Reply and invite them for a free trial", script: "/MembershipEnq" },
        { d: 2, action: "Follow up if no reply (day 2 to 3)", script: "/Reengage" },
        { d: 5, action: "Final check-in with the current promotion (day 5 to 7)", script: "/Reengage" },
        { d: 14, action: "Re-engage with this month's promotion (after 2 weeks)", script: "/Reengage" },
      ],
    },
    {
      id: "trial", label: "Trial booked", anchor: "Trial date", kind: "prospect",
      steps: [
        { d: -1, action: "Confirm tomorrow's trial", script: "/TrialReminder" },
        { d: 0, action: "Check them in when they arrive", outcome: true },
      ],
    },
    {
      id: "nosign", label: "Trialled or toured, didn't sign", anchor: "Trial / tour date", kind: "prospect",
      steps: [
        { d: 1, action: "Ask what they were looking for and what held them back", script: "/TrialNoSign" },
        { d: 3, action: "Follow up (within 3 days)", script: "/Trialfollowup" },
        { d: 7, action: "Offer the current promotion", script: "/Reengage" },
        { d: 21, action: "Re-engage when the next promotion starts", script: "/Reengage" },
      ],
    },
    {
      id: "friends", label: "Trialled with friends, not keen", anchor: "Trial date", kind: "prospect",
      steps: [
        { d: 2, action: "Pitch the Duo / Trio bundle to the group", script: "/TrialFriends" },
        { d: 14, action: "Re-engage with the next promotion", script: "/Reengage" },
      ],
    },
    {
      id: "member", label: "New member", anchor: "Sign-up date", kind: "member",
      steps: [
        { d: 1, action: "Welcome message and ask for a Google review", script: "/WelcomeReview" },
        { d: 7, action: "Check in and offer a PT session", script: "/PTOffer" },
        { d: 14, action: "Ask them to bring a friend", script: "/ReferFriend" },
      ],
    },
  ],

  // How someone first comes in. Each starts a journey. `trial: true` shows the
  // trial date and time fields; `checkIn: true` checks them in straight away.
  // Everything else about them goes in Remarks (see remarkTags).
  customerTypes: [
    { id: "enquiry", label: "Enquiry", journey: "enquiry", source: "", appt: "TBC" },
    { id: "trial-booked", label: "Trial", journey: "trial", source: "", appt: "Yes", trial: true },
  ],

  // "How did the prospect find out about us": the options in the sheet's dropdown.
  // Copied rows use this exact text so the dropdown accepts it.
  sources: [
    "AF Website",
    "Social Content (IG/FB Organic)",
    "Paid Media (IG/FB Ads)",
    "EDMs",
    "On-Site (Posters/Walk-in/Gym-floor duty)",
    "Word-of-mouth (Referral)",
    "Corporate",
  ],

  // Which "How did they find out about us" options count towards each
  // enquiry line of the EOD report. Anything not listed (or not set) counts
  // as OTHERS (Google search, Phone call, WhatsApp, Website).
  eodChannels: {
    socmed: ["Social Content (IG/FB Organic)", "Paid Media (IG/FB Ads)"],
    walkin: ["On-Site (Posters/Walk-in/Gym-floor duty)"],
    physical: [],
  },

  // "Schedule for Appt" options in the sheet.
  apptOptions: ["Yes", "No", "TBC"],

  // One-tap tags on the prospect form and the in-gym card. Tapping one adds
  // the text to Remarks (tap again to remove it).
  remarkTags: [
    { group: "Asked about", tags: ["Asked about rates", "Asked about promotions", "Asked about free trial", "Asked about facilities"] },
    { group: "About them", tags: ["Came with friends", "Comparing other gyms", "Student / senior", "Beginner", "Interested in PT", "Trains evenings", "Trains weekends"] },
  ],

  // The online Prospect & Trial sheet. The column order is fixed in app.js
  // (SHEET_COLUMNS) so every copied row matches the sheet exactly:
  // Name | Contact Number | Whatsapp Link | Date of Enquiry |
  // How did the prospect find out about us | Schedule for Appt | Scheduler |
  // Trial Date | Trial Time | Followed Up | Remarks
  sheet: {
    dateFormat: "DD/MM/YYYY", // or "D MMM YYYY"
  },

  // Talking points while a trial is in the gym (handbook 5.2).
  trialTalk: [
    "How did the workout feel? What did you enjoy most?",
    "What are you training for? (fat loss, muscle, getting started)",
    "Anything you were looking for that you didn't get to see?",
    "Recap their goals, then: \"Let me show you how to get started.\"",
    "Close: \"Shall we get you started today?\"",
  ],

  // Why a prospect didn't sign. Tallied on the Follow-ups tab each month.
  lostReasons: ["Price", "Comparing other gyms", "Location or timing", "Facilities / equipment", "Not ready yet", "Only came with friends", "No reply", "Other"],

  // WhatsApp scripts. These are the starting set: staff can edit them, add new
  // ones and set start/end dates for promotions in the Scripts tab.
  // type "standard" runs all year; type "promo" has optional start and end dates
  // (YYYY-MM-DD) and is hidden once it expires.
  // Placeholders: [Your Name] from Settings, [NAME] the customer's first name,
  // [Outlet], [Outlet Short], [Outlet Code], [Outlet Phone], [Freeze VPA] and
  // [Late VPA] from Settings → Outlet,
  // [Month] and [Amount] on the Payments tab.
  // `draft: true` marks new wording that isn't in the handbook yet.
  scripts: [
    {
      key: "/ratesenquiry", cat: "Enquiries", type: "standard",
      when: "Someone asks how much membership costs",
      text: "Hello! [Your Name] from [Outlet] here! 💜\nThank you for your enquiry 😊\nOur membership rates range from $98 to $158/month, depending on the membership duration and any ongoing promotions.\nWe would love to invite you down for a quick club tour so we can show you around, understand your fitness goals, and recommend the best membership option for you. 😊\nWhat day and time works best for you? I'd be happy to arrange a visit! 💪😊",
    },
    {
      key: "/MembershipEnq", cat: "Enquiries", type: "standard",
      when: "Someone asks about joining (interchangeable with /ratesenquiry)",
      text: "Hi there!\n[Your Name] from [Outlet] here. Thanks for your interest in our membership! 💜\nWe'd love to invite you for a free club tour and trial: 10AM to 8PM on weekdays, or 12PM to 5PM on weekends.\nJust let us know when you'd like to drop by! Remember to wear gym attire with closed-toe shoes and bring a towel.\nSee you soon! 💪😊",
    },
    {
      key: "/DetailedRatesEnq", cat: "Enquiries", type: "standard",
      when: "Someone wants the full price breakdown",
      pending: "CONFIRM #14",
      text: "Thanks for reaching out! 😊\nWe have a range of membership options depending on how long you'd like to commit:\n💪 Membership Options\n1 Month: $158/month\n6 Months: $138/month\n12 Months: $118/month\n18 Months: $108/month ⭐ Best Value\n🎓 Student / Senior Package\n12 Months: $98/month\n✨ All memberships come with:\n24/7 access to our club\nAccess to [number] Anytime Fitness clubs across Singapore\nAccess to thousands of Anytime Fitness clubs worldwide\nExclusive Purple Perks member discounts with partners such as Guzman y Gomez, Lift Supplements, Lift Onyx, and many more\n📌 One-Time Admin Fees\nEnrolment Fee: $95 (waived for Student/Senior memberships)\nAccess Pass Fee: $95\nThe longer the commitment, the lower your monthly rate, with our 18-month membership offering the best value at just $108/month.\nLet me know which option interests you, and I'll be happy to answer any questions or help you get started! 😊",
    },
    {
      key: "/Trialupdated", cat: "Trials", type: "standard",
      when: "A trial request comes in from the AF website",
      text: "Hi [NAME]! 👋\n[Your Name] from [Outlet] here 💜\nThank you for your trial request! We're excited to have you visit us 😊\nOur trial hours are 10:00AM to 8:00PM on weekdays and 12:00PM to 5:00PM on weekends. Kindly come dressed in gym-appropriate attire and covered shoes 👟\nDuring your visit, we'll also be happy to show you around the club, share more about our facilities and membership options, and answer any questions you may have.\nCould you let us know your preferred day and time for the trial? We'll make the necessary arrangements for you.\nLooking forward to welcoming you to the club! 💪😊",
    },
    {
      key: "/Trialfollowup", cat: "Trials", type: "standard",
      when: "Following up after a trial, within 3 days",
      text: "Hello there! [Your Name] from [Outlet Short] here 💜 Hope you had a good workout with us during your trial the other day 💪\nJust checking in to see how you're feeling about signing up with us. No pressure at all, and I'm happy to help if you have any questions!",
    },
    {
      key: "/Onlinesignup", cat: "Members", type: "standard",
      when: "A prospect wants to sign up without coming in. Remind them to delete card details afterwards.",
      text: "Great! 😊\nTo get your membership set up, kindly provide the following details:\nPersonal Details\nFull Name:\nResidential Address (Full Address):\nPostal Code:\nEmail Address:\nDate of Birth (DD/MM/YYYY):\nEmergency Contact\nName:\nContact Number:\nRelationship (e.g. Spouse, Parent, Friend):\nBilling Details\n16-Digit Credit/Debit Card Number:\nExpiry Date (MM/YY):\nName on Card:\nOnce we receive the above information, we'll prepare your membership accordingly.\nShould you have any questions during the process, feel free to let us know. We look forward to welcoming you to the [Outlet] family! 💜",
    },
    {
      key: "/Changecard", cat: "Members", type: "standard",
      when: "A member wants to update their card",
      pending: "CONFIRM #12, #13",
      text: "Hello, [Your Name] here from [Outlet Short]. You may change your card via these 3 options during our staff hours from [staff hours] daily:\n1. WhatsApp us your 16-digit card number and expiry date. You may delete your message afterwards;\n2. Call us to relay your card details; or\n3. Come down to the gym during staff hours to change your card.",
    },
    {
      key: "/SecondDeduction", cat: "Payments", type: "standard",
      when: "Late payment reminder, sent on the 7th of every month",
      text: "Greetings, [Your Name] here from [Outlet]! Do remember to make payment by today, as EZpay will be attempting a second deduction tonight. If it fails, a $15.26 late payment fee will be added. You can make payment to VPA: [Late VPA] and send us the screenshot so we can clear it on our side.",
    },
    {
      key: "/BundlePromo", cat: "Promotions", type: "promo",
      when: "Someone asks about the Duo or Trio bundle. Check the Promotions tab first.",
      pending: "CONFIRM #16",
      text: "Thanks for asking! 😊 We currently have two bundle promotions running:\n👥 DUO BUNDLE - 10% OFF (2 people signing up together)\n12 months: $106.20/month\n18 months: $97.20/month\n🎫 $95 Access Pass Fee\n✨ Joining Fee WAIVED\n👨‍👩‍👧 TRIO BUNDLE - 15% OFF (3 people signing up together)\n12 months: $100.30/month\n18 months: $91.80/month\n🎫 $95 Access Pass Fee\n✨ Joining Fee WAIVED\nWe'd love to have you all down for a club tour so we can show you around and get you started. What day and time works best? 💪😊",
    },
    {
      key: "/DuesReminder", cat: "Payments", type: "standard", draft: true, pending: "CONFIRM #1",
      when: "Members whose payment failed on the 1st (reminder before the 7th)",
      text: "Hi [NAME], [Your Name] here from [Outlet] 💜 Just a friendly reminder that your [Month] membership payment of $[Amount] didn't go through on the 1st. You can pay to VPA: [Late VPA] and send us the screenshot, or update your card during staff hours. Please settle it by the 7th to avoid a $15.26 late payment fee. Thank you! 😊",
    },
    {
      key: "/TrialReminder", cat: "Trials", type: "standard", draft: true,
      when: "The day before a booked trial",
      text: "Hi [NAME]! [Your Name] from [Outlet] here 💜 Just a reminder about your trial with us tomorrow. Please come in gym attire with covered shoes and bring a towel 👟 See you then! 💪😊",
    },
    {
      key: "/TrialNoSign", cat: "Trials", type: "standard", draft: true,
      when: "The day after a trial or tour that didn't end in a sign-up. Find out what they're looking for.",
      text: "Hi [NAME]! [Your Name] from [Outlet Short] here 💜 Thanks again for coming down to train with us! We'd love to hear how you found the club. Was there anything you were looking for that we didn't get to show you, or anything holding you back? Happy to help with any questions 😊",
    },
    {
      key: "/TrialFriends", cat: "Promotions", type: "promo", draft: true, pending: "CONFIRM #16",
      when: "Someone trialled with friends and isn't keen yet. Check the bundle is still running.",
      text: "Hi [NAME]! [Your Name] from [Outlet Short] here 💜 Great having you and your friends in for a workout! If you're thinking of training together, we have a bundle promotion running: sign up as a Duo (10% off) or Trio (15% off) and the joining fee is waived. Let me know if you'd like the details! 💪😊",
    },
    {
      key: "/Reengage", cat: "Enquiries", type: "standard", draft: true,
      when: "An enquiry or trial that has gone quiet. Add the current promotion if there is one.",
      text: "Hi [NAME]! [Your Name] from [Outlet] here 💜 Just checking in: are you still thinking about starting at the gym? We'd love to have you down for a free club tour and trial whenever it suits you. Let me know a day and time that works! 😊",
    },
    {
      key: "/WelcomeReview", cat: "Members", type: "standard", draft: true,
      when: "The day after someone signs up",
      text: "Hi [NAME]! [Your Name] from [Outlet] here 💜 Welcome to the club! We hope your first sessions have been great 💪 If you've enjoyed it so far, we'd really appreciate a quick Google review. It helps us a lot! [Google review link]\nLet us know if there's anything you need 😊",
    },
    {
      key: "/PTOffer", cat: "Members", type: "standard", draft: true,
      when: "About a week after someone signs up",
      text: "Hi [NAME]! [Your Name] from [Outlet Short] here 💜 How's your training going? If you'd like help reaching your goals faster, our personal trainers can put together a plan for you. Would you be keen to try a PT session? 😊",
    },
    {
      key: "/ReferFriend", cat: "Members", type: "standard", draft: true,
      when: "About two weeks after someone signs up",
      text: "Hi [NAME]! [Your Name] from [Outlet Short] here 💜 Hope you're enjoying the club! Know someone who'd like to train with you? Bring them down for a free tour and trial: 10AM to 8PM on weekdays, 12PM to 5PM on weekends 😊",
    },
  ],

  // Onboarding plan, grouped by the shift a milestone is due.
  // `ask` is a question the trainee can type into the NotebookLM notebook to
  // study that topic. `test: true` means the trainer tests it, not just shows it.
  onboarding: [
    {
      stage: "Shift 1",
      items: [
        { id: "uniform", text: "Uniform issued", owner: "Manager" },
        { id: "discord", text: "Responding to Discord roll calls", ask: "How do I respond to a roll call on Discord?" },
        { id: "handover", text: "Handover reports: admin work to hand over, upcoming trials and tours", ask: "What goes into a handover report?" },
        { id: "conduct", text: "Code of conduct, key people, rank structure", owner: "Manager" },
        { id: "rapid", text: "Rapid reporting: lateness, MCs, swaps, incidents", ask: "What do I do if I can't make it for my shift?" },
        { id: "roster", text: "Reading the roster and updating the logsheet", ask: "What do I write in the logsheet Remarks column?" },
        { id: "emergency", text: "Emergency protocol: panel, lanyard, shower buttons, alarm reset", ask: "What do I do if an emergency button is pressed?" },
        { id: "tnc-intro", text: "Membership T&Cs explained (must be able to explain them)", ask: "Explain the 30-day notice rule for freezes and cancellations." },
        { id: "tour-demo", text: "Watched a gym tour demonstration", ask: "Walk me through the 7 steps of a gym tour." },
        { id: "prospect-list", text: "Prospect and Trial list: colour codes, logging enquiries, follow-up dates", ask: "When do I follow up with a prospect who hasn't replied?" },
        { id: "pricing-intro", text: "Membership pricing explained (to memorise)", ask: "Quiz me on membership rates and admin fees." },
        { id: "greetings", text: "Customer service: greetings, approaching people at the door", ask: "What's the standard walk-in greeting?" },
        { id: "cleanliness", text: "Cleanliness checks: timings, standard, Discord photos", ask: "What are the cleanliness check timings on a closing shift?" },
        { id: "grounds", text: "Walking the grounds" },
        { id: "stock", text: "Stock count: where amenities are kept, how to count" },
        { id: "maint", text: "Equipment checks and Out of Order process", ask: "A member says a machine is making a grinding noise. What do I do?" },
      ],
    },
    {
      stage: "First opening / closing shift",
      items: [
        { id: "open-report", text: "Opening report: what to include", ask: "What do I do on an opening shift?" },
        { id: "tailgate", text: "Tailgating report: what to include" },
        { id: "close-report", text: "Closing report and EOD: what to include", ask: "What does each field in the EOD report mean?" },
      ],
    },
    {
      stage: "Shift 2",
      items: [
        { id: "rules", text: "Gym rules and regulations", ask: "Quiz me on the gym rules and regulations." },
        { id: "tour-rp1", text: "Role play: conducting a gym tour", test: true },
      ],
    },
    {
      stage: "Shift 3",
      items: [
        { id: "njm", text: "NJM sign-up on Membr, Google Form and DSR NJM list", ask: "How do I sign up a new member in the club system?" },
        { id: "sched-closer", text: "Scheduler vs closer, finding the scheduler on the Prospect list" },
        { id: "payment", text: "First payment options: scan and pay, or card" },
      ],
    },
    {
      stage: "Shift 4",
      items: [
        { id: "tnc-test", text: "Tested: explaining the membership T&Cs", test: true },
        { id: "which-plan", text: "Asking the right questions to pick the right membership", ask: "A student wants the cheapest option. What do I offer?" },
        { id: "pricing-test", text: "Tested: membership pricing", test: true },
      ],
    },
    {
      stage: "Shift 5",
      items: [
        { id: "emails", text: "Replying to emails: signature, pinning, vetting freeze and cancel emails", ask: "What must I do before sending a freeze email?" },
        { id: "tour-rp2", text: "Role play: gym tour and tailoring the membership offered", test: true },
      ],
    },
    {
      stage: "Shift 6 to 8",
      items: [
        { id: "pt-intro", text: "PT packages and pricing introduced (to memorise)" },
        { id: "pt-test", text: "Tested: PT pricing (shift 8)", test: true },
        { id: "pt-when", text: "When to upsell PT packages (shift 8)" },
      ],
    },
    {
      stage: "Shift 15",
      items: [
        { id: "pt-upsell", text: "Tested: upselling PT packages", test: true },
      ],
    },
    {
      stage: "End of week 2",
      items: [
        { id: "checkin", text: "Check-in with manager: what's still unclear, what needs more time", owner: "Manager" },
        { id: "objections", text: "Handling rejections and getting prospects on a call", ask: "A prospect says it's too expensive. How do I respond?" },
      ],
    },
  ],
};
