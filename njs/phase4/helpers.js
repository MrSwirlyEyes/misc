'use strict';

// ─── Pure Utilities ───────────────────────────────────────────────────────────

function escHtml(val) {
  if (val == null) return '';
  return String(val)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/**
 * Accepts a Date object or any value parseable by new Date().
 * Returns "April 23, 2026 at 2:30 PM". Falls back to String(val) on bad input.
 */
function formatDate(val) {
  if (val == null) return '';
  var d = (val instanceof Date) ? val : new Date(val);
  if (isNaN(d.getTime())) return String(val);
  var datePart = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long',  day: 'numeric'  });
  var timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${datePart} at ${timePart}`;
}

// ─── Link ─────────────────────────────────────────────────────────────────────

// Explicit inline style so Outlook respects link colour.
var LINK_STYLE = "color:#60a5fa;text-decoration:underline;font-family:'Segoe UI',Arial,sans-serif;";

/**
 * Returns an anchor tag when href is provided, otherwise escaped plain text.
 */
function link(href, text) {
  if (!href) return escHtml(text);
  return `<a href="${escHtml(href)}" style="${LINK_STYLE}">${escHtml(text)}</a>`;
}

// ─── Table Row Builders ───────────────────────────────────────────────────────
//
// Every row in the equipment and ticket tables uses an identical 2-column grid:
//   col 1 — 175px label cell (bgcolor #040e1e)
//   col 2 — auto value cell  (bgcolor #040e1e)
//
// Both dataRow AND noteRow use this structure.  A colspan on any row would break
// the column-width negotiation and cause value columns in stacked tables to
// misalign — the source of many past alignment bugs.  Never add colspan to rows
// inside these tables.

/**
 * Standard label / value row.
 * valueHtml is injected as raw HTML so callers can pass link() output.
 */
function dataRow(label, valueHtml) {
  return `
    <tr>
      <td width="175" valign="top"
        bgcolor="#040e1e"
        style="width:175px;background-color:#040e1e;
               padding:9px 10px 9px 14px;
               border-top:1px solid #162040;">
        <span style="font-size:11px;color:#4a6080;text-transform:uppercase;
                     letter-spacing:1px;font-family:'Segoe UI',Arial,sans-serif;">${escHtml(label)}</span>
      </td>
      <td valign="top"
        bgcolor="#040e1e"
        style="background-color:#040e1e;
               padding:9px 14px 9px 10px;
               border-top:1px solid #162040;">
        <span style="font-size:13px;color:#c8d8f0;font-weight:600;
                     font-family:'Segoe UI',Arial,sans-serif;">${valueHtml}</span>
      </td>
    </tr>`;
}

/**
 * Multi-line label / text row — same 2-column structure as dataRow.
 * Uses a lighter text colour (#b0c4de) to visually distinguish free-form
 * text from single-value fields.  Newlines become <br>.
 */
function noteRow(label, text) {
  return `
    <tr>
      <td width="175" valign="top"
        bgcolor="#040e1e"
        style="width:175px;background-color:#040e1e;
               padding:10px 10px 14px 14px;
               border-top:1px solid #162040;">
        <span style="font-size:11px;color:#4a6080;text-transform:uppercase;
                     letter-spacing:1px;font-family:'Segoe UI',Arial,sans-serif;">${escHtml(label)}</span>
      </td>
      <td valign="top"
        bgcolor="#040e1e"
        style="background-color:#040e1e;
               padding:10px 14px 14px 10px;
               border-top:1px solid #162040;">
        <span style="font-size:13px;color:#b0c4de;line-height:1.6;
                     font-family:'Segoe UI',Arial,sans-serif;">${escHtml(text).replace(/\n/g, '<br>')}</span>
      </td>
    </tr>`;
}

/**
 * Bold blue section header with a coloured bottom border.
 * borderColor should match the email type's header colour (blue/amber/green).
 */
function sectionLabel(title, borderColor) {
  borderColor = borderColor || '#1a3a8f';
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="margin-top:18px;margin-bottom:5px;">
      <tr>
        <td style="padding-bottom:5px;border-bottom:2px solid ${borderColor};">
          <span style="font-size:11px;font-weight:700;color:#4a90d9;
                       text-transform:uppercase;letter-spacing:2px;
                       font-family:'Segoe UI',Arial,sans-serif;">${escHtml(title)}</span>
        </td>
      </tr>
    </table>`;
}

// ─── Capability Row ───────────────────────────────────────────────────────────

/**
 * Single capability item — 4px coloured stripe + content cell.
 * Implemented as a nested 2-column table because a simple CSS left-border on
 * a <td> is unreliable in Outlook; a dedicated stripe cell is not.
 */
function capRow(text, stripeColor, bgColor, textColor) {
  return `
    <tr>
      <td style="padding:2px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="4" bgcolor="${stripeColor}"
              style="width:4px;font-size:1px;line-height:1px;">&nbsp;</td>
            <td bgcolor="${bgColor}"
              style="background-color:${bgColor};padding:6px 12px;">
              <span style="font-size:12px;color:${textColor};
                           font-family:'Segoe UI',Arial,sans-serif;">${escHtml(text)}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

/**
 * Renders an array of capability strings as stripe-bordered rows.
 * Handles the empty state gracefully.
 *
 * @param {string[]} capabilities
 * @param {string}   stripeColor   Default: red (#c0392b) for disabled
 * @param {string}   bgColor       Default: dark blue (#0f2040)
 * @param {string}   textColor     Default: soft red (#e88080)
 * @param {string}   prefix        Optional prefix, e.g. '✓ ' for restored
 */
function capabilitySection(capabilities, stripeColor, bgColor, textColor, prefix) {
  stripeColor = stripeColor || '#c0392b';
  bgColor     = bgColor     || '#0f2040';
  textColor   = textColor   || '#e88080';
  prefix      = prefix      || '';

  if (!capabilities || !capabilities.length) {
    return `
      <tr>
        <td style="padding:8px 0;">
          <span style="font-size:12px;color:#4a6080;font-style:italic;
                       font-family:'Segoe UI',Arial,sans-serif;">None specified</span>
        </td>
      </tr>`;
  }
  return capabilities.map(function(c) {
    return capRow(prefix + c, stripeColor, bgColor, textColor);
  }).join('');
}

// ─── Activity Log Section ─────────────────────────────────────────────────────

/**
 * Renders the Activity Log section.
 * Sorts descending by dateCreated — most recent entry first.
 * Handles empty array gracefully (common on ticket opened).
 *
 * @param {Array}  logs         [{ description, dateCreated, userCreated }]
 * @param {string} borderColor  Matches the email type's header accent colour
 */
function logsSection(logs, borderColor) {
  var label = sectionLabel('Activity Log', borderColor);

  if (!logs || !logs.length) {
    return `
      ${label}
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
        <tr>
          <td style="padding:4px 0;">
            <span style="font-size:12px;color:#4a6080;font-style:italic;
                         font-family:'Segoe UI',Arial,sans-serif;">No log entries recorded.</span>
          </td>
        </tr>
      </table>`;
  }

  var sorted = logs.slice().sort(function(a, b) {
    return new Date(b.dateCreated) - new Date(a.dateCreated);
  });

  var rows = sorted.map(function(log) {
    var meta = `${escHtml(formatDate(log.dateCreated))}&nbsp;&mdash;&nbsp;${escHtml(log.userCreated)}`;
    return `
      <tr>
        <td style="padding:2px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="4" bgcolor="#2a4a6a"
                style="width:4px;font-size:1px;line-height:1px;">&nbsp;</td>
              <td bgcolor="#071828"
                style="background-color:#071828;padding:8px 12px;">
                <p style="margin:0 0 4px 0;font-size:10px;color:#4a6080;
                           font-family:'Segoe UI',Arial,sans-serif;">${meta}</p>
                <p style="margin:0;font-size:12px;color:#c8d8f0;line-height:1.5;
                           font-family:'Segoe UI',Arial,sans-serif;">${escHtml(log.description).replace(/\n/g, '<br>')}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
  }).join('');

  return `
    ${label}
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      ${rows}
    </table>`;
}

// ─── Critical Badge ───────────────────────────────────────────────────────────
// Must be a <td> with bgcolor — Outlook ignores background-color on <span>.
// Rendered as display:inline-table so it sits beside the equipment name text.

function criticalBadge(isCritical) {
  if (isCritical) {
    return `
      <table cellpadding="0" cellspacing="0" border="0" style="display:inline-table;">
        <tr>
          <td bgcolor="#8b1a1a"
            style="background-color:#8b1a1a;padding:2px 8px;">
            <span style="font-size:10px;font-weight:700;color:#ffffff;
                         text-transform:uppercase;letter-spacing:1px;
                         font-family:'Segoe UI',Arial,sans-serif;">&#9888; CRITICAL</span>
          </td>
        </tr>
      </table>`;
  }
  return `
    <table cellpadding="0" cellspacing="0" border="0" style="display:inline-table;">
      <tr>
        <td bgcolor="#1e2a3a"
          style="background-color:#1e2a3a;padding:2px 8px;">
          <span style="font-size:10px;color:#6a7a8a;
                       font-family:'Segoe UI',Arial,sans-serif;">Standard</span>
        </td>
      </tr>
    </table>`;
}

module.exports = {
  escHtml,
  formatDate,
  LINK_STYLE,
  link,
  dataRow,
  noteRow,
  sectionLabel,
  capRow,
  capabilitySection,
  logsSection,
  criticalBadge
};
