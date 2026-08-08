function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '0:00';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatDate(dateStr) {
  if (!dateStr) return 'TBD';
  const str = String(dateStr);
  const dateOnlyMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let d;
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    d = new Date(Number(year), Number(month) - 1, Number(day));
  } else {
    d = new Date(str);
  }
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function baseLayout(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
          ${bodyHtml}
        </table>
        <p style="margin-top:16px;font-size:12px;color:#999999;">Rehearsify &mdash; Choir Repertoire Planning</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function draftConfirmation(data) {
  const {
    serviceName = 'Service',
    serviceDate,
    songs = [],
    totalDuration = 0,
    choirName = '',
    appLink = '#',
  } = data;

  const songCount = songs.length;
  const dateFormatted = formatDate(serviceDate);

  const subject = `Draft Planning Confirmed - ${serviceName} ${dateFormatted}`;

  const bodyHtml = `
    <tr>
      <td style="background-color:#2d6a4f;padding:24px 32px;">
        <h1 style="margin:0;color:#ffffff;font-size:20px;">Draft Planning Confirmed</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        <p style="margin:0 0 16px;font-size:16px;color:#333333;">
          Your planning draft for <strong>${escapeHtml(serviceName)}</strong> on <strong>${escapeHtml(dateFormatted)}</strong> has been confirmed.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:#f8f9fa;border-radius:6px;">
          <tr>
            <td style="padding:16px;">
              <p style="margin:0 0 4px;font-size:14px;color:#666666;">Songs Included</p>
              <p style="margin:0;font-size:24px;font-weight:bold;color:#2d6a4f;">${songCount}</p>
            </td>
            <td style="padding:16px;">
              <p style="margin:0 0 4px;font-size:14px;color:#666666;">Total Duration</p>
              <p style="margin:0;font-size:24px;font-weight:bold;color:#2d6a4f;">${formatDuration(totalDuration)}</p>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 8px;font-size:16px;color:#333333;font-weight:bold;">Next Steps</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:4px 0;font-size:14px;color:#555555;">&#8226;&nbsp; <a href="${escapeHtml(appLink)}" style="color:#2d6a4f;">View full details</a></td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-size:14px;color:#555555;">&#8226;&nbsp; Questions? Reply to this email.</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 24px;">
        <p style="margin:0;font-size:13px;color:#999999;">Sent by ${escapeHtml(choirName)}</p>
      </td>
    </tr>`;

  const text = [
    `Draft Planning Confirmed`,
    ``,
    `Your planning draft for ${serviceName} on ${dateFormatted} has been confirmed.`,
    ``,
    `Songs Included: ${songCount}`,
    `Total Duration: ${formatDuration(totalDuration)}`,
    ``,
    `Next Steps:`,
    `- View full details: ${appLink}`,
    `- Questions? Reply to this email.`,
    ``,
    `Sent by ${choirName}`,
  ].join('\n');

  return { subject, html: baseLayout(subject, bodyHtml), text };
}

export function draftPreview(data) {
  const {
    serviceName = 'Service',
    serviceDate,
    songs = [],
    totalDuration = 0,
    choirName = '',
    directorName = '',
    appLink = '#',
    expiresAt,
    voicing = '',
    key = '',
  } = data;

  const dateFormatted = formatDate(serviceDate);

  const subject = `Draft Preview - ${serviceName} ${dateFormatted}`;

  const songRows = songs
    .map((song, i) => {
      const arranger = song.arranger ? `<span style="color:#888888;font-size:13px;"> - ${escapeHtml(song.arranger)}</span>` : '';
      return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eeeeee;font-size:14px;color:#333333;vertical-align:top;">
          <strong>${i + 1}.</strong>&nbsp; ${escapeHtml(song.title)}${arranger}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #eeeeee;font-size:14px;color:#555555;text-align:right;white-space:nowrap;">
          ${formatDuration(song.duration)}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #eeeeee;font-size:14px;color:#555555;text-align:center;white-space:nowrap;">
          ${escapeHtml(song.difficulty || 'N/A')}
        </td>
      </tr>`;
    })
    .join('');

  const requirements = [voicing, key].filter(Boolean).join(', ');

  const expiryLine = expiresAt
    ? `<p style="margin:16px 0 0;font-size:13px;color:#999999;">This preview expires: ${escapeHtml(formatDate(expiresAt))}</p>`
    : '';

  const bodyHtml = `
    <tr>
      <td style="background-color:#2d6a4f;padding:24px 32px;">
        <h1 style="margin:0;color:#ffffff;font-size:20px;">Draft Preview</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        <p style="margin:0 0 16px;font-size:16px;color:#333333;">
          Here's the proposed repertoire for <strong>${escapeHtml(serviceName)}</strong> on <strong>${escapeHtml(dateFormatted)}</strong>:
        </p>
        ${songs.length > 0 ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #eeeeee;border-radius:6px;border-collapse:collapse;">
          <thead>
            <tr style="background-color:#f8f9fa;">
              <th style="padding:10px 12px;font-size:13px;font-weight:bold;color:#666666;text-align:left;">Song</th>
              <th style="padding:10px 12px;font-size:13px;font-weight:bold;color:#666666;text-align:right;">Duration</th>
              <th style="padding:10px 12px;font-size:13px;font-weight:bold;color:#666666;text-align:center;">Difficulty</th>
            </tr>
          </thead>
          <tbody>
            ${songRows}
          </tbody>
        </table>
        ` : '<p style="margin:0 0 16px;font-size:14px;color:#999999;font-style:italic;">No songs in this draft yet.</p>'}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:#f8f9fa;border-radius:6px;">
          <tr>
            <td style="padding:16px;">
              <p style="margin:0 0 4px;font-size:14px;color:#666666;">Total Duration</p>
              <p style="margin:0;font-size:20px;font-weight:bold;color:#2d6a4f;">${formatDuration(totalDuration)}</p>
            </td>
            ${requirements ? `
            <td style="padding:16px;">
              <p style="margin:0 0 4px;font-size:14px;color:#666666;">Requirements</p>
              <p style="margin:0;font-size:14px;color:#333333;">${escapeHtml(requirements)}</p>
            </td>` : ''}
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
          <tr>
            <td>
              <a href="${escapeHtml(appLink)}" style="display:inline-block;padding:10px 20px;background-color:#2d6a4f;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:bold;">Approve</a>
            </td>
            <td style="text-align:right;">
              <a href="${escapeHtml(appLink)}" style="display:inline-block;padding:10px 20px;background-color:#ffffff;color:#2d6a4f;text-decoration:none;border-radius:4px;font-size:14px;font-weight:bold;border:1px solid #2d6a4f;">View in App</a>
            </td>
          </tr>
        </table>
        ${expiryLine}
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 24px;">
        <p style="margin:0;font-size:13px;color:#999999;">Sent by ${escapeHtml(choirName)}${directorName ? ` on behalf of ${escapeHtml(directorName)}` : ''}</p>
      </td>
    </tr>`;

  const songListText = songs
    .map((song, i) => {
      const arranger = song.arranger ? ` - ${song.arranger}` : '';
      return `${i + 1}. ${song.title}${arranger} - ${formatDuration(song.duration)} - Difficulty: ${song.difficulty || 'N/A'}`;
    })
    .join('\n');

  const text = [
    `Draft Preview`,
    ``,
    `Here's the proposed repertoire for ${serviceName} on ${dateFormatted}:`,
    ``,
    `SONGS:`,
    songListText || '  (no songs)',
    ``,
    `Total Duration: ${formatDuration(totalDuration)}`,
    requirements ? `Choir Requirements: ${requirements}` : '',
    ``,
    `ACTIONS:`,
    `Approve: ${appLink}`,
    `View in App: ${appLink}`,
    expiryLine ? `Expires: ${expiresAt}` : '',
    ``,
    `Sent by ${choirName}${directorName ? ` on behalf of ${directorName}` : ''}`,
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  return { subject, html: baseLayout(subject, bodyHtml), text };
}
