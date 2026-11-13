import { isAllowedPushEndpoint } from './push.service.js';

describe('push endpoint allowlist', () => {
  it('accepts the real browser push services', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc:APA91b')).toBe(true);
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/gAAAA')).toBe(true);
    expect(isAllowedPushEndpoint('https://wns2-bl2p.notify.windows.com/w/?token=AwYAAA')).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/QGuQyavXutnMH')).toBe(true);
  });

  it('rejects anything else, so the server cannot be used to call arbitrary URLs', () => {
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false); // not https
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/fcm/send/abc')).toBe(false); // custom port
    expect(isAllowedPushEndpoint('https://evil.example.com/fcm.googleapis.com')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedPushEndpoint('https://localhost:4000/api')).toBe(false);
    expect(isAllowedPushEndpoint('not a url')).toBe(false);
  });
});
