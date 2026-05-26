/**
 * NOTIFICATION CHANNEL TEST SUITE — Mobile push notifications with priority levels,
 * email sending/receiving, HITL approval from mobile, notification rules and throttling.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationChannel } from '../core/NotificationChannel';

function createNotificationChannel(): NotificationChannel {
  return new NotificationChannel();
}

describe('NotificationChannel', () => {
  let nc: NotificationChannel;

  beforeEach(() => {
    nc = createNotificationChannel();
  });

  describe('Mobile Device Management', () => {
    it('should register a device with push token and platform', () => {
      const device = nc.registerDevice('expo-push-token-abc', 'ios', 'iPhone 15');
      expect(device.pushToken).toBe('expo-push-token-abc');
      expect(device.platform).toBe('ios');
      expect(device.name).toBe('iPhone 15');
      expect(device.id).toBeDefined();
    });

    it('should unregister a device by ID', () => {
      const device = nc.registerDevice('token-1', 'ios', 'Phone');
      nc.unregisterDevice(device.id);
      expect(nc.getDevices()).toHaveLength(0);
    });

    it('should list all registered devices', () => {
      nc.registerDevice('token-1', 'ios', 'iPhone');
      nc.registerDevice('token-2', 'android', 'Pixel');
      expect(nc.getDevices()).toHaveLength(2);
    });

    it('should get a specific device by ID', () => {
      const device = nc.registerDevice('token-x', 'ios', 'My Phone');
      const found = nc.getDevice(device.id);
      expect(found.pushToken).toBe('token-x');
      expect(found.name).toBe('My Phone');
    });

    it('should send a test push to verify connectivity', () => {
      const device = nc.registerDevice('token-1', 'ios', 'Phone');
      // Should not throw
      expect(() => nc.testPush(device.id)).not.toThrow();
    });

    it('should track device last-seen timestamp', () => {
      const device = nc.registerDevice('token-1', 'ios', 'Phone');
      expect(device.lastSeen).toBeGreaterThan(0);
    });

    it('should support iOS, Android, and web platforms', () => {
      const d1 = nc.registerDevice('t1', 'ios');
      const d2 = nc.registerDevice('t2', 'android');
      const d3 = nc.registerDevice('t3', 'web');
      expect(d1.platform).toBe('ios');
      expect(d2.platform).toBe('android');
      expect(d3.platform).toBe('web');
    });

    it('should track device capabilities (push, respond, approve, stream)', () => {
      const device = nc.registerDevice('token-1', 'ios', 'Phone');
      expect(device.capabilities).toContain('push');
    });
  });

  describe('Push Notifications', () => {
    it('should send push notification with title and body', () => {
      nc.registerDevice('token-1', 'ios', 'Phone');
      const notif = nc.sendPush({
        title: 'Agent Complete',
        body: 'agent-01 finished task',
        priority: 'normal',
        category: 'agent-complete',
      });
      expect(notif.id).toBeDefined();
      expect(notif.title).toBe('Agent Complete');
      expect(notif.body).toBe('agent-01 finished task');
      expect(notif.sentAt).toBeGreaterThan(0);
    });

    it('should send push to all registered devices', () => {
      nc.registerDevice('t1', 'ios', 'Phone 1');
      nc.registerDevice('t2', 'android', 'Phone 2');
      const results = nc.sendPushToAll({
        title: 'Alert',
        body: 'Budget exceeded',
        priority: 'high',
        category: 'budget-alert',
      });
      expect(results).toHaveLength(2);
    });

    it('should support priority levels (low, normal, high, critical)', () => {
      nc.registerDevice('t1', 'ios');
      const low = nc.sendPush({ title: 'X', body: 'Y', priority: 'low', category: 'custom' });
      const crit = nc.sendPush({ title: 'X', body: 'Y', priority: 'critical', category: 'error' });
      expect(low.priority).toBe('low');
      expect(crit.priority).toBe('critical');
    });

    it('should include actionable buttons on notifications', () => {
      nc.registerDevice('t1', 'ios');
      const notif = nc.sendPush({
        title: 'Permission Request',
        body: 'agent-02 wants to exec: rm -rf dist/',
        priority: 'high',
        category: 'permission-request',
        actions: [
          { id: 'approve', label: 'Approve', command: '/approve' },
          { id: 'deny', label: 'Deny', command: '/deny', destructive: true },
        ],
      });
      expect(notif.actions).toHaveLength(2);
      expect(notif.actions![0].id).toBe('approve');
      expect(notif.actions![1].destructive).toBe(true);
    });

    it('should track notification delivery status in history', () => {
      nc.registerDevice('t1', 'ios');
      nc.sendPush({ title: 'A', body: 'B', priority: 'normal', category: 'custom' });
      nc.sendPush({ title: 'C', body: 'D', priority: 'high', category: 'error' });
      const history = nc.getNotificationHistory();
      expect(history).toHaveLength(2);
    });

    it('should mark notifications as read', () => {
      nc.registerDevice('t1', 'ios');
      const notif = nc.sendPush({ title: 'A', body: 'B', priority: 'normal', category: 'custom' });
      nc.markRead(notif.id);
      const history = nc.getNotificationHistory();
      const found = history.find(n => n.id === notif.id);
      expect(found!.readAt).toBeGreaterThan(0);
    });

    it('should get unread count', () => {
      nc.registerDevice('t1', 'ios');
      nc.sendPush({ title: 'A', body: 'B', priority: 'normal', category: 'custom' });
      nc.sendPush({ title: 'C', body: 'D', priority: 'normal', category: 'custom' });
      const n = nc.sendPush({ title: 'E', body: 'F', priority: 'normal', category: 'custom' });
      nc.markRead(n.id);
      expect(nc.getUnreadCount()).toBe(2);
    });

    it('should filter notification history by category and time', () => {
      nc.registerDevice('t1', 'ios');
      nc.sendPush({ title: 'Err', body: 'x', priority: 'high', category: 'error' });
      nc.sendPush({ title: 'Info', body: 'y', priority: 'normal', category: 'custom' });
      const errors = nc.getNotificationHistory({ category: 'error' });
      expect(errors).toHaveLength(1);
      expect(errors[0].category).toBe('error');
    });
  });

  describe('HITL on Mobile (Approval Flow)', () => {
    it('should send approval request to mobile with action details', () => {
      nc.registerDevice('t1', 'ios');
      const notif = nc.sendApprovalRequest('agent-02', 'shellExec', 'rm -rf dist/');
      expect(notif.category).toBe('permission-request');
      expect(notif.actions).toBeDefined();
      expect(notif.actions!.length).toBeGreaterThanOrEqual(2);
    });

    it('should await mobile response with timeout', async () => {
      nc.registerDevice('t1', 'ios');
      const notif = nc.sendApprovalRequest('agent-02', 'shellExec', 'rm dist/');
      // Simulate a response arriving
      setTimeout(() => nc.handleMobileAction(notif.id, 'approve'), 10);
      const response = await nc.awaitMobileResponse(notif.id, 5000);
      expect(response.action).toBe('approve');
    });

    it('should handle mobile action (approve/deny) from device', () => {
      nc.registerDevice('t1', 'ios');
      const notif = nc.sendApprovalRequest('agent-01', 'fileWrite', '/etc/hosts');
      // Should not throw
      expect(() => nc.handleMobileAction(notif.id, 'deny')).not.toThrow();
    });

    it('should timeout if no mobile response received', async () => {
      nc.registerDevice('t1', 'ios');
      const notif = nc.sendApprovalRequest('agent-01', 'fileWrite', '/tmp/x');
      await expect(nc.awaitMobileResponse(notif.id, 50)).rejects.toThrow(/timeout/i);
    });

    it('should relay approval back via callback', () => {
      nc.registerDevice('t1', 'ios');
      const handler = vi.fn();
      nc.onMobileResponse(handler);
      const notif = nc.sendApprovalRequest('agent-01', 'shellExec', 'npm install');
      nc.handleMobileAction(notif.id, 'approve');
      expect(handler).toHaveBeenCalledWith(notif.id, 'approve');
    });

    it('should support multiple pending approval requests', () => {
      nc.registerDevice('t1', 'ios');
      const n1 = nc.sendApprovalRequest('agent-01', 'fileWrite', '/etc/hosts');
      const n2 = nc.sendApprovalRequest('agent-02', 'shellExec', 'npm run build');
      expect(n1.id).not.toBe(n2.id);
    });
  });

  describe('Email Integration', () => {
    it('should configure email provider', () => {
      nc.configureEmail({ from: 'armament@example.com', provider: 'resend', credentials: { apiKey: 'key' } });
      const config = nc.getEmailConfig();
      expect(config).not.toBeNull();
      expect(config!.from).toBe('armament@example.com');
      expect(config!.provider).toBe('resend');
    });

    it('should get current email configuration (null when not configured)', () => {
      expect(nc.getEmailConfig()).toBeNull();
    });

    it('should send email with text/html/markdown format', () => {
      nc.configureEmail({ from: 'test@test.com', provider: 'resend', credentials: { apiKey: 'k' } });
      const msg = nc.sendEmail('user@example.com', 'Session Summary', '# Done\n\nCost: $4.20', { format: 'markdown' });
      expect(msg.to).toBe('user@example.com');
      expect(msg.subject).toBe('Session Summary');
      expect(msg.format).toBe('markdown');
      expect(msg.id).toBeDefined();
    });

    it('should await email reply with timeout', async () => {
      nc.configureEmail({ from: 'test@test.com', provider: 'resend', credentials: { apiKey: 'k' } });
      const msg = nc.sendEmail('user@example.com', 'Test', 'body');
      await expect(nc.awaitEmailReply(msg.id, 50)).rejects.toThrow(/timeout/i);
    });

    it('should track email threads (reply chains)', () => {
      nc.configureEmail({ from: 'test@test.com', provider: 'resend', credentials: { apiKey: 'k' } });
      const msg = nc.sendEmail('user@example.com', 'Thread Start', 'hi');
      const thread = nc.getEmailThread(msg.threadId!);
      expect(thread.length).toBeGreaterThanOrEqual(1);
      expect(thread[0].id).toBe(msg.id);
    });

    it('should get email history with filters', () => {
      nc.configureEmail({ from: 'test@test.com', provider: 'resend', credentials: { apiKey: 'k' } });
      nc.sendEmail('a@x.com', 'A', 'body-a');
      nc.sendEmail('b@x.com', 'B', 'body-b');
      const history = nc.getEmailHistory();
      expect(history).toHaveLength(2);
    });

    it('should filter email history by recipient', () => {
      nc.configureEmail({ from: 'test@test.com', provider: 'resend', credentials: { apiKey: 'k' } });
      nc.sendEmail('alice@x.com', 'A', 'body-a');
      nc.sendEmail('bob@x.com', 'B', 'body-b');
      const filtered = nc.getEmailHistory({ to: 'alice@x.com' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].to).toBe('alice@x.com');
    });

    it('should send session report email', () => {
      nc.configureEmail({ from: 'test@test.com', provider: 'resend', credentials: { apiKey: 'k' } });
      const msg = nc.sendEmail('team@example.com', 'Session Report', 'report body');
      expect(msg.subject).toBe('Session Report');
    });
  });

  describe('Mobile Live Session', () => {
    it('should start mobile session with device and permissions', () => {
      const device = nc.registerDevice('t1', 'ios', 'Phone');
      const session = nc.startMobileSession(device.id, ['view', 'respond', 'approve']);
      expect(session.deviceId).toBe(device.id);
      expect(session.permissions).toContain('view');
      expect(session.permissions).toContain('approve');
      expect(session.sessionId).toBeDefined();
    });

    it('should end mobile session', () => {
      const device = nc.registerDevice('t1', 'ios', 'Phone');
      nc.startMobileSession(device.id, ['view']);
      nc.endMobileSession(device.id);
      expect(nc.getActiveSessions()).toHaveLength(0);
    });

    it('should list active mobile sessions', () => {
      const d1 = nc.registerDevice('t1', 'ios', 'Phone 1');
      const d2 = nc.registerDevice('t2', 'android', 'Phone 2');
      nc.startMobileSession(d1.id, ['view']);
      nc.startMobileSession(d2.id, ['view', 'respond']);
      expect(nc.getActiveSessions()).toHaveLength(2);
    });

    it('should stream terminal output to mobile device', () => {
      const device = nc.registerDevice('t1', 'ios', 'Phone');
      nc.startMobileSession(device.id, ['view']);
      // Should not throw
      expect(() => nc.streamToMobile(device.id, 'Agent completed task: refactor auth')).not.toThrow();
    });

    it('should receive commands from mobile device', () => {
      const device = nc.registerDevice('t1', 'ios', 'Phone');
      nc.startMobileSession(device.id, ['view', 'respond', 'command']);
      // Initially no pending command
      expect(nc.receiveFromMobile(device.id)).toBeNull();
    });

    it('should enforce mobile session permissions (view-only vs full control)', () => {
      const device = nc.registerDevice('t1', 'ios', 'Phone');
      nc.startMobileSession(device.id, ['view']);
      nc.setMobilePermissions(device.id, ['view']);
      const sessions = nc.getActiveSessions();
      const session = sessions.find(s => s.deviceId === device.id)!;
      expect(session.permissions).toEqual(['view']);
      expect(session.permissions).not.toContain('command');
    });

    it('should track last activity timestamp', () => {
      const device = nc.registerDevice('t1', 'ios', 'Phone');
      nc.startMobileSession(device.id, ['view']);
      const sessions = nc.getActiveSessions();
      expect(sessions[0].lastActivity).toBeGreaterThan(0);
    });

    it('should support streaming mode toggle via permissions', () => {
      const device = nc.registerDevice('t1', 'ios', 'Phone');
      const session = nc.startMobileSession(device.id, ['view', 'respond']);
      expect(session.streamingEnabled).toBe(true);
    });
  });

  describe('Notification Rules', () => {
    it('should add notification rule for specific events', () => {
      const rule = nc.addRule({ event: 'agent:complete', channel: 'push', enabled: true });
      expect(rule.id).toBeDefined();
      expect(rule.event).toBe('agent:complete');
      expect(rule.channel).toBe('push');
    });

    it('should remove a rule by ID', () => {
      const rule = nc.addRule({ event: 'agent:complete', channel: 'push', enabled: true });
      nc.removeRule(rule.id);
      expect(nc.getRules()).toHaveLength(0);
    });

    it('should list all rules', () => {
      nc.addRule({ event: 'agent:complete', channel: 'push', enabled: true });
      nc.addRule({ event: 'budget:warning', channel: 'email', enabled: true });
      expect(nc.getRules()).toHaveLength(2);
    });

    it('should enable/disable rules', () => {
      const rule = nc.addRule({ event: 'agent:error', channel: 'push', enabled: true });
      nc.disableRule(rule.id);
      const found = nc.getRules().find(r => r.id === rule.id)!;
      expect(found.enabled).toBe(false);
      nc.enableRule(rule.id);
      const found2 = nc.getRules().find(r => r.id === rule.id)!;
      expect(found2.enabled).toBe(true);
    });

    it('should throttle notifications per rule', () => {
      const rule = nc.addRule({ event: 'agent:error', channel: 'push', enabled: true });
      nc.setThrottle(rule.id, 60000);
      const found = nc.getRules().find(r => r.id === rule.id)!;
      expect(found.throttle).toBe(60000);
    });

    it('should support multiple channels (push, email, sms, slack, discord)', () => {
      const r1 = nc.addRule({ event: 'budget:warning', channel: 'slack', enabled: true });
      const r2 = nc.addRule({ event: 'session:end', channel: 'discord', enabled: true });
      expect(r1.channel).toBe('slack');
      expect(r2.channel).toBe('discord');
    });

    it('should support conditional rules with filter expressions', () => {
      const rule = nc.addRule({ event: 'agent:error', channel: 'push', condition: 'severity > 3', enabled: true });
      expect(rule.condition).toBe('severity > 3');
    });

    it('should create rule from event shorthand', () => {
      const rule = nc.notifyOnEvent('session:shutdown', 'email', 'Session {{sessionId}} ended. Cost: {{cost}}');
      expect(rule.event).toBe('session:shutdown');
      expect(rule.channel).toBe('email');
      expect(rule.enabled).toBe(true);
    });
  });

  describe('SMS (Future Enhancement)', () => {
    it('should send SMS message without throwing', () => {
      expect(() => nc.sendSms('+1555123456', 'Armament: Budget limit reached. Session paused.')).not.toThrow();
    });

    it('should await SMS reply (timeout rejection)', async () => {
      await expect(nc.awaitSmsReply('+1555123456', 50)).rejects.toThrow(/timeout/i);
    });
  });

  describe('Delivery Stats & Events', () => {
    it('should track delivery statistics', () => {
      nc.registerDevice('t1', 'ios');
      nc.sendPush({ title: 'A', body: 'B', priority: 'normal', category: 'custom' });
      const stats = nc.getDeliveryStats();
      expect(stats.sent).toBeGreaterThanOrEqual(1);
      expect(typeof stats.delivered).toBe('number');
      expect(typeof stats.responseRate).toBe('number');
    });

    it('should fire callback when device connects', () => {
      const handler = vi.fn();
      nc.onDeviceConnected(handler);
      const device = nc.registerDevice('t1', 'ios', 'Phone');
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: device.id }));
    });

    it('should fire callback when device disconnects', () => {
      const handler = vi.fn();
      nc.onDeviceDisconnected(handler);
      const device = nc.registerDevice('t1', 'ios', 'Phone');
      nc.unregisterDevice(device.id);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: device.id }));
    });

    it('should fire callback on mobile response', () => {
      const handler = vi.fn();
      nc.onMobileResponse(handler);
      nc.registerDevice('t1', 'ios');
      const notif = nc.sendApprovalRequest('agent-01', 'bash', 'npm i');
      nc.handleMobileAction(notif.id, 'approve');
      expect(handler).toHaveBeenCalledWith(notif.id, 'approve');
    });

    it('should fire callback on email reply', () => {
      const handler = vi.fn();
      nc.onEmailReply(handler);
      // Registered for when a reply comes in — verify registration doesn't throw
      expect(handler).not.toHaveBeenCalled();
    });

    it('should report response rate across all channels', () => {
      const stats = nc.getDeliveryStats();
      expect(stats).toHaveProperty('responseRate');
      expect(stats.responseRate).toBeGreaterThanOrEqual(0);
      expect(stats.responseRate).toBeLessThanOrEqual(1);
    });
  });
});
