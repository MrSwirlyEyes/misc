'use strict';

var h = require('./helpers');

// ─── equipmentBlock ───────────────────────────────────────────────────────────
// Renders the Equipment Information card — identical across all three email
// types so it lives here once.
//
// The equipment name row uses colspan=2 with a nested 2-column table for the
// name + badge layout.  This keeps the outer table a pure [175px | auto]
// 2-column grid, ensuring the value column aligns with the ticket table below.
//
// data.equipmentUrl is optional.  When provided the name becomes a hyperlink
// and a "View Equipment in App →" row is appended.
//
// @param {object} data
//   @param {string}  data.equipmentName
//   @param {string}  data.assetNumber
//   @param {string}  data.serialNumber
//   @param {string}  data.manufacturer
//   @param {string}  data.model
//   @param {boolean} data.isCritical
//   @param {string}  data.equipmentType
//   @param {string}  data.location
//   @param {string}  data.poc
//   @param {string}  [data.equipmentUrl]
// @param {string} borderColor   Matches the email type's header accent colour

function equipmentBlock(data, borderColor) {
  var nameDisplay = data.equipmentUrl
    ? h.link(data.equipmentUrl, data.equipmentName)
    : h.escHtml(data.equipmentName);

  var viewRow = data.equipmentUrl ? `
      <tr>
        <td width="175" valign="top"
          bgcolor="#040e1e"
          style="width:175px;background-color:#040e1e;
                 padding:6px 10px 10px 14px;
                 border-top:1px solid #162040;">
        </td>
        <td valign="top"
          bgcolor="#040e1e"
          style="background-color:#040e1e;
                 padding:6px 14px 10px 10px;
                 border-top:1px solid #162040;">
          <a href="${h.escHtml(data.equipmentUrl)}"
            style="${h.LINK_STYLE}font-size:12px;">
            View Equipment in App &rarr;
          </a>
        </td>
      </tr>` : '';

  return `
    ${h.sectionLabel('Equipment Information', borderColor)}
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="border:1px solid #162040;">

      <!-- Equipment name row — colspan=2 with nested name+badge table.
           This preserves the outer table's [175px | auto] column grid so
           the value column aligns with the ticket details table below. -->
      <tr>
        <td colspan="2" bgcolor="#081830" class="bg-eqhdr"
          style="background-color:#081830;padding:10px 14px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td valign="middle">
                <p style="margin:0 0 3px 0;font-size:10px;color:#4a6080;
                          text-transform:uppercase;letter-spacing:1px;
                          font-family:'Segoe UI',Arial,sans-serif;">Equipment Name</p>
                <p style="margin:0;font-size:15px;font-weight:700;color:#c8d8f0;
                          font-family:'Segoe UI',Arial,sans-serif;">${nameDisplay}</p>
              </td>
              <td width="110" valign="middle" align="right"
                style="width:110px;padding-left:8px;">
                ${h.criticalBadge(data.isCritical)}
              </td>
            </tr>
          </table>
        </td>
      </tr>

      ${h.dataRow('Asset #',           h.escHtml(data.assetNumber))}
      ${h.dataRow('Serial Number',     h.escHtml(data.serialNumber))}
      ${h.dataRow('Manufacturer',      h.escHtml(data.manufacturer))}
      ${h.dataRow('Model',             h.escHtml(data.model))}
      ${h.dataRow('Equipment Type',    h.escHtml(data.equipmentType))}
      ${h.dataRow('Location',          h.escHtml(data.location))}
      ${h.dataRow('Point of Contact',  h.escHtml(data.poc))}
      ${viewRow}
    </table>`;
}

// ─── ticketHeaderRow ──────────────────────────────────────────────────────────
// Matches the visual structure of the equipment name header row — same #081830
// background, same padding — so both tables appear optically aligned when
// stacked.  Uses colspan=2 to keep the outer table's 2-column grid intact.
//
// @param {string}      ticketNumber
// @param {string|null} ticketUrl

function ticketHeaderRow(ticketNumber, ticketUrl) {
  var display = ticketUrl
    ? `<a href="${h.escHtml(ticketUrl)}"
         style="${h.LINK_STYLE}font-size:15px;font-weight:700;">#${h.escHtml(ticketNumber)}</a>`
    : `<span style="font-size:15px;font-weight:700;color:#c8d8f0;
                    font-family:'Segoe UI',Arial,sans-serif;">#${h.escHtml(ticketNumber)}</span>`;

  return `
    <tr>
      <td colspan="2" bgcolor="#081830" class="bg-eqhdr"
        style="background-color:#081830;padding:10px 14px 8px;">
        <p style="margin:0 0 3px 0;font-size:10px;color:#4a6080;
                  text-transform:uppercase;letter-spacing:1px;
                  font-family:'Segoe UI',Arial,sans-serif;">Ticket Number</p>
        <p style="margin:0;">${display}</p>
      </td>
    </tr>`;
}

module.exports = { equipmentBlock, ticketHeaderRow };
