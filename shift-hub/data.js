// AFO Shift Hub — content config.
// Everything the dashboard shows comes from this file, taken from the
// AFO Staff Handbook (v2) and the onboarding plan. The manager can edit it
// in any text editor; no code changes are needed.
//
// Items marked `pending: "CONFIRM #n"` are still open in the handbook's
// manager checklist. The dashboard shows them with a "pending" badge.

window.AFO = {
  club: {
    name: "Anytime Fitness Orchard",
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
        { id: "eod", text: "Post the EOD report in Discord (copy from the EOD Log tab)" },
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

  // Lead follow-up rules (handbook 4.6). Days are offsets from the event date.
  followUpRules: [
    { id: "enquiry", label: "New enquiry, no reply yet", steps: [{ d: 2, note: "Follow-up message (day 2 to 3)" }, { d: 5, note: "Final check-in (day 5 to 7)" }, { d: 14, note: "Re-engagement message (after 2 weeks)" }] },
    { id: "tour", label: "Toured, no sale", steps: [{ d: 2, note: "Follow up within 48 to 72 hours" }] },
    { id: "trial", label: "Did a trial", steps: [{ d: 3, note: "Follow up within 3 days (/Trialfollowup)" }] },
  ],

  // WhatsApp shortcuts (handbook sections 7 and 13).
  // [Your Name] is filled from Settings; [NAME] is typed per message.
  scripts: [
    {
      key: "/ratesenquiry",
      when: "Someone asks how much membership costs",
      text: "Hello! [Your Name] from Anytime Fitness Orchard here! 💜\nThank you for your enquiry 😊\nOur membership rates range from $98 to $158/month, depending on the membership duration and any ongoing promotions.\nWe would love to invite you down for a quick club tour so we can show you around, understand your fitness goals, and recommend the best membership option for you. 😊\nWhat day and time works best for you? I'd be happy to arrange a visit! 💪😊",
    },
    {
      key: "/MembershipEnq",
      when: "Someone asks about joining (interchangeable with /ratesenquiry)",
      text: "Hi there!\n[Your Name] from Anytime Fitness Orchard here. Thanks for your interest in our membership! 💜\nWe'd love to invite you for a free club tour and trial: 10AM to 8PM on weekdays, or 12PM to 5PM on weekends.\nJust let us know when you'd like to drop by! Remember to wear gym attire with closed-toe shoes and bring a towel.\nSee you soon! 💪😊",
    },
    {
      key: "/DetailedRatesEnq",
      when: "Someone wants the full price breakdown",
      pending: "CONFIRM #14",
      text: "Thanks for reaching out! 😊\nWe have a range of membership options depending on how long you'd like to commit:\n💪 Membership Options\n1 Month: $158/month\n6 Months: $138/month\n12 Months: $118/month\n18 Months: $108/month ⭐ Best Value\n🎓 Student / Senior Package\n12 Months: $98/month\n✨ All memberships come with:\n24/7 access to our club\nAccess to [number] Anytime Fitness clubs across Singapore\nAccess to thousands of Anytime Fitness clubs worldwide\nExclusive Purple Perks member discounts with partners such as Guzman y Gomez, Lift Supplements, Lift Onyx, and many more\n📌 One-Time Admin Fees\nEnrolment Fee: $95 (waived for Student/Senior memberships)\nAccess Pass Fee: $95\nThe longer the commitment, the lower your monthly rate, with our 18-month membership offering the best value at just $108/month.\nLet me know which option interests you, and I'll be happy to answer any questions or help you get started! 😊",
    },
    {
      key: "/Trialupdated",
      when: "A trial request comes in from the AF website",
      text: "Hi [NAME]! 👋\n[Your Name] from Anytime Fitness Orchard here 💜\nThank you for your trial request! We're excited to have you visit us 😊\nOur trial hours are 10:00AM to 8:00PM on weekdays and 12:00PM to 5:00PM on weekends. Kindly come dressed in gym-appropriate attire and covered shoes 👟\nDuring your visit, we'll also be happy to show you around the club, share more about our facilities and membership options, and answer any questions you may have.\nCould you let us know your preferred day and time for the trial? We'll make the necessary arrangements for you.\nLooking forward to welcoming you to the club! 💪😊",
    },
    {
      key: "/Trialfollowup",
      when: "Following up after a trial, within 3 days",
      text: "Hello there! [Your Name] from AF Orchard here 💜 Hope you had a good workout with us during your trial the other day 💪\nJust checking in to see how you're feeling about signing up with us. No pressure at all, and I'm happy to help if you have any questions!",
    },
    {
      key: "/Onlinesignup",
      when: "A prospect wants to sign up without coming in. Remind them to delete card details afterwards.",
      text: "Great! 😊\nTo get your membership set up, kindly provide the following details:\nPersonal Details\nFull Name:\nResidential Address (Full Address):\nPostal Code:\nEmail Address:\nDate of Birth (DD/MM/YYYY):\nEmergency Contact\nName:\nContact Number:\nRelationship (e.g. Spouse, Parent, Friend):\nBilling Details\n16-Digit Credit/Debit Card Number:\nExpiry Date (MM/YY):\nName on Card:\nOnce we receive the above information, we'll prepare your membership accordingly.\nShould you have any questions during the process, feel free to let us know. We look forward to welcoming you to the Anytime Fitness Orchard family! 💜",
    },
    {
      key: "/Changecard",
      when: "A member wants to update their card",
      pending: "CONFIRM #12, #13",
      text: "Hello, [Your Name] here from AF Orchard. You may change your card via these 3 options during our staff hours from [staff hours] daily:\n1. WhatsApp us your 16-digit card number and expiry date. You may delete your message afterwards;\n2. Call us to relay your card details; or\n3. Come down to the gym during staff hours to change your card.",
    },
    {
      key: "/SecondDeduction",
      when: "Late payment reminder, sent on the 7th of every month",
      text: "Greetings, [Your Name] here from Anytime Fitness Orchard! Do remember to make payment by today, as EZpay will be attempting a second deduction tonight. If it fails, a $15.26 late payment fee will be added. You can make payment to VPA: UEN202106218Z (Watchtower Gyms) and send us the screenshot so we can clear it on our side.",
    },
    {
      key: "/BundlePromo",
      when: "Someone asks about the Duo or Trio bundle. Check the Promotions tab first.",
      pending: "CONFIRM #16",
      text: "Thanks for asking! 😊 We currently have two bundle promotions running:\n👥 DUO BUNDLE - 10% OFF (2 people signing up together)\n12 months: $106.20/month\n18 months: $97.20/month\n🎫 $95 Access Pass Fee\n✨ Joining Fee WAIVED\n👨‍👩‍👧 TRIO BUNDLE - 15% OFF (3 people signing up together)\n12 months: $100.30/month\n18 months: $91.80/month\n🎫 $95 Access Pass Fee\n✨ Joining Fee WAIVED\nWe'd love to have you all down for a club tour so we can show you around and get you started. What day and time works best? 💪😊",
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
