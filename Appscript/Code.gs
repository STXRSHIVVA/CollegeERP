function getRzpCreds_() {
  const props = PropertiesService.getScriptProperties();
  const keyId = props.getProperty('RZP_KEY_ID');
  const keySecret = props.getProperty('RZP_KEY_SECRET');
  if (!keyId || !keySecret) throw new Error('Razorpay keys not set. Define RZP_KEY_ID and RZP_KEY_SECRET in Script Properties.');
  return { keyId, keySecret };
}

function createRazorpayOrder_(amountPaise, receipt, notes) {
  const { keyId, keySecret } = getRzpCreds_();
  const url = 'https://api.razorpay.com/v1/orders';
  const payload = {
    amount: Number(amountPaise || 0),
    currency: 'INR',
    receipt: String(receipt || ''),
    payment_capture: 1,
    notes: notes || {}
  };
  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(getRzpCreds_().keyId + ':' + getRzpCreds_().keySecret) },
    muteHttpExceptions: true
  });
  const code = resp.getResponseCode();
  const text = resp.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Razorpay order error ' + code + ': ' + text);
  }
  const obj = JSON.parse(text);
  return { orderId: obj.id, amount: obj.amount, currency: obj.currency, keyId };
}

function toHex_(bytes) {
  return bytes.map(function (b) { const v = (b < 0 ? b + 256 : b); return ('0' + v.toString(16)).slice(-2); }).join('');
}

function verifyRazorpayPayment_(applicationId, orderId, paymentId, signature, amountPaise) {
  const { keySecret } = getRzpCreds_();
  const message = String(orderId) + '|' + String(paymentId);
  const expected = toHex_(Utilities.computeHmacSha256Signature(message, keySecret));
  const ok = expected === String(signature || '').trim();

  if (!ok) return { result: 'error', verified: false, message: 'Signature mismatch' };

  // Record fee
  const ss = SpreadsheetApp.getActive();
  const feesSheet = ss.getSheetByName('Fees');
  const amount = Number(amountPaise || 0) / 100;
  const now = new Date();
  if (feesSheet) {
    feesSheet.appendRow([
      String(paymentId), // TransactionId
      String(applicationId || ''), // ApplicationId
      amount, // Amount
      now, // Date
      'Razorpay', // Mode
      'Completed', // Status
      'Application Fee' // Type/Description
    ]);
  }

  // Update submission fee status if possible
  const subsSheet = ss.getSheetByName('Submissions');
  if (subsSheet && applicationId) {
    const data = subsSheet.getDataRange().getValues();
    if (data.length >= 2) {
      const headers = data[0].map(h => String(h || ''));
      const idxApp = colIndex_(headers, ['ApplicationId','applicationId','Application ID']);
      const idxFee = colIndex_(headers, ['FeeStatus','Fee Status','Payment Status','Fee','Fees']);
      for (let r = 1; r < data.length; r++) {
        if (String(data[r][idxApp]) === String(applicationId)) {
          if (idxFee >= 0) subsSheet.getRange(r + 1, idxFee + 1).setValue('Paid Online');
          break;
        }
      }
    }
  }

  // Email receipt
  try {
    const sub = getSubmissionByAppId_(applicationId);
    if (sub && sub.Email) {
      const ts = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss z');
      sendReceiptEmail_(String(sub.Email), {
        applicationId,
        receiptNumber: String(paymentId),
        amount,
        timestamp: ts,
        fullName: `${sub.FirstName || ''} ${sub.LastName || ''}`.trim()
      });
    }
  } catch (e) { Logger.log('Email send failed: ' + e); }

  return { result: 'success', verified: true, receiptNumber: String(paymentId), amount };
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData?.contents || '{}');
    const action = data.action;

    // Razorpay: create order
    if (action === 'createRazorpayOrder') {
      const out = createRazorpayOrder_(data.amountPaise, data.receipt, data.notes);
      return json_(Object.assign({ result: 'success' }, out));
    }

    // Razorpay: verify payment
    if (action === 'verifyRazorpayPayment') {
      const out = verifyRazorpayPayment_(data.applicationId, data.orderId, data.paymentId, data.signature, data.amountPaise);
      return json_(out);
    }

    // Assign hostel room
    if (action === 'assignHostelRoom') {
      return json_(assignHostelRoom(data.studentId, data.roomNumber));
    }

    // Issue book
    if (action === 'issueBook') {
      const ok = updateBookStatus_(data.bookId, 'Issued', data.studentId);
      return json_({ result: ok ? 'success' : 'error', message: ok ? 'Book issued.' : 'Unable to issue book.' });
    }

    // Return book
    if (action === 'returnBook') {
      const ok = updateBookStatus_(data.bookId, 'Available', '');
      return json_({ result: ok ? 'success' : 'error', message: ok ? 'Book returned.' : 'Unable to return book.' });
    }

    // Admission submission (explicit action recommended)
    if (!action || action === 'submitAdmission') {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const submissionsSheet = ss.getSheetByName('Submissions');
      if (!submissionsSheet) throw new Error('Sheet "Submissions" not found');

      // Create new application id
      const lastRow = submissionsSheet.getLastRow(); // includes header
      const nextIdNumber = Math.max(0, lastRow - 1) + 1;
      const year = new Date().getFullYear();
      const applicationId = `APP-${year}-${String(nextIdNumber).padStart(5, '0')}`;
      const timestamp = new Date();

      // Append new row
      const newRow = [
        applicationId, timestamp, data.firstName, data.lastName, data.dob,
        data.gender, data.email, data.mobile, data.guardianName, data.guardianMobile,
        data.address, data.city, data.state, data.zip, data.nationality, data.category,
        data.previousInstitute, data.yearOfPassing, data.percentage, data.course,
        data.hostel, data.transport, data.feeStatus
      ];
      submissionsSheet.appendRow(newRow);

      // Only simulate fee if declared already paid (to avoid double entry with Razorpay flow)
      const feeVal = String(data.feeStatus || '').toLowerCase();
      let receiptNumber = null;
      let amount = 0;
      if (feeVal.startsWith('paid')) {
        const feesSheet = ss.getSheetByName('Fees');
        const txnId = `TXN-${Date.now()}`;
        receiptNumber = txnId;
        amount = 500.0; // TODO: compute actual fee if needed
        if (feesSheet) {
          feesSheet.appendRow([
            txnId, applicationId, amount, timestamp,
            'Online (Simulated)', 'Completed', 'Application Fee'
          ]);
        }
      }

      // Attempt to email the receipt when paid and email is present
      let emailSent = false;
      let emailError = null;
      if (receiptNumber && data.email) {
        try {
          const tz = Session.getScriptTimeZone();
          const tsStr = Utilities.formatDate(timestamp, tz, 'yyyy-MM-dd HH:mm:ss z');
          sendReceiptEmail_(data.email, {
            applicationId,
            receiptNumber,
            amount,
            timestamp: tsStr,
            fullName: `${data.firstName || ''} ${data.lastName || ''}`.trim()
          });
          emailSent = true;
        } catch (err) {
          emailError = String(err);
          Logger.log('sendReceiptEmail_ failed: ' + emailError);
        }
      }

      return json_({ result: 'success', applicationId, receiptNumber, amount, timestamp: timestamp.toISOString(), emailSent, emailError });
    }

    return json_({ result: 'error', message: 'Unknown action' });

  } catch (error) {
    return json_({ result: 'error', error: String(error) });
  }
}

// Header helpers (handles casing differences)
function norm_(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function colIndex_(headers, names) {
  const lower = headers.map(h => norm_((h)));
  for (const n of names) {
    const i = lower.indexOf(norm_(n));
    if (i >= 0) return i;
  }
  return -1;
}

function doGet(e) {

  const cb = e && e.parameter && e.parameter.callback;
  const action = e && e.parameter && e.parameter.action;

  if (action === 'getStudentsAndLibrary') {
    const students = getStudents_(); // from Submissions
    const books = getBooks_(); // from Library
    const payload = JSON.stringify({ students, books });

    if (cb) {
      return ContentService
        .createTextOutput(`${cb}(${payload})`)
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return ContentService
      .createTextOutput(payload)
      .setMimeType(ContentService.MimeType.JSON);
  }

  const callback = e.parameter.callback || 'callback';
  let responseData;

  try {
    const action = e.parameter.action;
    if (action === 'getStudentsAndHostels') {
      responseData = getStudentsAndHostels();
    } else if (action === 'getStudentDetails') {
      const id = String(e.parameter.id || '').trim();
      const q = String(e.parameter.q || '').trim();
      if (id) responseData = getStudentDetails_(id);
      else if (q) responseData = searchStudents_(q);
      else responseData = { error: true, message: 'Missing id or q' };
    } else if (action === 'searchStudents') {
      const q = String(e.parameter.q || '').trim();
      responseData = searchStudents_(q);
    } else {
      responseData = getDashboardData();
    }
  } catch (error) {
    responseData = { error: true, message: String(error) };
  }

  return ContentService
    .createTextOutput(`${callback}(${JSON.stringify(responseData)})`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function updateBookStatus_(bookId, status, studentId) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Library');
  if (!sh) return false;

  const data = sh.getDataRange().getValues();
  if (!data || data.length < 2) return false; // need headers + at least 1 row

  const headers = data[0].map(h => String(h || ''));
  const rows = data.slice(1);

  // Broadened alias support (normalized matching)
  const idxId = colIndex_(headers, [
    'BookId','bookId','Book ID','ID','Id','BookNo','Book No','Book Number','BookNumber','ISBN','Code'
  ]);
  const idxStatus = colIndex_(headers, [
    'Status','status','Availability','Available','State','Current Status','CurrentStatus'
  ]);
  const idxAssigned = colIndex_(headers, [
    'AssignedToStudentId','assignedToStudentId','Assigned To Student Id','Assigned To','AssignedTo',
    'Issued To','IssuedTo','Borrower','Holder','StudentId','Student ID','ApplicationId','Application ID'
  ]);

  if (idxId < 0 || idxStatus < 0) return false;

  // Normalize status values we write
  const writeStatus = /issued/i.test(String(status)) ? 'Issued' : 'Available';

  for (let r = 0; r < rows.length; r++) {
    if (String(rows[r][idxId]) === String(bookId)) {
      sh.getRange(r + 2, idxStatus + 1).setValue(writeStatus);
      if (idxAssigned >= 0) {
        sh.getRange(r + 2, idxAssigned + 1).setValue(writeStatus === 'Issued' ? (studentId || '') : '');
      }
      return true;
    }
  }

  return false;
}

function getStudents_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Submissions');
  if (!sh) return [];

  const [headers, ...rows] = sh.getDataRange().getValues();

  // Use colIndex_ to locate columns, case-insensitive
  const idxApp = colIndex_(headers, ['applicationId', 'ApplicationId', 'Application ID']);
  const idxFirst = colIndex_(headers, ['firstName', 'FirstName', 'First Name']);
  const idxLast = colIndex_(headers, ['lastName', 'LastName', 'Last Name']);

  if (idxApp < 0) return []; // no valid headers

  return rows
    .filter(r => r[idxApp]) // skip empty rows
    .map(r => ({
      applicationId: String(r[idxApp] || ''),
      firstName: r[idxFirst] || '',
      lastName: r[idxLast] || ''
    }));
}

function getBooks_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Library');
  if (!sh) return [];

  const [headers, ...rows] = sh.getDataRange().getValues();

  // Broad alias lists with normalized matching
  const idxId = colIndex_(headers, [
    'BookId','bookId','Book ID','ID','Id','BookNo','Book No','Book Number','BookNumber','ISBN','Code'
  ]);
  const idxTitle = colIndex_(headers, [
    'Title','title','BookTitle','Book Title','Book Name','Name'
  ]);
  const idxStatus = colIndex_(headers, [
    'Status','status','Availability','Available','State','Current Status','CurrentStatus'
  ]);
  const idxAssigned = colIndex_(headers, [
    'AssignedToStudentId','assignedToStudentId','Assigned To Student Id','Assigned To','AssignedTo',
    'Issued To','IssuedTo','Borrower','Holder','StudentId','Student ID','ApplicationId','Application ID'
  ]);

  if (idxId < 0) return []; // no valid id header

  return rows
    .filter(r => r[idxId])
    .map(r => ({
      BookId: String(r[idxId] || ''),
      Title: idxTitle >= 0 ? (r[idxTitle] || '') : '',
      Status: idxStatus >= 0 ? (r[idxStatus] || 'Available') : 'Available',
      AssignedToStudentId: idxAssigned >= 0 ? (r[idxAssigned] || '') : ''
    }));
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sendReceiptEmail_(to, info) {
  const subject = `Payment Receipt ${info.receiptNumber} - Application ${info.applicationId}`;
  const amountStr = currencyINR_(info.amount);
  const safeName = escapeHtml_(info.fullName || 'Applicant');
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5">
    <p>Dear ${safeName},</p>
    <p>Thank you for your payment. Please find your receipt details below and the PDF attached.</p>
    <table style="border-collapse:collapse;min-width:360px">
      <tr>
        <td style="padding:6px 10px;border:1px solid #ddd;background:#f8f9fa">Receipt Number</td>
        <td style="padding:6px 10px;border:1px solid #ddd">${escapeHtml_(info.receiptNumber)}</td>
      </tr>
      <tr>
        <td style="padding:6px 10px;border:1px solid #ddd;background:#f8f9fa">Application ID</td>
        <td style="padding:6px 10px;border:1px solid #ddd">${escapeHtml_(info.applicationId)}</td>
      </tr>
      <tr>
        <td style="padding:6px 10px;border:1px solid #ddd;background:#f8f9fa">Amount</td>
        <td style="padding:6px 10px;border:1px solid #ddd">${amountStr}</td>
      </tr>
      <tr>
        <td style="padding:6px 10px;border:1px solid #ddd;background:#f8f9fa">Date</td>
        <td style="padding:6px 10px;border:1px solid #ddd">${escapeHtml_(info.timestamp)}</td>
      </tr>
    </table>
    <p style="margin-top:14px">Regards,<br/>Admissions Office</p>
  </div>`;
  const plain = `Dear ${info.fullName || 'Applicant'},\n\n` +
    `Thank you for your payment. Here are your receipt details (PDF attached):\n` +
    `Receipt Number: ${info.receiptNumber}\n` +
    `Application ID: ${info.applicationId}\n` +
    `Amount: ${amountStr}\n` +
    `Date: ${info.timestamp}\n\n` +
    `Regards,\nAdmissions Office`;

  // Attempt to generate PDF attachment
  let pdfBlob = null;
  try {
    pdfBlob = generateReceiptPdf_(info);
  } catch (err) {
    Logger.log('generateReceiptPdf_ failed: ' + err);
  }

  const options = {
    to,
    subject,
    body: plain,
    htmlBody: html,
    name: 'College ERP'
  };
  if (pdfBlob) options.attachments = [pdfBlob];

  MailApp.sendEmail(options);
}

function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function currencyINR_(n) {
  const num = Number(n || 0);
  return '₹ ' + Utilities.formatString('%.2f', isNaN(num) ? 0 : num);
}

// Generate a PDF receipt (as Blob) by creating a temporary Google Doc and exporting as PDF
function generateReceiptPdf_(info) {
  // Create a temporary Google Doc and export it as a PDF
  const doc = DocumentApp.create(`Receipt ${info.receiptNumber}`);
  const body = doc.getBody();

  body.appendParagraph('Payment Receipt').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(' ');

  const table = body.appendTable([
    ['Receipt Number', String(info.receiptNumber || '')],
    ['Application ID', String(info.applicationId || '')],
    ['Name', String(info.fullName || 'Applicant')],
    ['Amount', currencyINR_(info.amount)],
    ['Date', String(info.timestamp || '')]
  ]);
  table.getRow(0).getCell(0).setBackgroundColor('#f0f0f0');
  table.getRow(1).getCell(0).setBackgroundColor('#f0f0f0');
  table.getRow(2).getCell(0).setBackgroundColor('#f0f0f0');
  table.getRow(3).getCell(0).setBackgroundColor('#f0f0f0');
  table.getRow(4).getCell(0).setBackgroundColor('#f0f0f0');

  body.appendParagraph(' ');
  body.appendParagraph('Thank you for your payment.').setItalic(true);

  doc.saveAndClose();

  const file = DriveApp.getFileById(doc.getId());
  const pdfBlob = file.getAs(MimeType.PDF).setName(`Receipt_${info.receiptNumber}.pdf`);

  // Keep Drive clean by trashing the temporary Doc
  try { file.setTrashed(true); } catch (err) { /* ignore */ }

  return pdfBlob;
}

function assignHostelRoom(studentId, roomNumber) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hostelSheet = ss.getSheetByName('Hostel');
    if (!hostelSheet) return { result: 'error', message: 'Sheet "Hostel" not found.' };

    const data = hostelSheet.getDataRange().getValues(); // headers + rows
    if (data.length < 2) return { result: 'error', message: 'No rooms found.' };

    const headers = data[0].map(h => String(h || ''));
    const rows = data.slice(1);

    const idxRoom = colIndex_(headers, ['RoomNumber','Room Number','Room No','RoomNo','Room','Number','Room Id','RoomId']);
    const idxStatus = colIndex_(headers, ['Status','status','Availability','Available','State','Current Status','CurrentStatus']);
    const idxAssigned = colIndex_(headers, ['AssignedToStudentId','assignedToStudentId','Assigned To Student Id','Assigned To','AssignedTo','StudentId','Student ID','ApplicationId','Application ID']);

    if (idxRoom < 0 || idxStatus < 0) return { result: 'error', message: 'Hostel headers missing.' };

    for (let r = 0; r < rows.length; r++) {
      if (String(rows[r][idxRoom]) === String(roomNumber)) {
        // Optional: only allow assigning if currently Available
        // const curr = String(rows[r][idxStatus] || 'Available');
        // if (/occupied/i.test(curr)) return { result: 'error', message: `Room ${roomNumber} is already occupied.` };
        hostelSheet.getRange(r + 2, idxStatus + 1).setValue('Occupied');
        if (idxAssigned >= 0) hostelSheet.getRange(r + 2, idxAssigned + 1).setValue(studentId);
        return { result: 'success', message: `Room ${roomNumber} assigned to ${studentId}.` };
      }
    }

    return { result: 'error', message: 'Room not found.' };

  } catch (error) {
    return { result: 'error', message: String(error) };
  }
}

function getStudentsAndHostels() {
  try {
    const students = getStudentsNeedingHostel_();
    const rooms = getRooms_();
    return { students, rooms };
  } catch (error) {
    return { error: true, message: String(error) };
  }
}

function getRooms_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Hostel');
  if (!sh) return [];
  const [headers, ...rows] = sh.getDataRange().getValues();

  const idxRoom = colIndex_(headers, ['RoomNumber','Room Number','Room No','RoomNo','Room','Number','Room Id','RoomId']);
  const idxStatus = colIndex_(headers, ['Status','status','Availability','Available','State','Current Status','CurrentStatus']);
  const idxAssigned = colIndex_(headers, ['AssignedToStudentId','assignedToStudentId','Assigned To Student Id','Assigned To','AssignedTo','StudentId','Student ID','ApplicationId','Application ID']);

  if (idxRoom < 0) return [];

  return rows
    .filter(r => r[idxRoom])
    .map(r => ({
      RoomNumber: String(r[idxRoom] || ''),
      Status: idxStatus >= 0 ? (r[idxStatus] || 'Available') : 'Available',
      AssignedToStudentId: idxAssigned >= 0 ? (r[idxAssigned] || '') : ''
    }));
}

function getStudentsNeedingHostel_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Submissions');
  if (!sh) return [];
  const [headers, ...rows] = sh.getDataRange().getValues();

  const idxApp = colIndex_(headers, ['ApplicationId','applicationId','Application ID']);
  const idxFirst = colIndex_(headers, ['FirstName','firstName','First Name']);
  const idxLast = colIndex_(headers, ['LastName','lastName','Last Name']);
  const idxHostel = colIndex_(headers, ['Hostel','hostel','Hostel Required','HostelRequired']);

  if (idxApp < 0) return [];

  return rows
    .filter(r => r[idxApp])
    .filter(r => String(idxHostel >= 0 ? r[idxHostel] : '').toLowerCase() === 'yes')
    .map(r => ({
      applicationId: String(r[idxApp] || ''),
      firstName: idxFirst >= 0 ? (r[idxFirst] || '') : '',
      lastName: idxLast >= 0 ? (r[idxLast] || '') : ''
    }));
}

function getFees_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Fees');
  if (!sh) return [];
  const [headers, ...rows] = sh.getDataRange().getValues();

  const idxTxn = colIndex_(headers, ['TransactionId','TxnId','Transaction ID','Txn ID','ID','Id']);
  const idxApp = colIndex_(headers, ['ApplicationId','applicationId','Application ID']);
  const idxAmt = colIndex_(headers, ['Amount','amount','Fee','Fees','Paid Amount']);
  const idxDate = colIndex_(headers, ['Date','Payment Date','Txn Date','Timestamp','Created At','Time']);
  const idxMode = colIndex_(headers, ['Mode','Payment Mode','Method','Channel']);
  const idxStatus = colIndex_(headers, ['Status','Payment Status','State']);
  const idxType = colIndex_(headers, ['Type','Fee Type','Description','Narration']);

  return rows
    .filter(r => idxTxn >= 0 ? r[idxTxn] : true)
    .map(r => ({
      TransactionId: idxTxn >= 0 ? String(r[idxTxn] || '') : '',
      ApplicationId: idxApp >= 0 ? String(r[idxApp] || '') : '',
      Amount: idxAmt >= 0 ? Number(r[idxAmt] || 0) : 0,
      Date: idxDate >= 0 ? (r[idxDate] instanceof Date ? r[idxDate].toISOString() : String(r[idxDate] || '')) : '',
      Mode: idxMode >= 0 ? String(r[idxMode] || '') : '',
      Status: idxStatus >= 0 ? String(r[idxStatus] || '') : '',
      Type: idxType >= 0 ? String(r[idxType] || '') : ''
    }));
}

function getDashboardData() {
  // Compose dashboard payload with robust helpers
  const submissions = getStudents_();
  const rooms = getRooms_();
  const fees = getFees_();
  return { submissions, rooms, fees };
}

function getSubmissionByAppId_(applicationId) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Submissions');
  if (!sh) return null;
  const data = sh.getDataRange().getValues();
  if (!data || data.length < 2) return null;
  const headers = data[0].map(h => String(h || ''));
  const rows = data.slice(1);
  const idxApp = colIndex_(headers, ['ApplicationId','applicationId','Application ID']);
  if (idxApp < 0) return null;

  for (let r = 0; r < rows.length; r++) {
    if (String(rows[r][idxApp]) === String(applicationId)) {
      const obj = {};
      for (let c = 0; c < headers.length; c++) {
        const key = headers[c] || `Col${c+1}`;
        const val = rows[r][c];
        obj[key] = val instanceof Date ? val.toISOString() : val;
      }
      // Ensure canonical id fields for convenience
      obj.ApplicationId = String(rows[r][idxApp]);
      return obj;
    }
  }
  return null;
}

function getFeesByAppId_(applicationId) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Fees');
  if (!sh) return [];
  const [headers, ...rows] = sh.getDataRange().getValues();
  const idxApp = colIndex_(headers, ['ApplicationId','applicationId','Application ID']);
  if (idxApp < 0) return [];

  return rows
    .filter(r => String(r[idxApp]) === String(applicationId))
    .map(r => {
      const entry = {};
      headers.forEach((h, i) => {
        const key = String(h || `Col${i+1}`);
        const v = r[i];
        entry[key] = v instanceof Date ? v.toISOString() : v;
      });
      return entry;
    });
}

function getHostelByStudentId_(applicationId) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Hostel');
  if (!sh) return null;
  const [headers, ...rows] = sh.getDataRange().getValues();
  const idxAssigned = colIndex_(headers, ['AssignedToStudentId','assignedToStudentId','Assigned To Student Id','Assigned To','AssignedTo','StudentId','Student ID','ApplicationId','Application ID']);
  if (idxAssigned < 0) return null;

  for (const row of rows) {
    if (String(row[idxAssigned]) === String(applicationId)) {
      const obj = {};
      headers.forEach((h, i) => { obj[String(h || `Col${i+1}`)] = row[i]; });
      return obj;
    }
  }
  return null;
}

function getLibraryLoansByStudentId_(applicationId) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Library');
  if (!sh) return [];
  const [headers, ...rows] = sh.getDataRange().getValues();
  const idxAssigned = colIndex_(headers, ['AssignedToStudentId','assignedToStudentId','Assigned To Student Id','Assigned To','AssignedTo','Issued To','IssuedTo','Borrower','Holder','StudentId','Student ID','ApplicationId','Application ID']);
  if (idxAssigned < 0) return [];

  return rows
    .filter(r => String(r[idxAssigned]) === String(applicationId))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[String(h || `Col${i+1}`)] = r[i]; });
      return obj;
    });
}

function getStudentDetails_(applicationId) {
  const student = getSubmissionByAppId_(applicationId);
  if (!student) return { found: false, message: 'Not found' };
  const fees = getFeesByAppId_(applicationId);
  const hostel = getHostelByStudentId_(applicationId);
  const library = getLibraryLoansByStudentId_(applicationId);
  return { found: true, student, fees, hostel, library };
}

function searchStudents_(q) {
  const query = String(q || '').toLowerCase();
  if (!query) return { results: [] };
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Submissions');
  if (!sh) return { results: [] };
  const [headers, ...rows] = sh.getDataRange().getValues();
  const idxApp = colIndex_(headers, ['ApplicationId','applicationId','Application ID']);
  const idxFirst = colIndex_(headers, ['FirstName','firstName','First Name']);
  const idxLast = colIndex_(headers, ['LastName','lastName','Last Name']);
  const idxEmail = colIndex_(headers, ['Email','email','E-mail','Mail']);
  const idxMobile = colIndex_(headers, ['Mobile','Phone','Contact','Phone Number','Mobile Number']);

  const results = [];
  rows.forEach(r => {
    const appId = idxApp >= 0 ? String(r[idxApp] || '') : '';
    const first = idxFirst >= 0 ? String(r[idxFirst] || '') : '';
    const last = idxLast >= 0 ? String(r[idxLast] || '') : '';
    const full = `${first} ${last}`.trim();
    const email = idxEmail >= 0 ? String(r[idxEmail] || '') : '';
    const mobile = idxMobile >= 0 ? String(r[idxMobile] || '') : '';

    const hay = `${appId} ${full} ${email} ${mobile}`.toLowerCase();
    if (hay.includes(query)) {
      results.push({ applicationId: appId, name: full, email, mobile });
    }
  });
  return { results };
}
