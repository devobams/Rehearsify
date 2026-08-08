import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import {
  draftConfirmation,
  draftPreview,
} from '../../src/shared/email/emailTemplates.js';
import {
  sendDraftConfirmation,
  sendDraftPreview,
  setTransporter,
} from '../../src/shared/email/mailer.js';

const baseData = {
  serviceName: 'Sunday Choir',
  serviceDate: '2026-07-26',
  songs: [
    { title: 'Amazing Grace', duration: 180, difficulty: 2 },
    { title: 'How Great Thou Art', duration: 240, difficulty: 3 },
    { title: 'Be Thou My Vision', duration: 200, difficulty: 2 },
    { title: 'Great Is Thy Faithfulness', duration: 210, difficulty: 3 },
    { title: 'It Is Well with My Soul', duration: 195, difficulty: 2 },
  ],
  totalDuration: 1025,
  directorName: 'Alice',
  choirName: 'Downtown Voices',
  appLink: 'https://rehearsify.local/planning/draft/123',
};

function makeSongs(count) {
  return Array.from({ length: count }, (_, i) => ({
    title: `Song ${i + 1}`,
    duration: 120 + i * 10,
    difficulty: (i % 5) + 1,
  }));
}

describe('emailTemplates', () => {
  describe('draftConfirmation', () => {
    it('returns subject, html, and text', () => {
      const result = draftConfirmation(baseData);
      assert.ok(result.subject);
      assert.ok(result.html);
      assert.ok(result.text);
      assert.ok(result.subject.includes('Sunday Choir'));
    });

    it('includes song count and total duration', () => {
      const result = draftConfirmation(baseData);
      assert.ok(result.html.includes('5'));
      assert.ok(result.html.includes('17:05'));
      assert.ok(result.text.includes('Songs Included: 5'));
      assert.ok(result.text.includes('17:05'));
    });

    it('includes choir name in footer', () => {
      const result = draftConfirmation(baseData);
      assert.ok(result.html.includes('Downtown Voices'));
      assert.ok(result.text.includes('Downtown Voices'));
    });

    it('includes app link', () => {
      const result = draftConfirmation(baseData);
      assert.ok(result.html.includes(baseData.appLink));
      assert.ok(result.text.includes(baseData.appLink));
    });

    it('formats the service date', () => {
      const result = draftConfirmation(baseData);
      assert.ok(result.text.includes('Sunday, July 26, 2026'));
    });

    it('handles missing optional fields gracefully', () => {
      const result = draftConfirmation({
        serviceName: 'Evensong',
      });
      assert.ok(result.subject.includes('Evensong'));
      assert.ok(result.text.includes('TBD'));
      assert.ok(result.text.includes('0:00'));
    });

    it('handles empty songs array', () => {
      const result = draftConfirmation({
        ...baseData,
        songs: [],
        totalDuration: 0,
      });
      assert.ok(result.html.includes('0'));
      assert.ok(result.text.includes('Songs Included: 0'));
    });
  });

  describe('draftPreview', () => {
    it('returns subject, html, and text', () => {
      const result = draftPreview(baseData);
      assert.ok(result.subject);
      assert.ok(result.html);
      assert.ok(result.text);
      assert.ok(result.subject.includes('Draft Preview'));
    });

    it('renders all songs in a table', () => {
      const result = draftPreview(baseData);
      for (const song of baseData.songs) {
        assert.ok(result.html.includes(song.title), `html missing: ${song.title}`);
        assert.ok(result.text.includes(song.title), `text missing: ${song.title}`);
      }
    });

    it('shows difficulty and duration per song', () => {
      const result = draftPreview(baseData);
      assert.ok(result.html.includes('Difficulty'));
      assert.ok(result.text.includes('Difficulty: 2'));
    });

    it('shows total duration', () => {
      const result = draftPreview(baseData);
      assert.ok(result.html.includes('17:05'));
      assert.ok(result.text.includes('17:05'));
    });

    it('shows choir requirements when voicing/key provided', () => {
      const result = draftPreview({ ...baseData, voicing: 'SATB', key: 'G Major' });
      assert.ok(result.html.includes('SATB'));
      assert.ok(result.html.includes('G Major'));
      assert.ok(result.text.includes('SATB'));
    });

    it('hides requirements row when voicing and key are empty', () => {
      const result = draftPreview(baseData);
      assert.ok(!result.html.includes('Requirements'));
    });

    it('shows approve and view-in-app buttons', () => {
      const result = draftPreview(baseData);
      assert.ok(result.html.includes('Approve'));
      assert.ok(result.html.includes('View in App'));
    });

    it('shows expiry when expiresAt is provided', () => {
      const result = draftPreview({ ...baseData, expiresAt: '2026-07-25T18:00:00Z' });
      assert.ok(result.html.includes('expires'));
    });

    it('handles 20 songs (overflow case)', () => {
      const songs = makeSongs(20);
      const totalDuration = songs.reduce((s, song) => s + song.duration, 0);
      const result = draftPreview({ ...baseData, songs, totalDuration });
      assert.ok(result.html.includes('Song 20'));
      assert.ok(result.text.includes('Song 20'));
      assert.ok(!result.html.includes('Song 21'));
    });

    it('handles special characters in song titles', () => {
      const songs = [{ title: 'O <Body> & "Soul"', duration: 120, difficulty: 1 }];
      const result = draftPreview({ ...baseData, songs, totalDuration: 120 });
      assert.ok(result.html.includes('&lt;Body&gt;'));
      assert.ok(result.html.includes('&amp;'));
      assert.ok(result.html.includes('&quot;'));
      assert.ok(result.text.includes('O <Body> & "Soul"'));
    });

    it('handles very long song titles', () => {
      const longTitle = 'A'.repeat(200);
      const songs = [{ title: longTitle, duration: 120, difficulty: 1 }];
      const result = draftPreview({ ...baseData, songs, totalDuration: 120 });
      assert.ok(result.html.includes(longTitle));
      assert.ok(result.text.includes(longTitle));
    });

    it('handles missing optional fields', () => {
      const result = draftPreview({
        serviceName: 'Vespers',
        serviceDate: null,
        songs: [{ title: 'Test', duration: null, difficulty: null }],
        totalDuration: 0,
      });
      assert.ok(result.text.includes('TBD'));
      assert.ok(result.text.includes('0:00'));
      assert.ok(result.text.includes('Difficulty: N/A'));
    });

    it('renders arranger info when present', () => {
      const songs = [{ title: 'Hymn', duration: 120, difficulty: 2, arranger: 'J. Smith' }];
      const result = draftPreview({ ...baseData, songs, totalDuration: 120 });
      assert.ok(result.html.includes('J. Smith'));
      assert.ok(result.text.includes('J. Smith'));
    });
  });
});

describe('mailer integration (json transport spy)', () => {
  let fakeTransport;
  let sentMails;

  beforeEach(() => {
    sentMails = [];
    fakeTransport = {
      sendMail: async (mail) => {
        sentMails.push(mail);
        return { messageId: `fake-${Date.now()}` };
      },
    };
    setTransporter(fakeTransport);
  });

  it('sendDraftConfirmation sends correct email', async () => {
    await sendDraftConfirmation('test@example.com', baseData);
    assert.equal(sentMails.length, 1);
    assert.ok(sentMails[0].subject.includes('Sunday Choir'));
    assert.ok(sentMails[0].to === 'test@example.com');
    assert.ok(sentMails[0].html.includes('Downtown Voices'));
    assert.ok(sentMails[0].text.includes('Downtown Voices'));
  });

  it('sendDraftPreview sends correct email', async () => {
    await sendDraftPreview('director@example.com', baseData);
    assert.equal(sentMails.length, 1);
    assert.ok(sentMails[0].subject.includes('Draft Preview'));
    assert.ok(sentMails[0].to === 'director@example.com');
    assert.ok(sentMails[0].html.includes('Amazing Grace'));
  });

  it('sendDraftPreview with 20 songs', async () => {
    const songs = makeSongs(20);
    const totalDuration = songs.reduce((s, song) => s + song.duration, 0);
    await sendDraftPreview('dir@test.com', { ...baseData, songs, totalDuration });
    assert.equal(sentMails.length, 1);
    assert.ok(sentMails[0].html.includes('Song 20'));
  });

  it('sendDraftConfirmation with special characters', async () => {
    const data = { ...baseData, choirName: '<Choir> & "Friends"' };
    await sendDraftConfirmation('test@example.com', data);
    assert.ok(sentMails[0].html.includes('&lt;Choir&gt;'));
    assert.ok(sentMails[0].html.includes('&amp;'));
    assert.ok(sentMails[0].html.includes('&quot;'));
  });

  it('propagates send errors', async () => {
    setTransporter({
      sendMail: async () => { throw new Error('SMTP connection refused'); },
    });
    await assert.rejects(
      () => sendDraftConfirmation('fail@test.com', baseData),
      { message: 'SMTP connection refused' },
    );
  });
});
