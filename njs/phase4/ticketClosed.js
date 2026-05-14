'use strict';

var h  = require('./helpers');
var s  = require('./shell');
var eb = require('./equipmentBlock');

var BORDER = '#0a5c3a';

/**
 * @param {object}   data
 * -- Equipment (same fields as ticketOpened) --
 * @param {string}   [data.equipmentUrl]
 * @param {number}   [data.equipmentId]
 * -- Ticket --
 * @param {string}   data.ticketNumber
 * @param {Date}     data.openDate
 * @param {Date}     data.closeDate
 * @param {string}   data.closedBy
 * @param {string}   data.failureCategory
 * @param {string}   data.failureSubCategory
 * @param {string}   data.rootCause
 * @param {string}   data.resolutionDescription
 * @param {string[]} data.restoredCapabilities
 * @param {string}   [data.ticketUrl]
 * @param {Array}    [data.logs]
 */
function buildTicketClosedEmail(data) {
  var closeDate = h.formatDate(data.closeDate);
  var openDate  = h.formatDate(data.openDate);

  var viewTicketRow = data.ticketUrl ? `
      <tr>
        <td width="175" valign="top" bgcolor="#040e1e"
          style="width:175px;background-color:#040e1e;
                 padding:6px 10px 10px 14px;border-top:1px solid #162040;"></td>
        <td valign="top" bgcolor="#040e1e"
          style="background-color:#040e1e;
                 padding:6px 14px 10px 10px;border-top:1px solid #162040;">
          <a href="${h.escHtml(data.ticketUrl)}"
            style="${h.LINK_STYLE}font-size:12px;">View Ticket in App &rarr;</a>
        </td>
      </tr>` : '';

  var bodyHtml = `
    ${eb.equipmentBlock(data, BORDER)}

    ${h.sectionLabel('Closure Details', BORDER)}
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="border:1px solid #162040;">
      ${eb.ticketHeaderRow(data.ticketNumber, data.ticketUrl)}
      ${h.dataRow('Closed By',            h.escHtml(data.closedBy))}
      ${h.dataRow('Date Opened',          h.escHtml(openDate))}
      ${h.dataRow('Date Closed',          h.escHtml(closeDate))}
      ${h.dataRow('Failure Category',     h.escHtml(data.failureCategory))}
      ${h.dataRow('Failure Sub-Category', h.escHtml(data.failureSubCategory))}
      ${h.dataRow('Root Cause',           h.escHtml(data.rootCause))}
      ${h.noteRow('Resolution',           data.resolutionDescription || '')}
      ${viewTicketRow}
    </table>

    ${h.sectionLabel('Restored Test Capabilities', BORDER)}
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      ${h.capabilitySection(data.restoredCapabilities, '#0a7a50', '#021a10', '#50c898', '\u2713 ')}
    </table>

    ${h.logsSection(data.logs, BORDER)}`;

  return s.buildShell({
    ticketNumber:  data.ticketNumber,
    eventDate:     closeDate,
    heading:       'Ticket Closed',
    headerBg:      '#0a4a30',
    headingAccent: '#60b890',
    statusBg:      '#063020',
    statusLabel:   'Closed',
    alertStripe:   '#0a7a50',
    alertText:     `<strong style="color:#50c898;">&#10003; Equipment Restored</strong>` +
                   ` &mdash; <strong style="color:#c8d8f0;">${h.escHtml(data.equipmentName)}</strong>` +
                   ` has been returned to service.`,
    equipmentId:   data.equipmentId,
    bodyHtml:      bodyHtml
  });
}

module.exports = { buildTicketClosedEmail };
