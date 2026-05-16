// src/components/LenderForm.js
import React, { useState, useRef, useEffect } from "react";
import jsPDF from "jspdf";
import emailjs from "emailjs-com";
import "./LenderForm.css";
import DEFAULT_QR_PUBLIC from "../assets/qr-code.png"

/**
 * LenderForm (complete, patched)
 *
 * - Generates a promissory-note PDF in-browser.
 * - Sends the main email via EmailJS (promissory note PDF attached to main template if desired).
 * - Optionally uploads the generated PDF and form fields to your server endpoint (/api/send-support).
 * - This patched version includes a helper `sendPdfViaEmailJS` that attaches the generated PDF
 *   to a hidden file input named "attachment" and calls EmailJS `sendForm`.
 *
 * USAGE
 * 1. Replace the EMAILJS_* placeholders with your EmailJS values.
 * 2. Replace SERVER_UPLOAD_URL with your server URL if you use the server upload flow.
 * 3. The helper is called automatically in handleSubmit as a fallback if server upload fails,
 *    and can also be used directly to send via EmailJS.
 */

// --------------------
// CONFIG: replace these with your EmailJS values and server URL
// --------------------
const EMAILJS_PUBLIC_KEY = "kcsIbWkJni85GuyVL";
const EMAILJS_SERVICE_ID = "service_9ohi1tk";
const EMAILJS_TEMPLATE_ID = "template_abwr38e"; // template that accepts variables and attachment named "attachment"
const SERVER_UPLOAD_URL = "http://localhost:4000/api/send-support"; // change to your server endpoint

// Initialize EmailJS once
emailjs.init(EMAILJS_PUBLIC_KEY);

// --------------------
// Component
// --------------------
export default function LenderForm() {
  const SUPPORT_EMAIL = "dascivil.k@gmail.com";
  //const DEFAULT_QR_PUBLIC = `${process.env.PUBLIC_URL || ""}/qr-code.png`;

  // Form state
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const [lenderName, setLenderName] = useState("");
  const [phonepe, setPhonepe] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [monthlyInterest, setMonthlyInterest] = useState(null);
  const [monthlyTotal, setMonthlyTotal] = useState(null);

  // Aadhar number and address fields
  const [aadharNumber, setAadharNumber] = useState("");
  const [address, setAddress] = useState("");

  // TXN ID to send to support
  const [txnId, setTxnId] = useState("");

  // Optional: user can upload a QR image (embedded into PDF)
  const [uploadedQrFile, setUploadedQrFile] = useState(null);
  const [qrPreviewUrl, setQrPreviewUrl] = useState(null);

  // Optional: user can upload the downloaded PDF to send to support instead of generated one
  const [uploadedDownloadedPdf, setUploadedDownloadedPdf] = useState(null);
  const [uploadedDownloadedPdfName, setUploadedDownloadedPdfName] = useState(null);
  const [uploadedDownloadedPdfSize, setUploadedDownloadedPdfSize] = useState(0);

  const formRef = useRef();

  useEffect(() => {
    return () => {
      if (qrPreviewUrl) URL.revokeObjectURL(qrPreviewUrl);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (qrPreviewUrl) {
      URL.revokeObjectURL(qrPreviewUrl);
      setQrPreviewUrl(null);
    }
    if (uploadedQrFile) {
      try {
        const obj = URL.createObjectURL(uploadedQrFile);
        setQrPreviewUrl(obj);
      } catch {
        setQrPreviewUrl(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedQrFile]);

  // -------------------------
  // Helpers
  // -------------------------
  const calculateMonthlyInterest = (principal, rupeesPer100) => {
    const monthly = (principal / 100) * rupeesPer100;
    const total = principal + monthly;
    return { monthly: monthly.toFixed(2), total: total.toFixed(2) };
  };

  const compressImage = (file, maxWidth = 800, quality = 0.65) => {
    return new Promise((resolve, reject) => {
      if (!file || !file.type || !file.type.startsWith("image/")) return resolve(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              if (!blob) return reject(new Error("Image compression failed"));
              const outFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
                type: "image/jpeg",
              });
              resolve(outFile);
            },
            "image/jpeg",
            quality
          );
        };
        img.onerror = () => reject(new Error("Image load error"));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error("FileReader error"));
      reader.readAsDataURL(file);
    });
  };

  // Debug: log FormData entries and sizes
  const debugFormSizes = (formEl) => {
    try {
      const fd = new FormData(formEl);
      const entries = Array.from(fd.entries());
      console.log("FormData entries count:", entries.length);
      let totalText = 0;
      entries.forEach(([name, value]) => {
        if (value instanceof File) {
          console.log(`${name}: File — ${value.name} (${value.size} bytes)`);
        } else {
          const bytes = new TextEncoder().encode(String(value)).length;
          totalText += bytes;
          console.log(`${name}: Text — ${bytes} bytes`);
          if (bytes > 2000) console.warn(`${name} is large (>2KB). Snippet:`, String(value).slice(0, 200));
        }
      });
      console.log("Total text variables size (bytes):", totalText);
      return totalText;
    } catch (err) {
      console.warn("debugFormSizes failed", err);
      return 0;
    }
  };

  // Attach File to hidden input via DataTransfer
  const attachFileToInput = (formEl, selector, file) => {
    if (!formEl || !selector) return;
    const input = formEl.querySelector(selector);
    if (!input) return;
    if (!file) {
      try {
        input.value = "";
      } catch {}
      return;
    }
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
  };

  // -------------------------
  // PDF generator (includes Aadhar number and Address)
  // -------------------------
  const generateProfessionalPdfBlob = async ({
    lenderName,
    phonepe,
    email,
    amount,
    rate,
    monthly,
    total,
    aadharNumber,
    address,
    qrFile,
  }) => {
    return new Promise((resolve, reject) => {
      try {
        const timestamp = new Date().toLocaleString();
        const refId = `LC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000) + 1000}`;

        const doc = new jsPDF({
          unit: "pt",
          format: "a4",
        });

        const pageWidth = 595.28;
        const left = 40;
        const usableWidth = pageWidth - left - 40;

        // Header bar
        doc.setFillColor(20, 60, 120);
        doc.rect(0, 0, pageWidth, 60, "F");

        // Title and meta
        doc.setFontSize(18);
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.text("LendCash Financial Services", left, 40);

        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "normal");
        doc.text(`Reference ID: ${refId}`, pageWidth - 180, 28);
        doc.text(`Date: ${timestamp}`, pageWidth - 180, 44);

        // Watermark
        doc.setFontSize(60);
        doc.setTextColor(200, 200, 200);
        doc.setFont("helvetica", "bold");
        doc.text("LENDCASH CONFIDENTIAL", pageWidth / 2, 320, { align: "center", angle: -30 });

        // Main title
        doc.setFontSize(16);
        doc.setTextColor(20, 60, 120);
        doc.setFont("helvetica", "bold");
        doc.text("Promissory Note / Loan Agreement", pageWidth / 2, 110, { align: "center" });

        // Details box
        const boxTop = 140;
        const boxHeight = 160;
        doc.setDrawColor(200);
        doc.setLineWidth(0.5);
        doc.roundedRect(left, boxTop, usableWidth, boxHeight, 6, 6);

        const colGap = 20;
        const colWidth = (usableWidth - colGap) / 2;
        const col1X = left + 12;
        const col2X = left + 12 + colWidth + colGap;

        doc.setFontSize(11);
        doc.setTextColor(40, 40, 40);
        doc.setFont("helvetica", "bold");
        doc.text("Lender Details", col1X, boxTop + 20);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Name: ${lenderName || "-"}`, col1X, boxTop + 38);
        doc.text(`PhonePe: ${phonepe || "-"}`, col1X, boxTop + 56);
        doc.text(`Email: ${email || "-"}`, col1X, boxTop + 74);
        doc.text(`Aadhar No: ${aadharNumber || "-"}`, col1X, boxTop + 92);
        const addrWrapped = doc.splitTextToSize(`Address: ${address || "-"}`, colWidth - 24);
        doc.text(addrWrapped, col1X, boxTop + 110);

        doc.setFont("helvetica", "bold");
        doc.text("Loan Details", col2X, boxTop + 20);
        doc.setFont("helvetica", "normal");
        doc.text(`Principal: Rs. ${amount || "-"}`, col2X, boxTop + 38);
        doc.text(`Rate: Rs. ${rate || "-"} per 100`, col2X, boxTop + 56);
        doc.text(`Monthly Interest: Rs. ${monthly || "-"}`, col2X, boxTop + 74);
        doc.text(`Total Monthly Payment: Rs. ${total || "-"}`, col2X, boxTop + 92);

        // Agreement paragraph
        const bodyTop = boxTop + boxHeight + 20;
        doc.setFontSize(11);
        doc.setTextColor(60, 60, 60);
        doc.setFont("helvetica", "normal");

        const paragraph = `This Promissory Note is executed between the Lender and the Borrower. The Borrower acknowledges receipt of the principal amount stated above and agrees to repay the principal together with interest at the rate specified. Payments shall be made monthly and in accordance with the terms set forth in this agreement. Failure to comply with the repayment schedule may result in additional charges and legal action as permitted by applicable law.`;

        const split = doc.splitTextToSize(paragraph, usableWidth);
        doc.text(split, left, bodyTop);

        // Signature lines
        const sigY = bodyTop + split.length * 12 + 40;
        doc.setFontSize(11);
        doc.text("Lender Signature:", left, sigY);
        doc.line(left + 110, sigY - 6, left + 300, sigY - 6);
        doc.text("Borrower Signature:", left + 320, sigY);
        doc.line(left + 420, sigY - 6, left + 560, sigY - 6);

        // QR embed if provided
        const embedQrThenFinish = (maybeQrDataUrl) => {
          if (maybeQrDataUrl) {
            try {
              doc.addImage(maybeQrDataUrl, "JPEG", pageWidth - 160, sigY + 20, 100, 100);
            } catch (err) {
              // ignore embed error
            }
          }
          // Footer on page 1
          doc.setDrawColor(220);
          doc.line(left, 760, pageWidth - left, 760);
          doc.setFontSize(10);
          doc.setTextColor(100, 100, 100);
          doc.text(`Customer Support: ${SUPPORT_EMAIL}`, pageWidth / 2, 780, { align: "center" });
          doc.text(`Generated by LendCash App`, pageWidth / 2, 794, { align: "center" });

          // Page 2 - Terms & Conditions
          doc.addPage();
          doc.setFillColor(20, 60, 120);
          doc.rect(0, 0, pageWidth, 50, "F");
          doc.setFontSize(14);
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.text("Terms & Conditions", left, 34);

          doc.setFontSize(11);
          doc.setTextColor(40, 40, 40);
          doc.setFont("helvetica", "normal");

          const terms = [
            "1. The Borrower shall repay the principal and interest in monthly installments as specified in this agreement.",
            "2. Payments not received by the due date shall be considered late and may incur late fees as determined by the Lender.",
            "3. The Lender may demand immediate repayment of the outstanding balance in case of default or material breach.",
            "4. The Borrower authorizes the Lender to take necessary legal action to recover outstanding amounts, including recovery costs.",
            "5. This agreement does not waive any statutory rights available to either party under applicable law.",
            "6. Any amendment to this agreement must be made in writing and signed by both parties.",
            "7. The Lender will maintain confidentiality of personal data except where disclosure is required by law or regulatory authorities.",
            "8. Governing Law: This agreement shall be governed by and construed in accordance with the laws of Hyderabad, India.",
            "9. Dispute Resolution: Parties agree to attempt amicable resolution; unresolved disputes will be subject to the courts of Hyderabad.",
            "10. Customer Support: For queries or disputes contact dascivil.k@gmail.com.",
          ];

          let y = 90;
          const lineHeight = 14;
          terms.forEach((t) => {
            const wrapped = doc.splitTextToSize(t, usableWidth);
            doc.text(wrapped, left, y);
            y += wrapped.length * lineHeight;
            y += 6;
            if (y > 720) {
              doc.addPage();
              y = 60;
            }
          });

          // Final footer on last page
          doc.setDrawColor(220);
          doc.line(left, 760, pageWidth - left, 760);
          doc.setFontSize(10);
          doc.setTextColor(100, 100, 100);
          doc.text(`Customer Support: ${SUPPORT_EMAIL}`, pageWidth / 2, 780, { align: "center" });
          doc.text(`LendCash Confidential`, pageWidth / 2, 794, { align: "center" });

          const blob = doc.output("blob");
          resolve({ blob, refId, timestamp });
        };

        if (qrFile && qrFile.type && qrFile.type.startsWith("image/")) {
          const readerQ = new FileReader();
          readerQ.onload = (evQ) => {
            embedQrThenFinish(evQ.target.result);
          };
          readerQ.onerror = () => embedQrThenFinish(null);
          readerQ.readAsDataURL(qrFile);
        } else {
          embedQrThenFinish(null);
        }
      } catch (err) {
        reject(err);
      }
    });
  };

  // -------------------------
  // Debug helper: verify file inputs and print FormData contents
  // -------------------------
  function verifyAndLogFormFiles(formEl, expectedFileSelectors = ["#pdfFile"]) {
    if (!formEl) {
      console.error("verifyAndLogFormFiles: form element is null");
      return { ok: false, reason: "no-form" };
    }

    const missingFiles = [];
    expectedFileSelectors.forEach((sel) => {
      const input = formEl.querySelector(sel);
      if (!input) {
        missingFiles.push(`${sel} (input not found)`);
      } else if (!input.files || input.files.length === 0) {
        missingFiles.push(`${sel} (no file attached)`);
      }
    });

    try {
      const fd = new FormData(formEl);
      console.group("FormData dump before sendForm");
      for (const pair of fd.entries()) {
        const [name, value] = pair;
        if (value instanceof File) {
          console.log(`${name}: File — ${value.name} (${value.size} bytes, type=${value.type})`);
        } else {
          const snippet = String(value).slice(0, 200);
          console.log(`${name}: Text — ${snippet}${String(value).length > 200 ? "…(truncated)" : ""}`);
        }
      }
      console.groupEnd();
    } catch (err) {
      console.error("verifyAndLogFormFiles: FormData read failed", err);
    }

    if (missingFiles.length) {
      console.warn("verifyAndLogFormFiles: missing or empty file inputs:", missingFiles);
      return { ok: false, reason: "missing-files", details: missingFiles };
    }
    return { ok: true };
  }

  // -------------------------
  // EMAILJS ATTACH & SEND HELPER (PATCH)
  // -------------------------
  // Attaches a generated PDF blob to a hidden file input named "attachment" and sends the form via EmailJS.
  async function sendPdfViaEmailJS(formEl, pdfBlob, refId, extraFields = {}) {
    if (!formEl) throw new Error("Form element required");
    if (!pdfBlob) throw new Error("PDF blob required");

    // Create a File from the blob
    const fileName = `promissory_note_${refId || Date.now()}.pdf`;
    const pdfFile = new File([pdfBlob], fileName, { type: "application/pdf" });

    // Ensure a hidden file input named "attachment" exists in the form
    let fileInput = formEl.querySelector('input[type="file"][name="attachment"]');
    if (!fileInput) {
      fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.name = "attachment"; // must match template variable for attachments
      fileInput.style.display = "none";
      formEl.appendChild(fileInput);
    }

    // Attach the File object using DataTransfer
    try {
      const dt = new DataTransfer();
      dt.items.add(pdfFile);
      fileInput.files = dt.files;
    } catch (err) {
      console.error("Failed to attach file to input:", err);
      throw err;
    }

    // Populate required hidden text fields (ensure names match your EmailJS template)
    const ensureHidden = (name, value) => {
      let el = formEl.querySelector(`input[name="${name}"]`);
      if (!el) {
        el = document.createElement("input");
        el.type = "hidden";
        el.name = name;
        formEl.appendChild(el);
      }
      el.value = value || "";
    };

    ensureHidden("ref_id", refId || "");
    ensureHidden("from_email", extraFields.from_email || extraFields.email || "");
    ensureHidden("lender_name", extraFields.lender_name || "");
    ensureHidden("aadhar_number", extraFields.aadhar_number || "");
    ensureHidden("txn_id", extraFields.txn_id || "");
    ensureHidden("address", extraFields.address || "");
    // optional: ensureHidden("to_email", "dascivil.k@gmail.com");

    // Debug: log FormData so you can inspect the payload before sending
    try {
      const fd = new FormData(formEl);
      console.group("EmailJS FormData (about to send)");
      for (const pair of fd.entries()) {
        const [k, v] = pair;
        if (v instanceof File) {
          console.log(`${k}: File — ${v.name} (${v.size} bytes, type=${v.type})`);
        } else {
          console.log(`${k}: Text — ${String(v).slice(0, 300)}`);
        }
      }
      console.groupEnd();
    } catch (err) {
      console.warn("Could not enumerate FormData for debug", err);
    }

    // Send via EmailJS
    try {
      await emailjs.sendForm(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, formEl, EMAILJS_PUBLIC_KEY);
      console.log("EmailJS sendForm succeeded");
      return { ok: true };
    } catch (err) {
      console.error("EmailJS sendForm failed:", err);
      return { ok: false, error: err };
    } finally {
      // optional: clear the file input to avoid re-sending the same file accidentally
      try {
        fileInput.value = "";
      } catch {}
    }
  }

  // -------------------------
  // SERVER UPLOAD HELPER
  // -------------------------
  // Sends generated PDF and form fields to your server endpoint which will email support.
  async function uploadPdfAndDetailsToServer(pdfFile, { lenderName, aadharNumber, txnId, address, email, refId }) {
    try {
      const fd = new FormData();
      fd.append("pdfFile", pdfFile, pdfFile.name || "promissory_note.pdf");
      fd.append("lender_name", lenderName || "");
      fd.append("aadhar_number", aadharNumber || "");
      fd.append("txn_id", txnId || "");
      fd.append("address", address || "");
      fd.append("email", email || "");
      fd.append("ref_id", refId || "");

      const resp = await fetch(SERVER_UPLOAD_URL, {
        method: "POST",
        body: fd,
      });

      const json = await resp.json();
      if (!resp.ok || !json.ok) {
        console.error("Server upload failed", json);
        return { ok: false, error: json.error || "Server returned error" };
      }
      return { ok: true };
    } catch (err) {
      console.error("uploadPdfAndDetailsToServer error", err);
      return { ok: false, error: String(err) };
    }
  }

  // -------------------------
  // Handlers
  // -------------------------
  const handlePreview = async () => {
    setErrorMessage("");
    if (!amount || !rate) return;
    const { monthly, total } = calculateMonthlyInterest(+amount, +rate);
    setMonthlyInterest(monthly);
    setMonthlyTotal(total);
    setStep(2);
  };

  // Handle uploaded downloaded PDF change
  const handleUploadedDownloadedPdfChange = (file) => {
    setErrorMessage("");
    if (!file) {
      setUploadedDownloadedPdf(null);
      setUploadedDownloadedPdfName(null);
      setUploadedDownloadedPdfSize(0);
      return;
    }
    if (file.type !== "application/pdf") {
      setErrorMessage("Please upload a valid PDF file.");
      setUploadedDownloadedPdf(null);
      setUploadedDownloadedPdfName(null);
      setUploadedDownloadedPdfSize(0);
      return;
    }
    setUploadedDownloadedPdf(file);
    setUploadedDownloadedPdfName(file.name);
    setUploadedDownloadedPdfSize(file.size);
  };

  // -------------------------
  // handleSubmit (complete)
  // -------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!amount || !rate) {
      setErrorMessage("Please enter loan amount and interest rate.");
      return;
    }

    if (!lenderName) {
      setErrorMessage("Please enter lender name.");
      return;
    }

    if (!aadharNumber) {
      setErrorMessage("Please enter Aadhar number.");
      return;
    }
    if (!address) {
      setErrorMessage("Please enter address.");
      return;
    }

    const { monthly, total } = calculateMonthlyInterest(+amount, +rate);
    setMonthlyInterest(monthly);
    setMonthlyTotal(total);

    try {
      // Compress QR if present (optional)
      const compressedQr =
        uploadedQrFile && uploadedQrFile.type && uploadedQrFile.type.startsWith("image/")
          ? await compressImage(uploadedQrFile, 600, 0.6)
          : uploadedQrFile || null;

      // Generate professional PDF (includes aadhar number and address)
      const { blob, refId, timestamp } = await generateProfessionalPdfBlob({
        lenderName,
        phonepe,
        email,
        amount,
        rate,
        monthly,
        total,
        aadharNumber,
        address,
        qrFile: compressedQr,
      });

      // Prepare generated PDF file object
      const generatedPdfFile = new File([blob], `promissory_note_${refId}.pdf`, { type: "application/pdf" });

      const formEl = formRef.current;
      if (!formEl) throw new Error("Form element not found");

      // Attach generated PDF to main form (so main template receives it if expected)
      attachFileToInput(formEl, "#pdfFile", generatedPdfFile);
      if (compressedQr) attachFileToInput(formEl, "#qrFileHidden", compressedQr);

      // Set small hidden fields
      const refInput = formEl.querySelector("input[name='refId']");
      const tsInput = formEl.querySelector("input[name='timestamp']");
      if (refInput) refInput.value = refId;
      if (tsInput) tsInput.value = timestamp;
      const toEmailInput = formEl.querySelector("#toEmailHidden");
      if (toEmailInput) toEmailInput.value = SUPPORT_EMAIL;

      // Add aadhar and address into hidden small fields so main template can use them
      const aadharHidden = formEl.querySelector("input[name='aadharNumberHidden']");
      const addressHidden = formEl.querySelector("input[name='addressHidden']");
      const lenderHidden = formEl.querySelector("input[name='lenderNameHidden']");
      if (aadharHidden) aadharHidden.value = aadharNumber;
      if (addressHidden) addressHidden.value = address;
      if (lenderHidden) lenderHidden.value = lenderName;

      // Verify generated PDF is attached to the main form (only require pdfFile)
      const check = verifyAndLogFormFiles(formEl, ["#pdfFile"]);
      if (!check.ok) {
        setErrorMessage("Generated PDF not attached correctly. Check console for details.");
        return;
      }

      // Debug sizes (text variables)
      const totalTextBytes = debugFormSizes(formEl);
      if (totalTextBytes > 50 * 1024) {
        setErrorMessage("Form fields exceed EmailJS 50KB limit. Shorten text fields before sending.");
        return;
      }

      // 1) Send main email (promissory note) via EmailJS (optional)
      try {
        await emailjs.sendForm(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, formEl, EMAILJS_PUBLIC_KEY);
      } catch (err) {
        console.warn("Main EmailJS send failed (continuing to server upload):", err);
      }

      // 2) Upload to server which will send support email (server sends to dascivil.k@gmail.com)
      // Prefer uploadedDownloadedPdf if user provided it, otherwise send generatedPdfFile
      const fileToSendToServer = uploadedDownloadedPdf || generatedPdfFile;
      const serverResult = await uploadPdfAndDetailsToServer(fileToSendToServer, {
        lenderName,
        aadharNumber,
        txnId,
        address,
        email,
        refId,
      });

      // If server upload failed, fallback to EmailJS support send using the patched helper
      if (!serverResult.ok) {
        console.warn("Support server send failed:", serverResult.error);
        setErrorMessage("Support server failed; attempting to send via EmailJS as fallback.");

        // Use the EmailJS helper to attach and send the generated PDF and fields
        const extra = {
          lender_name: lenderName,
          aadhar_number: aadharNumber,
          txn_id: txnId,
          address,
          from_email: email,
        };

        const emailjsResult = await sendPdfViaEmailJS(formEl, blob, refId, extra);
        if (!emailjsResult.ok) {
          setErrorMessage("Both server upload and EmailJS fallback failed. Check console for details.");
          const url = URL.createObjectURL(blob);
          setPdfUrl(url);
          setSubmitted(true);
          return;
        }
      }

      // Success
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      setSubmitted(true);
    } catch (err) {
      console.error("handleSubmit failed:", err);
      const status = err && err.status ? err.status : "unknown";
      const text = err && err.text ? err.text : (err && err.message) || "Unknown error";
      if (status === 413 || (typeof text === "string" && text.toLowerCase().includes("variables size"))) {
        setErrorMessage("Send failed: variables exceed allowed size. Shorten text fields before sending.");
      } else {
        setErrorMessage(`Send failed (${status}): ${text}. Contact support: ${SUPPORT_EMAIL}`);
      }
      if (process.env.NODE_ENV !== "production") {
        alert(`Error ${status}: ${text}`);
      }
    }
  };

  const resetForm = () => {
    setStep(1);
    setSubmitted(false);
    setPdfUrl(null);
    setErrorMessage("");
    setLenderName("");
    setPhonepe("");
    setEmail("");
    setAmount("");
    setRate("");
    setMonthlyInterest(null);
    setMonthlyTotal(null);
    setAadharNumber("");
    setAddress("");
    setTxnId("");
    setUploadedQrFile(null);
    setUploadedDownloadedPdf(null);
    setUploadedDownloadedPdfName(null);
    setUploadedDownloadedPdfSize(0);
    if (qrPreviewUrl) {
      URL.revokeObjectURL(qrPreviewUrl);
      setQrPreviewUrl(null);
    }
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
  };

  // -------------------------
  // JSX
  // -------------------------
  return (
    <div className="form-container">
      {!submitted ? (
        <>
          <div className="progress-bar">
            <div className={`progress-step ${step >= 1 ? "active" : ""}`}>Step 1: Details</div>
            <div className={`progress-step ${step >= 2 ? "active" : ""}`}>Step 2: Review</div>
          </div>

          <h2 className="form-title">LendCash Promissory Note</h2>

          {errorMessage && <div className="error-box">{errorMessage}</div>}

          <form ref={formRef} onSubmit={handleSubmit} className="lender-form">
            {step === 1 && (
              <>
                <label>Full Name of Lender</label>
                <input value={lenderName} onChange={(e) => setLenderName(e.target.value)} placeholder="Enter full name" required />

                <label>PhonePe Number</label>
                <input type="tel" value={phonepe} onChange={(e) => setPhonepe(e.target.value)} placeholder="PhonePe number (linked to UPI)" required />

                <label>Email ID</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" required />

                <label>Loan Amount (Rs.)</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g., 5000" required />

                <label>Interest Rate (Rs. per 100)</label>
                <input type="number" min="1" max="7" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="1 - 7" required />

                <label>Enter Aadhar Number</label>
                <input
                  type="text"
                  value={aadharNumber}
                  onChange={(e) => setAadharNumber(e.target.value.trim())}
                  placeholder="Enter Aadhar number"
                  required
                />

                <label>Enter Address</label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter full address"
                  rows={3}
                  required
                />

                <label>Enter Transaction ID (TXN ID) — optional (sent only to support)</label>
                <input
                  type="text"
                  value={txnId}
                  onChange={(e) => setTxnId(e.target.value.trim())}
                  placeholder="Enter payment TXN ID (e.g., UPI/Bank reference)"
                />
                <p className="small-note" style={{ marginTop: 6 }}>
                  The TXN ID, Aadhar number and Address will be sent to customer support ({SUPPORT_EMAIL}) for verification.
                </p>

                {/* Optional QR upload */}
                <label>Scan QR Code to send the Amount</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 140,
                      height: 140,
                      border: "1px solid #e0e0e0",
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#fff",
                    }}
                  >
                    <img src={DEFAULT_QR_PUBLIC} alt="QR Code" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    
                  </div>
                </div>

                <input
                  id="qrReplaceInput"
                  type="file"
                  accept=".jpg,.jpeg,.png"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                    setUploadedQrFile(file);
                    if (file) {
                      if (qrPreviewUrl) {
                        URL.revokeObjectURL(qrPreviewUrl);
                      }
                      try {
                        const obj = URL.createObjectURL(file);
                        setQrPreviewUrl(obj);
                      } catch {
                        setQrPreviewUrl(null);
                      }
                    }
                  }}
                />

                <div className="form-actions">
                  <button type="button" className="btn-primary" onClick={handlePreview}>
                    Preview Monthly Interest
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <div className="preview-box">
                <p>
                  <strong>Monthly Interest:</strong> Rs. {monthlyInterest}
                </p>
                <p>
                  <strong>Total Monthly Payment Received:</strong> Rs. {monthlyTotal}
                </p>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ marginBottom: 6, fontSize: 13 }}>QR Code (preview)</p>
                    <img src={qrPreviewUrl || DEFAULT_QR_PUBLIC} alt="Uploaded QR" style={{ width: 120, height: 120 }} />
                  </div>

                  <div style={{ textAlign: "center" }}>
                    <p style={{ marginBottom: 6, fontSize: 13 }}>Aadhar Number</p>
                    <p style={{ maxWidth: 200, wordBreak: "break-word" }}>{aadharNumber}</p>
                  </div>

                  <div style={{ textAlign: "center" }}>
                    <p style={{ marginBottom: 6, fontSize: 13 }}>Address</p>
                    <p style={{ maxWidth: 260, wordBreak: "break-word" }}>{address}</p>
                  </div>

                  {txnId && (
                    <div style={{ textAlign: "center" }}>
                      <p style={{ marginBottom: 6, fontSize: 13 }}>TXN ID (sent to support)</p>
                      <p style={{ maxWidth: 200, wordBreak: "break-word" }}>{txnId}</p>
                    </div>
                  )}
                </div>

                {/* Upload Downloaded PDF field */}
                <div style={{ marginTop: 16 }}>
                  <label>Upload Downloaded PDF (optional) — this file will be sent to customer support</label>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => handleUploadedDownloadedPdfChange(e.target.files[0] || null)}
                  />
                  <div style={{ marginTop: 8 }}>
                    {uploadedDownloadedPdfName ? (
                      <div style={{ fontSize: 13 }}>
                        <strong>Selected:</strong> {uploadedDownloadedPdfName} — {(uploadedDownloadedPdfSize / 1024).toFixed(2)} KB
                      </div>
                    ) : (
                      <div style={{ color: "#666", fontSize: 13 }}>No file uploaded. The freshly generated PDF will be sent to support automatically.</div>
                    )}
                  </div>
                </div>

                <div className="form-actions" style={{ marginTop: 16 }}>
                  <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
                    Edit Details
                  </button>
                  <button type="submit" className="btn-primary">
                    Submit, Download & Email PDF
                  </button>
                </div>
              </div>
            )}

            {/* Hidden inputs for EmailJS attachments (we attach generated PDF programmatically) */}
            <input type="file" id="pdfFile" name="pdfFile" style={{ display: "none" }} />
            <input type="file" id="qrFileHidden" name="qrFile" style={{ display: "none" }} />

            {/* Hidden small variables */}
            <input type="hidden" name="refId" value="" />
            <input type="hidden" name="timestamp" value="" />

            {/* Hidden field to instruct EmailJS to send to support email (optional for main template) */}
            <input type="hidden" id="toEmailHidden" name="to_email" value={SUPPORT_EMAIL} />

            {/* include visible fields in form so email template can use them */}
            <input type="hidden" name="lenderName" value={lenderName} />
            <input type="hidden" name="phonepe" value={phonepe} />
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="amount" value={amount} />
            <input type="hidden" name="rate" value={rate} />

            {/* Hidden small fields for aadhar, address and lender name so main template can use them */}
            <input type="hidden" name="aadharNumberHidden" value={aadharNumber} />
            <input type="hidden" name="addressHidden" value={address} />
            <input type="hidden" name="lenderNameHidden" value={lenderName} />
          </form>

          <p className="support">
            Customer Support: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
        </>
      ) : (
        <div className="confirmation-screen">
          <h2>✅ Thank You!</h2>
          <p>Your promissory note has been generated and emailed successfully.</p>

          {pdfUrl && (
            <p>
              <a className="download-link" href={pdfUrl} download>
                Download PDF
              </a>
            </p>
          )}

          <div className="form-actions">
            <button className="btn-primary" onClick={resetForm}>
              Start New Form
            </button>
          </div>

          <p className="support">
            Need help? Contact <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
        </div>
      )}
    </div>
  );
}
