// Notification architecture.
// alerts (lib/dashboard.js computeAlerts) -> deliver() -> channels.
// Today: an in-app banner + a system notification while the app is open (if allowed).
// Later: a push channel. Real background push needs a small server that sends
// Web Push messages (iOS supports this only for apps added to the Home Screen).
// That server can reuse computeAlerts() on feed.json and send each new alert once.
import { store } from './store.js';

export const channels = {
  inApp: {
    id: 'in-app',
    available: () => true,
    send: (alert) => window.dispatchEvent(new CustomEvent('pogo-alert', { detail: alert })),
  },
  system: {
    id: 'system',
    available: () => 'Notification' in window && Notification.permission === 'granted',
    async send(alert) {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      const opts = { body: alert.body, tag: alert.id, icon: 'icons/icon-192.png', data: { url: alert.url } };
      if (reg?.showNotification) return reg.showNotification(alert.title, opts);
      return new Notification(alert.title, opts);
    },
  },
  // push: { id: 'push', available: () => false, send: async () => {} }, // future
};

export function notificationSupport() {
  if (!('Notification' in window)) return { supported: false, permission: 'unsupported' };
  return { supported: true, permission: Notification.permission };
}

export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.requestPermission();
}

/** Deliver alerts that are due and were not delivered before. Returns delivered alerts. */
export async function deliver(alerts, now = Date.now()) {
  const seen = store.getSeenAlerts();
  const prefs = store.getPrefs();
  const due = alerts.filter((a) => a.fireAt <= now && !seen.has(a.id));
  for (const a of due) {
    for (const ch of Object.values(channels)) {
      if (ch.id === 'system' && !prefs.systemNotifications) continue;
      if (!ch.available()) continue;
      try { await ch.send(a); } catch { /* a failing channel must not block others */ }
    }
    seen.add(a.id);
  }
  store.setSeenAlerts(seen);
  return due;
}
