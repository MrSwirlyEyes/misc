'use strict';

var h  = require('./helpers');
var s  = require('./shell');
var eb = require('./equipmentBlock');

var BORDER = '#1a3a8f';

/**
 * @param {object}   data
 * -- Equipment --
 * @param {string}   data.equipmentName
 * @param {string}   data.assetNumber
 * @param {string}   data.serialNumber
 * @param {string}   data.manufacturer
 * @param {string}   data.model
 * @param {boolean}  data.isCritical
 * @param {string}   data.equipmentType
 * @param {string}   data.location
 * @param {string}   data.poc
 * @param {string}   [data.equipmentUrl]
 * @param {number}   [data.equipmentId]       Used in footer unsubscribe link
 * -- Ticket --
 * @param {string}   data.ticketNumber
 * @param {Date}     data.openDate
 * @param {string}   data.ticketStatus
 * @param {string}   data.failureCategory
 * @param {string}   data.failureSubCategory
 * @param {Date}     data.expectedCloseDate
 * @param {string}   data.openedBy
 * @param {string}   data.description
 * @param {string[]} data.disabledCapabilities
 * @param {string}   [data.ticketUrl]
 * @param {Array}    [data.logs]               Often empty on open
 *   @param {string}   logs[].description
 *   @param {Date}     logs[].dateCreated
 *   @param {string}   logs[].userCreated
 */
function buildTicketOpenedEmail(data) {
  var openDate  = h.formatDate(data.openDate);
  var closeDate = h.formatDate(data.expectedCloseDate);

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

    ${h.sectionLabel('Ticket Details', BORDER)}
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="border:1px solid #162040;">
      ${eb.ticketHeaderRow(data.ticketNumber, data.ticketUrl)}
      ${h.dataRow('Opened By',            h.escHtml(data.openedBy))}
      ${h.dataRow('Open Date',            h.escHtml(openDate))}
      ${h.dataRow('Expected Close',       h.escHtml(closeDate))}
      ${h.dataRow('Failure Category',     h.escHtml(data.failureCategory))}
      ${h.dataRow('Failure Sub-Category', h.escHtml(data.failureSubCategory))}
      ${h.noteRow('Description',          data.description || '')}
      ${viewTicketRow}
    </table>

    ${h.sectionLabel('Disabled Test Capabilities', BORDER)}
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      ${h.capabilitySection(data.disabledCapabilities)}
    </table>

    ${h.logsSection(data.logs, BORDER)}`;

  return s.buildShell({
    ticketNumber:  data.ticketNumber,
    eventDate:     openDate,
    heading:       'New Ticket Opened',
    headerBg:      '#102070',
    headingAccent: '#8aaccc',
    statusBg:      '#0a1850',
    statusLabel:   data.ticketStatus || 'Open',
    alertStripe:   '#c0392b',
    alertText:     `<strong style="color:#e88080;">&#9888; Equipment Offline</strong>` +
                   ` &mdash; <strong style="color:#c8d8f0;">${h.escHtml(data.equipmentName)}</strong>` +
                   ` has been taken out of service.`,
    equipmentId:   data.equipmentId,
    bodyHtml:      bodyHtml
  });
}

module.exports = { buildTicketOpenedEmail };
