'use strict';

// ─── Nodemailer Transport ─────────────────────────────────────────────────────
// This email-service process uses nodemailer v6 (modern promise API).
// The main API process uses v0.7.1 — these are separate packages in separate
// processes, no conflict.
//
// npm install nodemailer@6        (in the email-service package.json)
//
// Required environment variables:
//   SMTP_HOST   SMTP server hostname, e.g. "mail.yourorg.com"
//   SMTP_PORT   SMTP port (default: 587)
//
// For an internal Exchange relay with IP-based trust (most common in
// Windows/AD environments), remove the auth block entirely and set
// SMTP_SECURE=false.  The relay accepts mail from known internal IPs
// without credentials.
//
// For auth-required SMTP:
//   SMTP_USER   Mailbox username
//   SMTP_PASS   Mailbox password
//   SMTP_SECURE 'true' for TLS on port 465, omit or 'false' for STARTTLS

var nodemailer = require('nodemailer');

var transportConfig = {
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true'   // true = port 465 TLS, false = STARTTLS
};

// Only attach auth block when credentials are supplied.
// Remove this block entirely if your relay uses IP-based trust.
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transportConfig.auth = {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  };
}

var transport = nodemailer.createTransport(transportConfig);

module.exports = transport;
