// server/index.js
require("dotenv").config();
const express = require("express");
const multer = require("multer");
const nodemailer = require("nodemailer");
const cors = require("cors");

const app = express();
app.use(cors());
const upload = multer(); // memory storage

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const SMTP_USER = process.env.SMTP_USER || "your-smtp-user@example.com";
const SMTP_PASS = process.env.SMTP_PASS || "your-smtp-password";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "dascivil.k@gmail.com";

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/api/send-support", upload.single("pdfFile"), async (req, res) => {
  try {
    const { lender_name, aadhar_number, txn_id, address, email, ref_id } = req.body;
    const file = req.file;

    if (!lender_name || !aadhar_number) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    const subject = `Promissory Note from ${lender_name}${ref_id ? ` (${ref_id})` : ""}`;
    const text = [
      `Lender Name: ${lender_name}`,
      `Aadhar Number: ${aadhar_number}`,
      `TXN ID: ${txn_id || "-"}`,
      `Address: ${address || "-"}`,
      `Sender Email: ${email || "-"}`,
      `Reference: ${ref_id || "-"}`,
    ].join("\n");

    const mailOptions = {
      from: email || SMTP_USER,
      to: SUPPORT_EMAIL,
      subject,
      text,
      attachments: [],
    };

    if (file && file.buffer) {
      mailOptions.attachments.push({
        filename: file.originalname || `promissory_note_${Date.now()}.pdf`,
        content: file.buffer,
        contentType: file.mimetype || "application/pdf",
      });
    }

    await transporter.sendMail(mailOptions);
    return res.json({ ok: true });
  } catch (err) {
    console.error("send-support error:", err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Support mail server listening on ${PORT}`));
