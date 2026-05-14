'use strict';

var h  = require('./helpers');
var s  = require('./shell');
var eb = require('./equipmentBlock');

var BORDER = '#7a4a00';

/**
 * @param {object}   data
 * -- Equipment (same fields as ticketOpened) --
 * @param {string}   [data.equipmentUrl]
 * @param {number}   [data.equipmentId]
 * -- Ticket --
 * @param {string}   data.ticketNumber
 * @param {string}   data.ticketStatus
 * @param {Date}     data.updateDate
 * @param {string}   data.updatedBy
 * @param {string}   data.updateNote
 * @param {string}   data.failureCategory
 * @param {string}   data.failureSubCategory
 * @param {Date}     data.expectedCloseDate
 * @param {string[]} data.disabledCapabilities
 * @param {string}   [data.ticketUrl]
 * @param {Array}    [data.logs]
 */
function buildTicketUpdatedEmail(data) {
  var updateDate = h.formatDate(data.updateDate);
  var closeDate  = h.formatDate(data.expectedCloseDate);

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

    ${h.sectionLabel('Update Details', BORDER)}
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="border:1px solid #162040;">
      ${eb.ticketHeaderRow(data.ticketNumber, data.ticketUrl)}
      ${h.dataRow('Updated By',           h.escHtml(data.updatedBy))}
      ${h.dataRow('Update Date',          h.escHtml(updateDate))}
      ${h.dataRow('Ticket Status',        h.escHtml(data.ticketStatus))}
      ${h.dataRow('Expected Close',       h.escHtml(closeDate))}
      ${h.dataRow('Failure Category',     h.escHtml(data.failureCategory))}
      ${h.dataRow('Failure Sub-Category', h.escHtml(data.failureSubCategory))}
      ${h.noteRow('Update Notes',         data.updateNote || '')}
      ${viewTicketRow}
    </table>

    ${h.sectionLabel('Disabled Test Capabilities', BORDER)}
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      ${h.capabilitySection(data.disabledCapabilities)}
    </table>

    ${h.logsSection(data.logs, BORDER)}`;

  return s.buildShell({
    ticketNumber:  data.ticketNumber,
    eventDate:     updateDate,
    heading:       'Ticket Updated',
    headerBg:      '#7a4a00',
    headingAccent: '#d4a850',
    statusBg:      '#5a3400',
    statusLabel:   data.ticketStatus || 'In Progress',
    alertStripe:   '#c08000',
    alertText:     `<strong style="color:#d4a850;">&#9432; Status Update</strong>` +
                   ` &mdash; <strong style="color:#c8d8f0;">${h.escHtml(data.equipmentName)}</strong>` +
                   ` remains out of service.`,
    equipmentId:   data.equipmentId,
    bodyHtml:      bodyHtml
  });
}

module.exports = { buildTicketUpdatedEmail };
