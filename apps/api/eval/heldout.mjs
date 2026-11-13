// Held-out set: 100 hand-written messages in wordings NOT used to tune the rules.
// Run with: node eval/run.mjs --set=heldout
// Same label conventions as dataset.mjs (undefined = not checked, null = must be empty).
const T = (group, text, expect) => ({ group, pattern: 0, text, expect });

export const HELDOUT = [
  // REFUND
  T('REFUND', 'Bhai Flipkart ne abhi tak mera 1800 ka refund nahi bheja', { isCommitment: true, category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: 'Flipkart', amountMinor: 180000 }),
  T('REFUND', 'The airline said my ticket refund of Rs 6,200 will reach my card in 10 working days.', { isCommitment: true, category: 'REFUND', waitingOn: 'OTHER_PARTY', amountMinor: 620000, deadlineKind: 'ESTIMATED' }),
  T('REFUND', 'Returned the shoes to Snitch last week, still no refund.', { isCommitment: true, category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: 'Snitch' }),
  T('REFUND', 'Dear customer, Rs. 349 has been refunded to your original payment method. - Licious', { isCommitment: false, category: 'REFUND', counterparty: 'Licious', amountMinor: 34900 }),
  T('REFUND', 'Got the Zomato refund for the cancelled order.', { isCommitment: false, category: 'REFUND', counterparty: 'Zomato' }),
  T('REFUND', 'Need to raise a refund request with Wakefit for the mattress, they charged me twice.', { isCommitment: true, category: 'REFUND', waitingOn: 'USER', counterparty: 'Wakefit' }),
  T('REFUND', 'Refund status for order 5512: processing. Expected by 22 Nov.', { isCommitment: true, category: 'REFUND', waitingOn: 'OTHER_PARTY', deadlineKind: 'EXPLICIT' }),
  T('REFUND', 'My Uber refund of ₹180 is still not showing in the wallet', { isCommitment: true, category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: 'Uber', amountMinor: 18000 }),
  T('REFUND', 'IRCTC TDR filed for the missed train, refund pending', { isCommitment: true, category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: 'IRCTC' }),
  T('REFUND', 'Cashback of ₹50 credited to your Paytm wallet.', { isCommitment: false, amountMinor: 5000 }),

  // PAYMENT
  T('PAYMENT', 'School fees of ₹18,500 have to be paid before 30 Nov.', { isCommitment: true, category: 'PAYMENT', waitingOn: 'USER', amountMinor: 1850000, deadlineKind: 'EXPLICIT' }),
  T('PAYMENT', 'Reminder: your LIC premium of Rs 12,000 is due next week.', { isCommitment: true, category: 'PAYMENT', waitingOn: 'USER', counterparty: 'LIC', amountMinor: 1200000, deadlineKind: 'ESTIMATED' }),
  T('PAYMENT', 'Freelance client from Pune still owes me 25k for the logo work.', { isCommitment: true, category: 'PAYMENT', waitingOn: 'OTHER_PARTY' }),
  T('PAYMENT', 'Paid the maid ₹6000 for November.', { isCommitment: false, amountMinor: 600000 }),
  T('PAYMENT', 'Mobile recharge expires tomorrow, need to recharge.', { isCommitment: true, waitingOn: 'USER', deadlineKind: 'EXPLICIT' }),
  T('PAYMENT', 'Society maintenance of Rs 3,500 pending for this month.', { isCommitment: true, category: 'PAYMENT', amountMinor: 350000 }),
  T('PAYMENT', 'Rohit will transfer the 2000 for dinner tonight.', { isCommitment: true, waitingOn: 'OTHER_PARTY', counterparty: 'Rohit' }),
  T('PAYMENT', 'Your BESCOM electricity bill of Rs 1,140 is generated. Pay by 25-11-2026 to avoid late fee.', { isCommitment: true, category: 'PAYMENT', waitingOn: 'USER', counterparty: 'BESCOM', amountMinor: 114000, deadlineKind: 'EXPLICIT' }),
  T('PAYMENT', 'Transaction successful! ₹999 paid to Netflix.', { isCommitment: false, category: 'PAYMENT', counterparty: 'Netflix', amountMinor: 99900 }),
  T('PAYMENT', 'Ghar ka kiraya 15000 dena hai 5 tareekh tak', { isCommitment: true, category: 'PAYMENT', waitingOn: 'USER' }),

  // REPAIR
  T('REPAIR', 'AC not cooling, Voltas engineer visit fixed for Thursday morning.', { isCommitment: true, category: 'REPAIR', counterparty: 'Voltas', deadlineKind: 'EXPLICIT' }),
  T('REPAIR', 'Gave my scooter for servicing at Honda, they will call when ready.', { isCommitment: true, category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: 'Honda' }),
  T('REPAIR', 'Geyser still leaking even after the plumber came twice.', { isCommitment: true, category: 'REPAIR', counterparty: null }),
  T('REPAIR', 'iPhone screen replaced at the Apple store, works fine now.', { isCommitment: false, counterparty: 'Apple' }),
  T('REPAIR', 'Laptop motherboard part is on order, service center will update in 4-5 days.', { isCommitment: true, category: 'REPAIR', waitingOn: 'OTHER_PARTY', deadlineKind: 'ESTIMATED' }),
  T('REPAIR', 'Need to call the electrician about the broken fan.', { isCommitment: true, waitingOn: 'USER' }),
  T('REPAIR', 'Samsung fridge repair done, paid 2,300 for the compressor.', { isCommitment: false, category: 'REPAIR', counterparty: 'Samsung' }),
  T('REPAIR', 'Washing machine wala kal aayega theek karne', { isCommitment: true, category: 'REPAIR', waitingOn: 'OTHER_PARTY' }),
  T('REPAIR', 'Car is at the Maruti workshop since Monday, waiting for the estimate.', { isCommitment: true, waitingOn: 'OTHER_PARTY', counterparty: 'Maruti' }),
  T('REPAIR', 'The OnePlus service centre says my phone will be ready by Saturday.', { isCommitment: true, category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: 'OnePlus', deadlineKind: 'EXPLICIT' }),

  // DELIVERY
  T('DELIVERY', 'Where is my Nykaa order? It said 3-day delivery and it has been a week.', { isCommitment: true, category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: 'Nykaa' }),
  T('DELIVERY', 'Your Blinkit order is arriving in 8 minutes', { isCommitment: true, category: 'DELIVERY', counterparty: 'Blinkit' }),
  T('DELIVERY', 'Package delivered to the security guard at 6:40 PM.', { isCommitment: false, category: 'DELIVERY' }),
  T('DELIVERY', 'Amazon says the TV will be delivered and installed on 19 Nov.', { isCommitment: true, category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: 'Amazon', deadlineKind: 'EXPLICIT' }),
  T('DELIVERY', 'Courier guy called, will drop the parcel after 5 pm today.', { isCommitment: true, category: 'DELIVERY', waitingOn: 'OTHER_PARTY' }),
  T('DELIVERY', 'Myntra shipment delayed due to weather, new date not shared.', { isCommitment: true, category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: 'Myntra', deadlineKind: null }),
  T('DELIVERY', 'Received the IKEA sofa today, assembly also done.', { isCommitment: false, category: 'DELIVERY', counterparty: 'IKEA' }),
  T('DELIVERY', 'Mamaearth order dispatched, tracking id MM884123.', { isCommitment: true, category: 'DELIVERY', counterparty: 'Mamaearth' }),
  T('DELIVERY', 'Need to be home tomorrow between 10 and 1 for the furniture delivery.', { isCommitment: true, category: 'DELIVERY', waitingOn: 'USER', deadlineKind: 'EXPLICIT' }),
  T('DELIVERY', 'Swiggy Instamart order abhi tak nahi pahuncha', { isCommitment: true, category: 'DELIVERY', counterparty: 'Swiggy' }),

  // APPOINTMENT
  T('APPOINTMENT', 'Eye check-up at Lenskart store on Sunday 11am', { isCommitment: true, category: 'APPOINTMENT', waitingOn: 'USER', counterparty: 'Lenskart', deadlineKind: 'EXPLICIT' }),
  T('APPOINTMENT', 'Parent-teacher meeting at school this Saturday 9:30 am.', { isCommitment: true, category: 'APPOINTMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' }),
  T('APPOINTMENT', 'Your test drive with Tata Motors is booked for 21/11/2026 at 4 PM.', { isCommitment: true, category: 'APPOINTMENT', waitingOn: 'USER', counterparty: 'Tata Motors', deadlineKind: 'EXPLICIT' }),
  T('APPOINTMENT', 'Blood test tomorrow 8 am, fasting needed.', { isCommitment: true, waitingOn: 'USER', deadlineKind: 'EXPLICIT' }),
  T('APPOINTMENT', 'Call with the bank relationship manager on Monday at 3pm.', { isCommitment: true, waitingOn: 'USER', deadlineKind: 'EXPLICIT' }),
  T('APPOINTMENT', 'RTO slot for driving licence test: 24 Nov, 10:15 AM.', { isCommitment: true, category: 'APPOINTMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' }),
  T('APPOINTMENT', 'Physio session with Dr Rao moved to Thursday.', { isCommitment: true, category: 'APPOINTMENT', counterparty: 'Rao', deadlineKind: 'EXPLICIT' }),
  T('APPOINTMENT', 'Went for the visa interview yesterday, it went well.', { isCommitment: false, category: 'APPOINTMENT' }),
  T('APPOINTMENT', 'Kal 11 baje bank jana hai KYC ke liye', { isCommitment: true, waitingOn: 'USER' }),
  T('APPOINTMENT', 'Zoom call with the Razorpay team tomorrow at 10:30 am', { isCommitment: true, waitingOn: 'USER', counterparty: 'Razorpay', deadlineKind: 'EXPLICIT' }),

  // SERVICE_REQUEST
  T('SERVICE_REQUEST', 'Gas cylinder booked with Indane, booking number 88213, delivery awaited.', { isCommitment: true, waitingOn: 'OTHER_PARTY', counterparty: 'Indane' }),
  T('SERVICE_REQUEST', 'Airtel says the new connection will be activated in 24 hours.', { isCommitment: true, waitingOn: 'OTHER_PARTY', counterparty: 'Airtel', deadlineKind: 'ESTIMATED' }),
  T('SERVICE_REQUEST', 'Logged a ticket on the Swiggy app about the missing item, no reply yet.', { isCommitment: true, category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: 'Swiggy' }),
  T('SERVICE_REQUEST', 'Your request to update mobile number has been completed successfully.', { isCommitment: false }),
  T('SERVICE_REQUEST', 'BBMP complaint about the streetlight, ref 7719, still not attended.', { isCommitment: true, category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: 'BBMP' }),
  T('SERVICE_REQUEST', 'Jio customer care promised a callback within 2 hours.', { isCommitment: true, waitingOn: 'OTHER_PARTY', counterparty: 'Jio', deadlineKind: 'ESTIMATED' }),
  T('SERVICE_REQUEST', 'Need to file a complaint with the consumer forum about the faulty TV.', { isCommitment: true, waitingOn: 'USER' }),
  T('SERVICE_REQUEST', 'HDFC chargeback request raised for the fraud transaction, takes 45 days.', { isCommitment: true, waitingOn: 'OTHER_PARTY', counterparty: 'HDFC', deadlineKind: 'ESTIMATED' }),
  T('SERVICE_REQUEST', 'Water purifier AMC renewal request with Kent is under review.', { isCommitment: true, waitingOn: 'OTHER_PARTY', counterparty: 'Kent' }),
  T('SERVICE_REQUEST', 'Bank ne bola account unfreeze 3 din me ho jayega', { isCommitment: true, waitingOn: 'OTHER_PARTY', deadlineKind: 'ESTIMATED' }),

  // DOCUMENT
  T('DOCUMENT', 'Send scanned marksheets to the university admission office by Friday', { isCommitment: true, category: 'DOCUMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' }),
  T('DOCUMENT', 'CA will share the ITR acknowledgement once filed.', { isCommitment: true, waitingOn: 'OTHER_PARTY' }),
  T('DOCUMENT', 'Landlord still has not sent the rent receipts for HRA.', { isCommitment: true, waitingOn: 'OTHER_PARTY' }),
  T('DOCUMENT', 'Got the police verification certificate today.', { isCommitment: false, category: 'DOCUMENT' }),
  T('DOCUMENT', 'Passport renewal: need to book PSK appointment and carry old passport.', { isCommitment: true, waitingOn: 'USER' }),
  T('DOCUMENT', 'Sunita will courier the original documents on Monday.', { isCommitment: true, waitingOn: 'OTHER_PARTY', counterparty: 'Sunita', deadlineKind: 'EXPLICIT' }),
  T('DOCUMENT', 'Insurance company asked for the FIR copy, must upload in 7 days.', { isCommitment: true, waitingOn: 'USER', deadlineKind: 'ESTIMATED' }),
  T('DOCUMENT', 'Birth certificate correction application is pending at the municipal office.', { isCommitment: true, category: 'DOCUMENT', waitingOn: 'OTHER_PARTY' }),
  T('DOCUMENT', 'Salary slips bhejne hai HR ko aaj', { isCommitment: true, waitingOn: 'USER' }),
  T('DOCUMENT', 'Signed and returned the offer letter to Infosys.', { isCommitment: false, counterparty: 'Infosys' }),

  // REIMBURSEMENT
  T('REIMBURSEMENT', 'Cab bills worth 2,340 submitted on the expense portal, awaiting approval.', { isCommitment: true, waitingOn: 'OTHER_PARTY' }),
  T('REIMBURSEMENT', 'Company still hasnt paid back the conference fee I paid from my pocket.', { isCommitment: true, waitingOn: 'OTHER_PARTY' }),
  T('REIMBURSEMENT', 'Health insurance claim rejected, need to appeal with more documents.', { isCommitment: true, waitingOn: 'USER' }),
  T('REIMBURSEMENT', 'LTA reimbursement of ₹30,000 credited with this month salary.', { isCommitment: false, category: 'REIMBURSEMENT', amountMinor: 3000000 }),
  T('REIMBURSEMENT', 'Upload hotel invoices for the Delhi trip claim before month end.', { isCommitment: true, waitingOn: 'USER' }),
  T('REIMBURSEMENT', 'Star Health cashless approval pending for dad\'s surgery.', { isCommitment: true, waitingOn: 'OTHER_PARTY', counterparty: 'Star Health' }),
  T('REIMBURSEMENT', 'Phone bill reimbursement ka paisa abhi tak nahi aaya', { isCommitment: true, category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY' }),
  T('REIMBURSEMENT', 'Finance team said the relocation allowance will be processed in the next payroll.', { isCommitment: true, waitingOn: 'OTHER_PARTY' }),
  T('REIMBURSEMENT', 'Claim number CL-55231 for Rs 8,000 approved and paid.', { isCommitment: false, amountMinor: 800000 }),
  T('REIMBURSEMENT', 'Need manager sign-off on my travel claim of 4,500 by Wednesday.', { isCommitment: true, waitingOn: 'USER', deadlineKind: 'EXPLICIT' }),

  // PERSONAL_PROMISE
  T('PERSONAL_PROMISE', 'Mehul borrowed my drill last month and hasnt given it back.', { isCommitment: true, waitingOn: 'OTHER_PARTY', counterparty: 'Mehul' }),
  T('PERSONAL_PROMISE', 'Promised mom I will book her train tickets this weekend.', { isCommitment: true, waitingOn: 'USER' }),
  T('PERSONAL_PROMISE', 'Divya said she would introduce me to her manager next week.', { isCommitment: true, waitingOn: 'OTHER_PARTY', counterparty: 'Divya', deadlineKind: 'ESTIMATED' }),
  T('PERSONAL_PROMISE', 'Owe Sameer 1,200 for the movie tickets, pay him back on Friday.', { isCommitment: true, waitingOn: 'USER', counterparty: 'Sameer', deadlineKind: 'EXPLICIT' }),
  T('PERSONAL_PROMISE', 'Rakesh gave back the 5000 he borrowed.', { isCommitment: false, counterparty: 'Rakesh' }),
  T('PERSONAL_PROMISE', 'Ananya will drop off the keys tonight.', { isCommitment: true, waitingOn: 'OTHER_PARTY', counterparty: 'Ananya', deadlineKind: 'EXPLICIT' }),
  T('PERSONAL_PROMISE', 'Bhaiya bole the laptop wapas kar denge Sunday tak', { isCommitment: true, waitingOn: 'OTHER_PARTY' }),
  T('PERSONAL_PROMISE', 'Remind Tanvi about the 3000 she owes me.', { isCommitment: true, waitingOn: 'OTHER_PARTY', counterparty: 'Tanvi' }),
  T('PERSONAL_PROMISE', 'I told Farhan I would review his resume by tomorrow.', { isCommitment: true, waitingOn: 'USER', counterparty: 'Farhan', deadlineKind: 'EXPLICIT' }),
  T('PERSONAL_PROMISE', 'Neeraj returned my car, all fine.', { isCommitment: false, counterparty: 'Neeraj' }),

  // INFORMATIONAL
  T('INFORMATIONAL', 'Your Swiggy One membership has been renewed. Enjoy free deliveries!', { isCommitment: false }),
  T('INFORMATIONAL', '₹2,000 debited from your account via UPI. Avl bal ₹14,203.', { isCommitment: false, deadlineKind: null }),
  T('INFORMATIONAL', 'Big Billion Days start on Friday! Up to 80% off on electronics.', { isCommitment: false }),
  T('INFORMATIONAL', 'Good morning! Have a great day ahead.', { isCommitment: false, counterparty: null, amountMinor: null, deadlineKind: null }),
  T('INFORMATIONAL', 'Your Uber trip receipt: ₹243 for your ride on Tuesday.', { isCommitment: false }),
  T('INFORMATIONAL', 'New login to your Google account from a Windows device.', { isCommitment: false, deadlineKind: null }),
  T('INFORMATIONAL', 'Your order from Zomato has been placed and is being prepared.', { isCommitment: false }),
  T('INFORMATIONAL', 'Electricity supply will be interrupted tomorrow from 10 am to 2 pm for maintenance.', { isCommitment: false }),
  T('INFORMATIONAL', 'The meeting notes from today are attached for reference.', { isCommitment: false, deadlineKind: null }),
  T('INFORMATIONAL', 'Thanks for rating your Rapido ride! See you again.', { isCommitment: false }),
];
