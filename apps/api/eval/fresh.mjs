// Second untouched set (60 messages), written after the rule fixes and never used for tuning.
// Run with: node eval/run.mjs --set=fresh
const T = (group, text, expect) => ({ group, pattern: 0, text, expect });

export const FRESH = [
  T('REFUND', 'Ajio refund for the returned jeans (₹1,099) not reflected in my bank yet', { isCommitment: true, category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: 'Ajio', amountMinor: 109900 }),
  T('REFUND', 'Booking cancelled. Rs 2,850 will be refunded to your UPI within 3-5 days. - Goibibo', { isCommitment: true, category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: 'Goibibo', amountMinor: 285000, deadlineKind: 'ESTIMATED' }),
  T('REFUND', 'Finally got my Myntra refund of 640 rupees', { isCommitment: false, category: 'REFUND', counterparty: 'Myntra', amountMinor: 64000 }),
  T('REFUND', 'Zepto ne galat item bheja, refund ka wait kar raha hu', { isCommitment: true, category: 'REFUND', waitingOn: 'OTHER_PARTY', counterparty: 'Zepto' }),
  T('REFUND', 'Chase Croma for the ₹4,999 refund on Monday if it has not come.', { isCommitment: true, category: 'REFUND', waitingOn: 'USER', counterparty: 'Croma', amountMinor: 499900 }),
  T('REFUND', 'MakeMyTrip processed the hotel refund today.', { isCommitment: false, category: 'REFUND', counterparty: 'MakeMyTrip' }),

  T('PAYMENT', 'Water bill ₹480 due on 28 Nov', { isCommitment: true, category: 'PAYMENT', waitingOn: 'USER', amountMinor: 48000, deadlineKind: 'EXPLICIT' }),
  T('PAYMENT', 'Ankit has not paid his share of the rent yet.', { isCommitment: true, waitingOn: 'OTHER_PARTY', counterparty: 'Ankit' }),
  T('PAYMENT', 'Pay the gym membership renewal of Rs 7,500 before Sunday.', { isCommitment: true, waitingOn: 'USER', amountMinor: 750000, deadlineKind: 'EXPLICIT' }),
  T('PAYMENT', 'Your HDFC credit card bill of ₹12,430 has been paid. Thank you.', { isCommitment: false, counterparty: 'HDFC', amountMinor: 1243000 }),
  T('PAYMENT', 'Office says October salary will be credited by 7th.', { isCommitment: true, waitingOn: 'OTHER_PARTY', deadlineKind: 'EXPLICIT' }),
  T('PAYMENT', 'Insurance premium kal tak bharna hai', { isCommitment: true, waitingOn: 'USER', deadlineKind: 'EXPLICIT' }),

  T('REPAIR', 'Lenovo service center replaced the keyboard, laptop works fine now.', { isCommitment: false, category: 'REPAIR', counterparty: 'Lenovo' }),
  T('REPAIR', 'Microwave still not heating, need to book a repair visit.', { isCommitment: true, category: 'REPAIR', waitingOn: 'USER' }),
  T('REPAIR', 'The carpenter promised to fix the wardrobe door on Saturday.', { isCommitment: true, category: 'REPAIR', waitingOn: 'OTHER_PARTY', deadlineKind: 'EXPLICIT' }),
  T('REPAIR', 'Whirlpool technician visit booked, they will call before coming.', { isCommitment: true, category: 'REPAIR', waitingOn: 'OTHER_PARTY', counterparty: 'Whirlpool' }),
  T('REPAIR', 'Bike servicing at Hero showroom, pickup by 6 pm today', { isCommitment: true, category: 'REPAIR', counterparty: 'Hero' }),
  T('REPAIR', 'Inverter kharab hai, electrician ko bulana hai', { isCommitment: true, waitingOn: 'USER' }),

  T('DELIVERY', 'Decathlon order shipped, arriving by Thursday.', { isCommitment: true, category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: 'Decathlon', deadlineKind: 'EXPLICIT' }),
  T('DELIVERY', 'Order delayed again, Flipkart now says 25 Nov.', { isCommitment: true, category: 'DELIVERY', waitingOn: 'OTHER_PARTY', counterparty: 'Flipkart' }),
  T('DELIVERY', 'BigBasket groceries delivered, two items missing.', { isCommitment: true, counterparty: 'BigBasket' }),
  T('DELIVERY', 'Your Meesho package has been handed to the courier partner.', { isCommitment: true, category: 'DELIVERY', counterparty: 'Meesho' }),
  T('DELIVERY', 'Collect the parcel from the society gate before 9 pm.', { isCommitment: true, category: 'DELIVERY', waitingOn: 'USER' }),
  T('DELIVERY', 'Amazon parcel mil gaya, sab theek hai', { isCommitment: false, category: 'DELIVERY', counterparty: 'Amazon' }),

  T('APPOINTMENT', 'Pediatrician appointment for Aarav on Wednesday at 5:30 pm', { isCommitment: true, category: 'APPOINTMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' }),
  T('APPOINTMENT', 'Bank locker visit scheduled for 22 Nov.', { isCommitment: true, waitingOn: 'USER', deadlineKind: 'EXPLICIT' }),
  T('APPOINTMENT', 'Consultation with Dr. Menon got postponed, new date not given.', { isCommitment: true, category: 'APPOINTMENT', counterparty: 'Menon', deadlineKind: null }),
  T('APPOINTMENT', 'Attended the HR interview at Wipro today.', { isCommitment: false, category: 'APPOINTMENT', counterparty: 'Wipro' }),
  T('APPOINTMENT', 'Team lunch with Priyanka on Friday 1 pm', { isCommitment: true, waitingOn: 'USER', counterparty: 'Priyanka', deadlineKind: 'EXPLICIT' }),
  T('APPOINTMENT', 'Parso subah 10 baje dentist ke paas jana hai', { isCommitment: true, waitingOn: 'USER' }),

  T('SERVICE_REQUEST', 'Raised a request with Vi to port my number, waiting for the UPC code.', { isCommitment: true, waitingOn: 'OTHER_PARTY', counterparty: 'Vi' }),
  T('SERVICE_REQUEST', 'Complaint 44821 registered with Tata Power for the meter issue.', { isCommitment: true, category: 'SERVICE_REQUEST', waitingOn: 'OTHER_PARTY', counterparty: 'Tata Power' }),
  T('SERVICE_REQUEST', 'Your complaint has been resolved. Please rate us.', { isCommitment: false, category: 'SERVICE_REQUEST' }),
  T('SERVICE_REQUEST', 'ICICI said the card replacement will reach in 7 working days.', { isCommitment: true, waitingOn: 'OTHER_PARTY', counterparty: 'ICICI', deadlineKind: 'ESTIMATED' }),
  T('SERVICE_REQUEST', 'Must follow up with the Airtel store about the duplicate SIM.', { isCommitment: true, waitingOn: 'USER', counterparty: 'Airtel' }),
  T('SERVICE_REQUEST', 'Society office ne bola lift kal tak theek ho jayegi', { isCommitment: true, waitingOn: 'OTHER_PARTY' }),

  T('DOCUMENT', 'Need to get the rental agreement notarised this week.', { isCommitment: true, category: 'DOCUMENT', waitingOn: 'USER', deadlineKind: 'ESTIMATED' }),
  T('DOCUMENT', 'Waiting for the bank to send the loan closure letter.', { isCommitment: true, category: 'DOCUMENT', waitingOn: 'OTHER_PARTY' }),
  T('DOCUMENT', 'Uploaded all KYC documents, verification done.', { isCommitment: false, category: 'DOCUMENT' }),
  T('DOCUMENT', 'Manish will email the signed contract tomorrow.', { isCommitment: true, waitingOn: 'OTHER_PARTY', counterparty: 'Manish', deadlineKind: 'EXPLICIT' }),
  T('DOCUMENT', 'Submit the address proof to the society office by 30th.', { isCommitment: true, category: 'DOCUMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' }),
  T('DOCUMENT', 'University ne degree certificate abhi tak nahi bheja', { isCommitment: true, category: 'DOCUMENT', waitingOn: 'OTHER_PARTY' }),

  T('REIMBURSEMENT', 'Fuel reimbursement of ₹3,200 for October still pending with accounts.', { isCommitment: true, category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', amountMinor: 320000 }),
  T('REIMBURSEMENT', 'Need to submit the medical bills for the claim by Monday.', { isCommitment: true, category: 'REIMBURSEMENT', waitingOn: 'USER', deadlineKind: 'EXPLICIT' }),
  T('REIMBURSEMENT', 'Niva Bupa claim approved, amount will be credited in 5 days.', { isCommitment: true, category: 'REIMBURSEMENT', waitingOn: 'OTHER_PARTY', counterparty: 'Niva Bupa', deadlineKind: 'ESTIMATED' }),
  T('REIMBURSEMENT', 'Got the internet reimbursement in this payslip.', { isCommitment: false, category: 'REIMBURSEMENT' }),
  T('REIMBURSEMENT', 'Travel claim of Rs 9,400 rejected, must resubmit with boarding passes.', { isCommitment: true, waitingOn: 'USER', amountMinor: 940000 }),
  T('REIMBURSEMENT', 'Company ne abhi tak training ka paisa wapas nahi kiya', { isCommitment: true, waitingOn: 'OTHER_PARTY' }),

  T('PERSONAL_PROMISE', 'Kunal said he would send the wedding invite list tonight.', { isCommitment: true, waitingOn: 'OTHER_PARTY', counterparty: 'Kunal', deadlineKind: 'EXPLICIT' }),
  T('PERSONAL_PROMISE', 'I will return Riya\'s umbrella tomorrow.', { isCommitment: true, waitingOn: 'USER', counterparty: 'Riya', deadlineKind: 'EXPLICIT' }),
  T('PERSONAL_PROMISE', 'Lent my PS5 to Harsh, he will give it back after Diwali.', { isCommitment: true, waitingOn: 'OTHER_PARTY', counterparty: 'Harsh' }),
  T('PERSONAL_PROMISE', 'Aditi returned the 1500 she borrowed.', { isCommitment: false, counterparty: 'Aditi' }),
  T('PERSONAL_PROMISE', 'Told Simran I would help with her move on Sunday.', { isCommitment: true, waitingOn: 'USER', counterparty: 'Simran', deadlineKind: 'EXPLICIT' }),
  T('PERSONAL_PROMISE', 'Chacha ji ne bola tha documents kal bhej denge', { isCommitment: true, waitingOn: 'OTHER_PARTY' }),

  T('INFORMATIONAL', 'Your Amazon Prime membership renews on 1 Dec. No action needed.', { isCommitment: false }),
  T('INFORMATIONAL', 'Rs 1,500 credited to your account by NEFT. Avl bal Rs 22,410.', { isCommitment: false }),
  T('INFORMATIONAL', 'Weekend sale: buy 2 get 1 free at Ajio!', { isCommitment: false }),
  T('INFORMATIONAL', 'Happy birthday! Have a wonderful year ahead.', { isCommitment: false, counterparty: null, amountMinor: null, deadlineKind: null }),
  T('INFORMATIONAL', 'Your Ola ride with Suresh is complete. Fare ₹186.', { isCommitment: false }),
  T('INFORMATIONAL', 'Water supply will be off tomorrow 9 am to 1 pm due to pipeline work.', { isCommitment: false }),
];
