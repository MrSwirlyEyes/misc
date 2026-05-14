'use strict';

var helpers   = require('./helpers');
var constants = require('../config/constants');

var escHtml  = helpers.escHtml;
var LOGO_CID = constants.MAILER.LOGO_CID;

// Module-level template constants — only the shell needs these.
var LOGO_WIDTH   = 140;           // px — match your actual logo dimensions
var LOGO_HEIGHT  = 40;
var LOGO_ALT     = 'Organization Logo';
var SYSTEM_NAME  = 'Maintenance Management System';

// ─── buildShell ───────────────────────────────────────────────────────────────
// Renders the outer chrome shared by all ticket notification types:
//   outer wrapper → card → header → alert bar → body slot → footer
//
// OUTLOOK DECISIONS BAKED IN
// ──────────────────────────
// • No gradients — Outlook's Word renderer drops CSS gradients entirely.
//   Solid bgcolor attributes only.  bgcolor is declared on BOTH the HTML
//   attribute and in the style property (belt and suspenders for older Outlook).
// • No rgba() — Outlook strips alpha, producing solid unexpected colours.
//   All colours are opaque hex, chosen darker than desired so Outlook's
//   gamma-brightening correction lands near the intended shade.
// • No border-radius — Outlook ignores it; square corners render consistently.
// • MSO conditional <style> overrides the cells Outlook brightens most.
// • Status pill: a proper <td> with bgcolor — Outlook ignores background-color
//   on inline elements.  The pill is right-aligned in the ticket # column,
//   stacked below the date, sized to content with no fixed width.
// • Width 560px: safe for Outlook reading panes down to ~600px window width.
// • font-family on every text element — Outlook does not reliably inherit.
//
// @param {object} s
//   @param {string} s.ticketNumber
//   @param {string} s.eventDate        Pre-formatted via formatDate()
//   @param {string} s.heading          e.g. 'New Ticket Opened'
//   @param {string} s.headerBg         Solid hex colour for the header band
//   @param {string} s.headingAccent    Colour for system label, ticket #, date
//   @param {string} s.statusBg         Status pill background colour
//   @param {string} s.statusLabel      e.g. 'Open', 'In Progress', 'Closed'
//   @param {string} s.alertStripe      4px left stripe colour on the alert bar
//   @param {string} s.alertText        Inner HTML of the alert bar paragraph
//   @param {string} s.bodyHtml         Rendered body sections from the builder

function buildShell(s) {
  return `<!DOCTYPE html>
<html lang="en" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(s.heading)} &ndash; ${escHtml(s.ticketNumber)}</title>
  <!--[if gte mso 9]>
  <xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  <![endif]-->
  <style>
    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img   { -ms-interpolation-mode:bicubic; }
    body  { -ms-text-size-adjust:100%; -webkit-text-size-adjust:100%; }
  </style>
  <!--[if mso]>
  <style>
    .bg-outer    { background-color:#050d1a !important; }
    .bg-card     { background-color:#081428 !important; }
    .bg-header   { background-color:${s.headerBg}  !important; }
    .bg-alertbar { background-color:#060f20 !important; }
    .bg-footer   { background-color:#030a14 !important; }
    .bg-eqhdr    { background-color:#081830 !important; }
    .bg-row      { background-color:#040e1e !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#050d1a;">

<table width="100%" cellpadding="0" cellspacing="0" border="0"
  bgcolor="#050d1a" class="bg-outer"
  style="background-color:#050d1a;">
<tr><td align="center" style="padding:24px 0;">

<table width="560" cellpadding="0" cellspacing="0" border="0"
  bgcolor="#081428" class="bg-card"
  style="width:560px;background-color:#081428;border:1px solid #162040;">

  <!-- ════ HEADER ════════════════════════════════════════════════════════════ -->
  <tr>
    <td bgcolor="${s.headerBg}" class="bg-header"
      style="background-color:${s.headerBg};padding:0;">

      <!-- Logo -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding:16px 18px 10px;">
            <img src="cid:${LOGO_CID}"
              alt="${escHtml(LOGO_ALT)}"
              width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}"
              style="display:block;border:0;outline:none;text-decoration:none;">
          </td>
        </tr>
      </table>

      <!-- System name + heading | Ticket # + date + status pill -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <!-- Left: system label + heading -->
          <td valign="top" style="padding:0 18px 16px;">
            <p style="margin:0 0 2px 0;font-size:10px;color:${s.headingAccent};
                      text-transform:uppercase;letter-spacing:2px;
                      font-family:'Segoe UI',Arial,sans-serif;">${escHtml(SYSTEM_NAME)}</p>
            <p style="margin:0;font-size:21px;font-weight:700;color:#ffffff;
                      font-family:'Segoe UI',Arial,sans-serif;">${escHtml(s.heading)}</p>
          </td>
          <!-- Right: ticket # + date + status pill (stacked) -->
          <td valign="top" align="right" style="padding:0 18px 16px;white-space:nowrap;">
            <p style="margin:0;font-size:17px;font-weight:800;color:${s.headingAccent};
                      font-family:'Segoe UI',Arial,sans-serif;">#${escHtml(s.ticketNumber)}</p>
            <p style="margin:3px 0 8px 0;font-size:10px;color:${s.headingAccent};
                      font-family:'Segoe UI',Arial,sans-serif;">${escHtml(s.eventDate)}</p>
            <!-- Status pill: align="right" shrink-wraps to content width in Outlook -->
            <table cellpadding="0" cellspacing="0" border="0" align="right">
              <tr>
                <td bgcolor="${s.statusBg}"
                  style="background-color:${s.statusBg};
                         padding:3px 10px;
                         border:1px solid ${s.headingAccent};
                         white-space:nowrap;">
                  <span style="font-size:10px;font-weight:700;color:#ffffff;
                               text-transform:uppercase;letter-spacing:1px;
                               font-family:'Segoe UI',Arial,sans-serif;">${escHtml(s.statusLabel)}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

    </td>
  </tr>

  <!-- ════ ALERT BAR ═════════════════════════════════════════════════════════ -->
  <tr>
    <td style="padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="4" bgcolor="${s.alertStripe}"
            style="width:4px;font-size:1px;line-height:1px;">&nbsp;</td>
          <td bgcolor="#060f20" class="bg-alertbar"
            style="background-color:#060f20;padding:9px 14px;">
            <p style="margin:0;font-size:12px;color:#8aaccc;line-height:1.5;
                      font-family:'Segoe UI',Arial,sans-serif;">${s.alertText}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ════ BODY ══════════════════════════════════════════════════════════════ -->
  <tr>
    <td bgcolor="#081428" class="bg-card"
      style="background-color:#081428;padding:2px 18px 20px;">
      ${s.bodyHtml}
    </td>
  </tr>

  <!-- ════ FOOTER ════════════════════════════════════════════════════════════ -->
  <tr>
    <td bgcolor="#030a14" class="bg-footer"
      style="background-color:#030a14;padding:12px 18px;
             border-top:1px solid #162040;text-align:center;">
      <p style="margin:0;font-size:10px;color:#304050;
                font-family:'Segoe UI',Arial,sans-serif;">
        Automated notification &mdash; do not reply to this email.
      </p>
      <p style="margin:4px 0 0 0;font-size:10px;color:#304050;
                font-family:'Segoe UI',Arial,sans-serif;">
        Ticket <strong style="color:#4a90d9;">#${escHtml(s.ticketNumber)}</strong>
        &bull; ${escHtml(s.eventDate)}
        &nbsp;&bull;&nbsp;
        <a href="${escHtml(process.env.APP_URL || '')}/notification-preferences?equipment_id=${escHtml(String(s.equipmentId || ''))}"
          style="color:#4a90d9;text-decoration:underline;font-family:'Segoe UI',Arial,sans-serif;">
          Manage notifications
        </a>
      </p>
    </td>
  </tr>

</table><!-- end card -->
</td></tr>
</table><!-- end outer wrapper -->

</body></html>`;
}

module.exports = { buildShell };
