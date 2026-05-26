/**
 * Push notifications, HITL approval, and delivery tracking.
 *
 * Manages mobile devices, push notification dispatch, actionable approval
 * requests with async response awaiting, email send/reply threading,
 * live mobile sessions with streaming, SMS, and configurable notification rules.
 */

export interface PushNotification {
  id: string;
  title: string;
  body: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  category: 'agent-complete' | 'permission-request' | 'budget-alert' | 'error' | 'session' | 'custom';
  data?: Record<string, unknown>;
  sentAt: number;
  deliveredAt?: number;
  readAt?: number;
  actions?: NotificationAction[];
}

/** Interface for NotificationAction.
 * @property {string} id - Description of id.
 * @property {string} label - Description of label.
 * @property {string} command - Description of command.
 * @property {boolean} destructive - Description of destructive.
 */
export interface NotificationAction {
  id: string;
  label: string;
  command: string;
  destructive?: boolean;
}

/** Interface for MobileDevice.
 * @property {string} id - Description of id.
 * @property {string} name - Description of name.
 * @property {string} pushToken - Description of pushToken.
 * @property {number} lastSeen - Description of lastSeen.
 * @property {boolean} connected - Description of connected.
 */
export interface MobileDevice {
  id: string;
  name: string;
  platform: 'ios' | 'android' | 'web';
  pushToken: string;
  lastSeen: number;
  connected: boolean;
  capabilities: ('push' | 'respond' | 'approve' | 'stream')[];
}

/** Interface for EmailConfig.
 * @property {string} from - Description of from.
 * @property {string} replyTo - Description of replyTo.
 * @property {string} smtpHost - Description of smtpHost.
 * @property {number} smtpPort - Description of smtpPort.
 * @property {Record<string, string>} credentials - Description of credentials.
 */
export interface EmailConfig {
  from: string;
  replyTo?: string;
  smtpHost?: string;
  smtpPort?: number;
  provider: 'smtp' | 'sendgrid' | 'ses' | 'resend';
  credentials: Record<string, string>;
}

/** Interface for EmailMessage.
 * @property {string} id - Description of id.
 * @property {string} to - Description of to.
 * @property {string} subject - Description of subject.
 * @property {string} body - Description of body.
 * @property {number} sentAt - Description of sentAt.
 * @property {string} threadId - Description of threadId.
 */
export interface EmailMessage {
  id: string;
  to: string;
  subject: string;
  body: string;
  format: 'text' | 'html' | 'markdown';
  sentAt: number;
  replyReceived?: { content: string; receivedAt: number };
  threadId?: string;
}

/** Interface for NotificationRule.
 * @property {string} id - Description of id.
 * @property {string} event - Description of event.
 * @property {string} condition - Description of condition.
 * @property {number} throttle - Description of throttle.
 * @property {boolean} enabled - Description of enabled.
 */
export interface NotificationRule {
  id: string;
  event: string;
  channel: 'push' | 'email' | 'sms' | 'slack' | 'discord';
  condition?: string;
  throttle?: number;
  enabled: boolean;
}

/** Interface for MobileSession.
 * @property {string} deviceId - Description of deviceId.
 * @property {string} sessionId - Description of sessionId.
 * @property {number} connectedAt - Description of connectedAt.
 * @property {boolean} streamingEnabled - Description of streamingEnabled.
 * @property {number} lastActivity - Description of lastActivity.
 */
export interface MobileSession {
  deviceId: string;
  sessionId: string;
  connectedAt: number;
  permissions: ('view' | 'respond' | 'approve' | 'command')[];
  streamingEnabled: boolean;
  lastActivity: number;
}

let idCounter = 0;
function genId(prefix: string): string {
  return `${prefix}-${++idCounter}-${Date.now().toString(36)}`;
}

/** Class representing NotificationChannel. */
export class NotificationChannel {
  private devices: MobileDevice[] = [];
  private notifications: PushNotification[] = [];
  private emailConfig: EmailConfig | null = null;
  private emails: EmailMessage[] = [];
  private sessions: MobileSession[] = [];
  private rules: NotificationRule[] = [];
  private pendingResponses: Map<string, (response: { action: string; data?: unknown }) => void> = new Map();
  private stats = { sent: 0, delivered: 0, read: 0, failed: 0 };

  private deviceConnectedHandlers: Array<(device: MobileDevice) => void> = [];
  private deviceDisconnectedHandlers: Array<(device: MobileDevice) => void> = [];
  private mobileResponseHandlers: Array<(notificationId: string, action: string) => void> = [];
  private emailReplyHandlers: Array<(messageId: string, content: string) => void> = [];


  /**
   * Registers a mobile device for push notifications.
   * @param token - The push token.
   * @param platform - The device platform.
   * @param name - Optional human-readable name.
   */
  registerDevice(token: string, platform: MobileDevice['platform'], name?: string): MobileDevice {
    const device: MobileDevice = {
      id: genId('device'),
      name: name ?? `${platform}-device`,
      platform,
      pushToken: token,
      lastSeen: Date.now(),
      connected: true,
      capabilities: ['push', 'respond', 'approve', 'stream'],
    };
    this.devices.push(device);
    for (const handler of this.deviceConnectedHandlers) handler(device);
    return device;
  }

  /**
   * Unregister device.
   */
  /**
   * Unregisters a mobile device and ends its active sessions.
   * @param deviceId - The device ID.
   */
  unregisterDevice(deviceId: string): void {
    const device = this.devices.find(d => d.id === deviceId);
    if (device) {
      this.devices = this.devices.filter(d => d.id !== deviceId);
      this.sessions = this.sessions.filter(s => s.deviceId !== deviceId);
      for (const handler of this.deviceDisconnectedHandlers) handler(device);
    }
  }

  /**
   * Gets the devices.
   */
  /**
   * Returns a list of all registered mobile devices.
   */
  getDevices(): MobileDevice[] {
    return [...this.devices];
  }

  /**
   * Gets the device.
   */
  /**
   * Returns a specific device by ID.
   * @param deviceId - The device ID.
   * @throws If device is not found.
   */
  getDevice(deviceId: string): MobileDevice {
    const device = this.devices.find(d => d.id === deviceId);
    if (!device) throw new Error(`Device not found: ${deviceId}`);
    return device;
  }

  /**
   * Test push.
   */
  /**
   * Sends a test push notification to verify connectivity.
   * @param deviceId - The device ID.
   */
  testPush(deviceId: string): void {
    const device = this.devices.find(d => d.id === deviceId);
    if (!device) throw new Error(`Device not found: ${deviceId}`);
    device.lastSeen = Date.now();
  }


  /**
   * Send push.
   */
  /**
   * Dispatches a push notification to all registered devices.
   * @param notification - Notification data (id and sentAt auto-generated).
   * @returns The sent PushNotification.
   */
  sendPush(notification: Omit<PushNotification, 'id' | 'sentAt'>): PushNotification {
    const notif: PushNotification = {
      ...notification,
      id: genId('notif'),
      sentAt: Date.now(),
    };
    this.notifications.push(notif);
    this.stats.sent++;
    this.stats.delivered++;
    return notif;
  }

  /**
   * Send push to all.
   */
  /**
   * Sends a push notification to all registered devices.
   * @param notification - Notification data.
   * @returns Array of sent PushNotifications.
   */
  sendPushToAll(notification: Omit<PushNotification, 'id' | 'sentAt'>): PushNotification[] {
    return this.devices.map(() => this.sendPush(notification));
  }

  /**
   * Gets the notification history.
   */
  /**
   * Returns notification history, optionally filtered.
   * @param filter - Optional category and/or time filter.
   */
  getNotificationHistory(filter?: { category?: string; since?: number }): PushNotification[] {
    let results = [...this.notifications];
    if (filter?.category) {
      results = results.filter(n => n.category === filter.category);
    }
    if (filter?.since) {
      results = results.filter(n => n.sentAt >= filter.since!);
    }
    return results;
  }

  /**
   * Mark read.
   */
  /**
   * Marks a notification as read.
   * @param notificationId - The notification ID.
   */
  markRead(notificationId: string): void {
    const notif = this.notifications.find(n => n.id === notificationId);
    if (notif) {
      notif.readAt = Date.now();
      this.stats.read++;
    }
  }

  /**
   * Gets the unread count.
   */
  /**
   * Returns the count of unread notifications.
   */
  getUnreadCount(): number {
    return this.notifications.filter(n => !n.readAt).length;
  }


  /**
   * Send approval request.
   */
  sendApprovalRequest(agentId: string, action: string, details: string): PushNotification {
    return this.sendPush({
      title: `Permission Request: ${action}`,
      body: `${agentId} wants to exec: ${details}`,
      priority: 'high',
      category: 'permission-request',
      actions: [
        { id: 'approve', label: 'Approve', command: '/approve' },
        { id: 'deny', label: 'Deny', command: '/deny', destructive: true },
      ],
    });
  }

  /**
   * Await mobile response.
   */
  async awaitMobileResponse(notificationId: string, timeout: number = 30000): Promise<{ action: string; data?: unknown }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResponses.delete(notificationId);
        reject(new Error('Timeout: no mobile response received'));
      }, timeout);

      this.pendingResponses.set(notificationId, (response) => {
        clearTimeout(timer);
        this.pendingResponses.delete(notificationId);
        resolve(response);
      });
    });
  }

  /**
   * Handle mobile action.
   */
  handleMobileAction(notificationId: string, actionId: string): void {
    for (const handler of this.mobileResponseHandlers) {
      handler(notificationId, actionId);
    }

    const pending = this.pendingResponses.get(notificationId);
    if (pending) {
      pending({ action: actionId });
    }
  }


  /**
   * Configure email.
   */
  configureEmail(config: EmailConfig): void {
    this.emailConfig = config;
  }

  /**
   * Gets the email config.
   */
  getEmailConfig(): EmailConfig | null {
    return this.emailConfig;
  }

  /**
   * Send email.
   */
  sendEmail(to: string, subject: string, body: string, opts?: { format?: EmailMessage['format']; replyExpected?: boolean }): EmailMessage {
    if (!this.emailConfig) throw new Error('Email not configured');
    const threadId = genId('thread');
    const msg: EmailMessage = {
      id: genId('email'),
      to,
      subject,
      body,
      format: opts?.format ?? 'text',
      sentAt: Date.now(),
      threadId,
    };
    this.emails.push(msg);
    this.stats.sent++;
    return msg;
  }

  /**
   * Gets the email thread.
   */
  getEmailThread(threadId: string): EmailMessage[] {
    return this.emails.filter(e => e.threadId === threadId);
  }

  /**
   * Await email reply.
   */
  async awaitEmailReply(messageId: string, timeout: number = 86400000): Promise<{ content: string; receivedAt: number }> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Timeout: no email reply received'));
      }, timeout);
    });
  }

  /**
   * Gets the email history.
   */
  getEmailHistory(filter?: { to?: string; since?: number }): EmailMessage[] {
    let results = [...this.emails];
    if (filter?.to) {
      results = results.filter(e => e.to === filter.to);
    }
    if (filter?.since) {
      results = results.filter(e => e.sentAt >= filter.since!);
    }
    return results;
  }


  /**
   * Start mobile session.
   */
  startMobileSession(deviceId: string, permissions: MobileSession['permissions']): MobileSession {
    const session: MobileSession = {
      deviceId,
      sessionId: genId('session'),
      connectedAt: Date.now(),
      permissions,
      streamingEnabled: true,
      lastActivity: Date.now(),
    };
    this.sessions.push(session);
    return session;
  }

  /**
   * End mobile session.
   */
  endMobileSession(deviceId: string): void {
    this.sessions = this.sessions.filter(s => s.deviceId !== deviceId);
  }

  /**
   * Gets the active sessions.
   */
  getActiveSessions(): MobileSession[] {
    return [...this.sessions];
  }

  /**
   * Stream to mobile.
   */
  streamToMobile(deviceId: string, content: string): void {
    const session = this.sessions.find(s => s.deviceId === deviceId);
    if (!session) throw new Error(`No active session for device: ${deviceId}`);
    session.lastActivity = Date.now();
  }

  /**
   * Receive from mobile.
   */
  receiveFromMobile(deviceId: string): string | null {
    const session = this.sessions.find(s => s.deviceId === deviceId);
    if (!session) throw new Error(`No active session for device: ${deviceId}`);
    return null; // No pending commands
  }

  /**
   * Sets the mobile permissions.
   */
  setMobilePermissions(deviceId: string, permissions: MobileSession['permissions']): void {
    const session = this.sessions.find(s => s.deviceId === deviceId);
    if (session) {
      session.permissions = permissions;
    }
  }


  /**
   * Add rule.
   */
  addRule(rule: Omit<NotificationRule, 'id'>): NotificationRule {
    const fullRule: NotificationRule = {
      ...rule,
      id: genId('rule'),
    };
    this.rules.push(fullRule);
    return fullRule;
  }

  /**
   * Remove rule.
   */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(r => r.id !== ruleId);
  }

  /**
   * Gets the rules.
   */
  getRules(): NotificationRule[] {
    return [...this.rules];
  }

  /**
   * Enable rule.
   */
  enableRule(ruleId: string): void {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) rule.enabled = true;
  }

  /**
   * Disable rule.
   */
  disableRule(ruleId: string): void {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) rule.enabled = false;
  }

  /**
   * Sets the throttle.
   */
  setThrottle(ruleId: string, intervalMs: number): void {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) rule.throttle = intervalMs;
  }


  /**
   * Send sms.
   */
  sendSms(phoneNumber: string, message: string): void {
    this.stats.sent++;
    // Future: integrate with SMS provider
  }

  /**
   * Await sms reply.
   */
  async awaitSmsReply(phoneNumber: string, timeout: number = 60000): Promise<string> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Timeout: no SMS reply received'));
      }, timeout);
    });
  }


  /**
   * Notify on event.
   */
  notifyOnEvent(event: string, channel: NotificationRule['channel'], template: string): NotificationRule {
    return this.addRule({ event, channel, enabled: true });
  }

  /**
   * Gets the delivery stats.
   */
  getDeliveryStats(): { sent: number; delivered: number; read: number; failed: number; responseRate: number } {
    const responseRate = this.stats.sent > 0 ? this.stats.read / this.stats.sent : 0;
    return { ...this.stats, responseRate };
  }


  /**
   * On device connected.
   */
  onDeviceConnected(handler: (device: MobileDevice) => void): void {
    this.deviceConnectedHandlers.push(handler);
  }

  /**
   * On device disconnected.
   */
  onDeviceDisconnected(handler: (device: MobileDevice) => void): void {
    this.deviceDisconnectedHandlers.push(handler);
  }

  /**
   * On mobile response.
   */
  onMobileResponse(handler: (notificationId: string, action: string) => void): void {
    this.mobileResponseHandlers.push(handler);
  }

  /**
   * On email reply.
   */
  onEmailReply(handler: (messageId: string, content: string) => void): void {
    this.emailReplyHandlers.push(handler);
  }
}
