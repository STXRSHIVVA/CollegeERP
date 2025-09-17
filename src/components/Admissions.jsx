import React, { useState, useRef } from 'react'; // Removed useEffect as it's no longer needed here

const APPLICATION_FEE_INR = Number(import.meta.env.VITE_APPLICATION_FEE_INR || 500);
let razorpayScriptLoaded = false;
const loadRazorpayScript = () => new Promise((resolve, reject) => {
    if (razorpayScriptLoaded && window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => { razorpayScriptLoaded = true; resolve(true); };
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout'));
    document.body.appendChild(script);
});

const AdmissionForm = () => {
    // State for all your detailed form fields
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        dob: '',
        gender: '',
        email: '',
        mobile: '',
        guardianName: '',
        guardianMobile: '',
        address: '',
        city: '',
        state: '',
        zip: '',
        nationality: 'Indian',
        category: 'General',
        previousInstitute: '',
        yearOfPassing: '',
        percentage: '',
        course: 'Computer Science',
        hostel: 'No',
        transport: 'No',
        feeStatus: 'Paid Online'
    });

    // New state to manage the submission loading status
    const [isSubmitting, setIsSubmitting] = useState(false);
    // New state to hold receipt details (if returned by backend)
    const [receipt, setReceipt] = useState(null);
    const [paymentError, setPaymentError] = useState('');
    // New states for online payment flow
    const [applicationId, setApplicationId] = useState(null);
    const [paymentVerified, setPaymentVerified] = useState(false);
    const [isPaying, setIsPaying] = useState(false);

    const formRef = useRef(null);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prevState => ({
            ...prevState,
            [name]: value
        }));
        if (name === 'feeStatus') {
            // Reset payment state when toggling payment method
            setPaymentError('');
            setPaymentVerified(false);
        }
    };

    async function createRzpOrder(scriptURL, applicationId) {
        const amountPaise = Math.round(APPLICATION_FEE_INR * 100);
        const resp = await fetch(scriptURL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'createRazorpayOrder', amountPaise, receipt: applicationId, notes: { applicationId } })
        });
        if (!resp.ok) throw new Error('Failed to create Razorpay order');
        const json = await resp.json();
        if (json.result !== 'success') throw new Error(json.message || 'Order creation failed');
        return json; // { orderId, amount, currency, keyId }
    }

    async function verifyRzpPayment(scriptURL, applicationId, orderId, paymentId, signature) {
        const amountPaise = Math.round(APPLICATION_FEE_INR * 100);
        const resp = await fetch(scriptURL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'verifyRazorpayPayment', applicationId, orderId, paymentId, signature, amountPaise })
        });
        if (!resp.ok) throw new Error('Failed to verify payment');
        return resp.json();
    }

    // Create (or reuse) a provisional application to obtain applicationId before payment
    async function ensureApplicationCreated(scriptURL) {
        if (applicationId) return applicationId;
        const payload = { ...formData, action: 'submitAdmission', feeStatus: 'To Be Paid at Counter' };
        const response = await fetch(scriptURL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain' },
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Network error: ${response.status} ${response.statusText} - ${text}`);
        }
        const result = await response.json();
        if (result.result !== 'success') {
            throw new Error(result.error || 'An unknown error occurred in the script.');
        }
        setApplicationId(result.applicationId);
        return result.applicationId;
    }

    // New: Dedicated Pay Now handler for online payments
    const handlePayNow = async () => {
        setPaymentError('');
        const scriptURL = import.meta.env.VITE_APPS_SCRIPT_URL;
        if (!scriptURL) {
            alert('Missing VITE_APPS_SCRIPT_URL in your environment. Payments cannot proceed.');
            return;
        }
        // HTML5 validation for required fields without submitting form
        if (formRef.current && !formRef.current.reportValidity()) {
            return;
        }
        setIsPaying(true);
        try {
            const appId = await ensureApplicationCreated(scriptURL);
            await loadRazorpayScript();
            const order = await createRzpOrder(scriptURL, appId);

            const options = {
                key: order.keyId,
                amount: order.amount,
                currency: order.currency || 'INR',
                name: 'College ERP Admissions',
                description: `Application Fee for ${appId}`,
                order_id: order.orderId,
                prefill: {
                    name: `${formData.firstName} ${formData.lastName}`.trim(),
                    email: formData.email,
                    contact: formData.mobile,
                },
                theme: { color: '#4f46e5' },
                // Removed method filter to allow any enabled method (UPI, card, netbanking, wallets, etc.)
                handler: async function (resp) {
                    try {
                        const ver = await verifyRzpPayment(
                            scriptURL,
                            appId,
                            resp.razorpay_order_id,
                            resp.razorpay_payment_id,
                            resp.razorpay_signature
                        );
                        if (ver.result === 'success' && ver.verified) {
                            const r = {
                                applicationId: appId,
                                receiptNumber: ver.receiptNumber || resp.razorpay_payment_id,
                                amount: ver.amount || APPLICATION_FEE_INR,
                                method: 'Paid Online (Razorpay)',
                                applicant: `${formData.firstName} ${formData.lastName}`.trim(),
                                email: formData.email,
                                timestamp: new Date().toISOString(),
                            };
                            setReceipt(r);
                            setPaymentVerified(true);
                            setIsPaying(false);
                            alert('Payment successful and verified. You can now submit your application.');
                        } else {
                            setPaymentError('Payment could not be verified. Please contact support.');
                            setIsPaying(false);
                            alert('Payment could not be verified.');
                        }
                    } catch (err) {
                        console.error(err);
                        setPaymentError(err.message || 'Verification failed');
                        setIsPaying(false);
                        alert('Verification failed.');
                    }
                },
                modal: {
                    ondismiss: function () {
                        setIsPaying(false);
                    }
                }
            };

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (resp) {
                setPaymentError(resp.error && resp.error.description ? resp.error.description : 'Payment failed');
                alert('Payment failed. You can retry by clicking Pay Now again.');
                setIsPaying(false);
            });
            rzp.open();
        } catch (error) {
            console.error('Error initiating payment:', error);
            setPaymentError(error.message || 'Unable to start payment');
            setIsPaying(false);
        }
    };

    // --- UPDATED SUBMIT: enforce payment first for online mode ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        setPaymentError('');
        setIsSubmitting(true);

        const scriptURL = import.meta.env.VITE_APPS_SCRIPT_URL;

        if (!scriptURL) {
            alert('Missing VITE_APPS_SCRIPT_URL in your environment. Submissions will not be sent.');
            setIsSubmitting(false);
            return;
        }

        const wantsOnline = String(formData.feeStatus).toLowerCase().includes('paid');

        try {
            if (wantsOnline) {
                if (!paymentVerified) {
                    setPaymentError('Please complete payment by clicking Pay Now before submitting.');
                    setIsSubmitting(false);
                    return;
                }
                // Application was already created during Pay Now. Treat as submitted.
                alert(`Application Submitted Successfully! Your Application ID is: ${applicationId || 'N/A'}`);
                setIsSubmitting(false);
                return;
            }

            // Counter payment flow unchanged
            const payload = { ...formData, action: 'submitAdmission' };
            const response = await fetch(scriptURL, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'text/plain' },
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Network error: ${response.status} ${response.statusText} - ${text}`);
            }

            const result = await response.json();

            if (result.result !== 'success') {
                throw new Error(result.error || 'An unknown error occurred in the script.');
            }

            const appId = result.applicationId;
            alert(`Application Submitted Successfully! Your Application ID is: ${appId}`);
            const r = {
                applicationId: appId,
                receiptNumber: result.receiptNumber || result.receiptId || null,
                amount: result.amount || result.feeAmount || null,
                method: formData.feeStatus,
                applicant: `${formData.firstName} ${formData.lastName}`.trim(),
                email: formData.email,
                timestamp: result.timestamp || new Date().toISOString(),
            };
            if (r.applicationId) setReceipt(r);
        } catch (error) {
            console.error('Error submitting:', error);
            alert(`An error occurred. ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePrintReceipt = () => {
        if (!receipt) return;
        const lines = [
            `<h2 style="margin:0 0 12px">Application Fee Receipt</h2>`,
            `<div><strong>Application ID:</strong> ${receipt.applicationId}</div>`,
            receipt.receiptNumber ? `<div><strong>Receipt No:</strong> ${receipt.receiptNumber}</div>` : '',
            receipt.amount != null ? `<div><strong>Amount:</strong> ${receipt.amount}</div>` : '',
            `<div><strong>Payment Method:</strong> ${receipt.method}</div>`,
            receipt.applicant ? `<div><strong>Applicant:</strong> ${receipt.applicant}</div>` : '',
            receipt.email ? `<div><strong>Email:</strong> ${receipt.email}</div>` : '',
            `<div><strong>Date:</strong> ${new Date(receipt.timestamp).toLocaleString()}</div>`
        ].filter(Boolean);
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${receipt.applicationId}</title></head><body style="font-family:ui-sans-serif,system-ui,Arial;padding:24px;">${lines.join('')}<hr/><p style="font-size:12px;color:#666">This is a system-generated receipt.</p></body></html>`;
        const w = window.open('', '_blank');
        if (w) {
            w.document.open();
            w.document.write(html);
            w.document.close();
            w.focus();
            w.print();
        }
    };

    return (
        <div className="bg-blue-50 min-h-screen py-10 px-4 sm:px-6 lg:px-8">
            {/* Receipt banner */}
            {receipt && (
                <div className="max-w-4xl mx-auto mb-4 rounded border border-green-200 bg-green-50 text-green-800 p-4">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="font-semibold">Fee receipt generated for Application ID {receipt.applicationId}</p>
                            <p className="text-sm">{receipt.receiptNumber ? `Receipt No: ${receipt.receiptNumber}` : 'No receipt number provided by backend'}</p>
                        </div>
                        <button onClick={handlePrintReceipt} className="rounded bg-green-600 text-white px-3 py-1.5 hover:bg-green-700">Print / Download</button>
                    </div>
                </div>
            )}

            {/* Payment error banner */}
            {paymentError && (
                <div className="max-w-4xl mx-auto mb-4 rounded border border-red-200 bg-red-50 text-red-800 p-4">
                    <p className="text-sm">{paymentError}</p>
                </div>
            )}

            <form ref={formRef} onSubmit={handleSubmit} className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-xl">
                <div className="space-y-12">

                    <div className="border-b border-gray-200/90 pb-12">
                        <h2 className="text-2xl font-bold leading-7 text-purple-700">College Admission Portal</h2>
                        <p className="mt-2 text-md leading-6 text-gray-700">Welcome! Please fill in your details to begin your journey with us.</p>
                    </div>

                    {/* Personal & Guardian Details */}
                    <div className="border-b border-gray-200/90 pb-12">
                        <h2 className="text-xl font-semibold leading-7 text-purple-700">1. Personal & Guardian Information</h2>
                        <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
                            <div className="sm:col-span-3"><label htmlFor="firstName" className="block text-sm font-medium leading-6 text-gray-900">First name</label><div className="mt-2"><input type="text" name="firstName" id="firstName" value={formData.firstName} onChange={handleChange} required className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600" /></div></div>
                            <div className="sm:col-span-3"><label htmlFor="lastName" className="block text-sm font-medium leading-6 text-gray-900">Last name</label><div className="mt-2"><input type="text" name="lastName" id="lastName" value={formData.lastName} onChange={handleChange} required className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600" /></div></div>
                            <div className="sm:col-span-3"><label htmlFor="dob" className="block text-sm font-medium leading-6 text-gray-900">Date of Birth</label><div className="mt-2"><input type="date" name="dob" id="dob" value={formData.dob} onChange={handleChange} required className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600" /></div></div>
                            <div className="sm:col-span-3"><label htmlFor="gender" className="block text-sm font-medium leading-6 text-gray-900">Gender</label><div className="mt-2"><select id="gender" name="gender" value={formData.gender} onChange={handleChange} required className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600"><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></div></div>
                            <div className="sm:col-span-3"><label htmlFor="nationality" className="block text-sm font-medium leading-6 text-gray-900">Nationality</label><div className="mt-2"><input type="text" name="nationality" id="nationality" value={formData.nationality} onChange={handleChange} required className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600" /></div></div>
                            <div className="sm:col-span-3"><label htmlFor="category" className="block text-sm font-medium leading-6 text-gray-900">Admission Category</label><div className="mt-2"><select id="category" name="category" value={formData.category} onChange={handleChange} required className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600"><option>General</option><option>OBC</option><option>SC</option><option>ST</option><option>EWS</option></select></div></div>
                            <div className="sm:col-span-3"><label htmlFor="guardianName" className="block text-sm font-medium leading-6 text-gray-900">Guardian's Name</label><div className="mt-2"><input type="text" name="guardianName" id="guardianName" value={formData.guardianName} onChange={handleChange} required className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600" /></div></div>
                            <div className="sm:col-span-3"><label htmlFor="guardianMobile" className="block text-sm font-medium leading-6 text-gray-900">Guardian's Mobile</label><div className="mt-2"><input type="tel" name="guardianMobile" id="guardianMobile" value={formData.guardianMobile} onChange={handleChange} required className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600" /></div></div>
                            <div className="sm:col-span-3"><label htmlFor="email" className="block text-sm font-medium leading-6 text-gray-900">Email address</label><div className="mt-2"><input id="email" name="email" type="email" value={formData.email} onChange={handleChange} required className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600" /></div></div>
                            <div className="sm:col-span-3"><label htmlFor="mobile" className="block text sm font-medium leading-6 text-gray-900">Mobile Number</label><div className="mt-2"><input type="tel" name="mobile" id="mobile" value={formData.mobile} onChange={handleChange} required className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600" /></div></div>
                            <div className="col-span-full"><label htmlFor="address" className="block text-sm font-medium leading-6 text-gray-900">Street address</label><div className="mt-2"><input type="text" name="address" id="address" value={formData.address} onChange={handleChange} required className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600" /></div></div>
                            <div className="sm:col-span-2 sm:col-start-1"><label htmlFor="city" className="block text-sm font-medium leading-6 text-gray-900">City</label><div className="mt-2"><input type="text" name="city" id="city" value={formData.city} onChange={handleChange} required className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600" /></div></div>
                            <div className="sm:col-span-2"><label htmlFor="state" className="block text-sm font-medium leading-6 text-gray-900">State / Province</label><div className="mt-2"><input type="text" name="state" id="state" value={formData.state} onChange={handleChange} required className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600" /></div></div>
                            <div className="sm:col-span-2"><label htmlFor="zip" className="block text-sm font-medium leading-6 text-gray-900">ZIP / Postal code</label><div className="mt-2"><input type="text" name="zip" id="zip" value={formData.zip} onChange={handleChange} required className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600" /></div></div>
                        </div>
                    </div>

                    {/* Academic & Course Details */}
                    <div className="border-b border-gray-200/90 pb-12">
                        <h2 className="text-xl font-semibold leading-7 text-purple-700">2. Academic & Course Details</h2>
                        <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
                            <div className="sm:col-span-full"><label htmlFor="previousInstitute" className="block text-sm font-medium leading-6 text-gray-900">Previous Institute Name</label><div className="mt-2"><input type="text" name="previousInstitute" id="previousInstitute" value={formData.previousInstitute} onChange={handleChange} required className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600" /></div></div>
                            <div className="sm:col-span-3"><label htmlFor="yearOfPassing" className="block text-sm font-medium leading-6 text-gray-900">Year of Passing</label><div className="mt-2"><input type="text" name="yearOfPassing" id="yearOfPassing" value={formData.yearOfPassing} onChange={handleChange} required className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600" /></div></div>
                            <div className="sm:col-span-3"><label htmlFor="percentage" className="block text-sm font-medium leading-6 text-gray-900">Percentage / GPA</label><div className="mt-2"><input type="text" name="percentage" id="percentage" value={formData.percentage} onChange={handleChange} required className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600" /></div></div>
                            <div className="sm:col-span-2"><label htmlFor="course" className="block text-sm font-medium leading-6 text-gray-900">Select Course</label><div className="mt-2"><select id="course" name="course" value={formData.course} onChange={handleChange} className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600"><option>Computer Science</option><option>Electronics</option><option>Mechanical</option><option>Civil</option></select></div></div>
                            <div className="sm:col-span-2"><label htmlFor="hostel" className="block text-sm font-medium leading-6 text-gray-900">Hostel Required</label><div className="mt-2"><select id="hostel" name="hostel" value={formData.hostel} onChange={handleChange} className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600"><option>No</option><option>Yes</option></select></div></div>
                            <div className="sm:col-span-2"><label htmlFor="transport" className="block text-sm font-medium leading-6 text-gray-900">Transport Required</label><div className="mt-2"><select id="transport" name="transport" value={formData.transport} onChange={handleChange} className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600"><option>No</option><option>Yes</option></select></div></div>
                        </div>
                    </div>
                </div>

                {/* ... inside the second <fieldset> or details section ... */}
                <div className="sm:col-span-full"> {/* <-- Add this block */}
                    <label htmlFor="feeStatus" className="block text-sm font-medium leading-6 text-gray-900">Application Fee</label>
                    <div className="mt-2">
                        <select id="feeStatus" name="feeStatus" value={formData.feeStatus} onChange={handleChange}
                            className="block w-full rounded-md border-gray-300 border py-2 text-gray-900 shadow-sm focus:ring-2 focus:ring-inset focus:ring-indigo-600">
                            <option>Paid Online</option>
                            <option>To Be Paid at Counter</option>
                        </select>
                    </div>
                    {String(formData.feeStatus).toLowerCase().includes('paid') && (
                        <>
                            <p className="mt-2 text-sm text-gray-600">After you click Pay Now, a Razorpay window will open to pay ₹{APPLICATION_FEE_INR} using UPI, card, netbanking, or other enabled methods. Payment will be auto-verified.</p>
                            {!paymentVerified ? (
                                <button
                                    type="button"
                                    onClick={handlePayNow}
                                    disabled={isPaying}
                                    className="mt-3 inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                >
                                    {isPaying ? 'Processing…' : 'Pay Now'}
                                </button>
                            ) : (
                                <p className="mt-3 text-sm text-green-700">Payment verified. You can submit your application now.</p>
                            )}
                        </>
                    )}
                </div>

                <div className="mt-6 flex items-center justify-end gap-x-6">
                    <button type="button" className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">Cancel</button>
                    {/* --- UPDATED: disable submit until paid in online mode --- */}
                    <button
                        type="submit"
                        disabled={isSubmitting || (String(formData.feeStatus).toLowerCase().includes('paid') && !paymentVerified)}
                        className="rounded-md bg-indigo-600 px-4 py-2 text-md font-semibold text-white shadow-md hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Submitting...' : 'Submit Application'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default AdmissionForm;