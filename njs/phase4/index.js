'use strict';

// Central export point for the template layer.
// sender.js imports from here — callers never need to know the internal layout.

var ticketOpened  = require('./ticketOpened');
var ticketUpdated = require('./ticketUpdated');
var ticketClosed  = require('./ticketClosed');

module.exports = {
  buildTicketOpenedEmail:  ticketOpened.buildTicketOpenedEmail,
  buildTicketUpdatedEmail: ticketUpdated.buildTicketUpdatedEmail,
  buildTicketClosedEmail:  ticketClosed.buildTicketClosedEmail
};
