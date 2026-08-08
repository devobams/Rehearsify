import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import config from '../../config/index.js';
import { draftConfirmation, draftPreview } from './emailTemplates.js';

let _transporter = null;

function redactRecipient(to) {
  if (!to || typeof to !== 'string') return '[unknown]';
  const [local, domain] = to.split('@');
  if (!domain) return '[redacted]';
  const hashed = crypto.createHash('sha256').update(local).digest('hex').slice(0, 8);
  return `${hashed}@${domain}`;
}

function getTransporter() {
  if (_transporter) return _transporter;

  const { host, port, user, pass } = config.email.smtp;

  if (!host) {
    throw new Error(
      'SMTP_HOST is not configured. Set SMTP_HOST in .env for email delivery, ' +
      'or call setTransporter() with an explicit transport for dev/test.',
    );
  }

  _transporter = nodemailer.createTransport({
    host,
    port: port || 587,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: user ? { user, pass } : undefined,
  });

  return _transporter;
}

export function setTransporter(transport) {
  _transporter = transport;
}

function buildEmail(templateFn, data) {
  return templateFn(data);
}

async function send(to, email) {
  const transporter = getTransporter();
  const from = config.email.fromAddress || 'rehearsify@example.com';

  try {
    const result = await transporter.sendMail({
      from,
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    console.log(`[mailer] Sent "${email.subject}" to ${redactRecipient(to)} (messageId: ${result.messageId || 'json-transport'})`);
    return result;
  } catch (err) {
    console.error(`[mailer] Failed to send "${email.subject}" to ${redactRecipient(to)}:`, err.message);
    throw err;
  }
}

export async function sendDraftConfirmation(to, data) {
  const email = buildEmail(draftConfirmation, data);
  return send(to, email);
}

export async function sendDraftPreview(to, data) {
  const email = buildEmail(draftPreview, data);
  return send(to, email);
}

export { draftConfirmation, draftPreview };
