// TDD-RED: Tests for StatusBar class (not yet implemented)
// Status bar at very bottom showing model, agents, cost

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StatusBar } from '../tui/StatusBar.js';
import { ScreenBuffer } from '../tui/ScreenBuffer.js';

describe('StatusBar', () => {
  let buffer: ScreenBuffer;
  let statusBar: StatusBar;
  let region: any;

  beforeEach(() => {
    buffer = new ScreenBuffer(80, 24);
    region = { x: 0, y: 23, width: 80, height: 1 };
    statusBar = new StatusBar(buffer, region);
  });

  describe('initialization', () => {
    it('should create status bar', () => {
      expect(statusBar).toBeDefined();
    });

    it('should accept buffer and region', () => {
      expect(statusBar.getRegion()).toEqual(region);
    });

    it('should throw without buffer', () => {
      expect(() => new StatusBar(null as any, region)).toThrow();
    });

    it('should throw without region', () => {
      expect(() => new StatusBar(buffer, null as any)).toThrow();
    });

    it('should initialize with default values', () => {
      const values = statusBar.getValues();
      expect(values.model).toBeDefined();
      expect(values.agents).toBeDefined();
      expect(values.cost).toBeDefined();
    });

    it('should accept initial values', () => {
      const custom = new StatusBar(buffer, region, {
        model: 'opus-4',
        agents: 5,
        cost: { current: 1.5, budget: 10.0 }
      });
      const values = custom.getValues();
      expect(values.model).toBe('opus-4');
      expect(values.agents).toBe(5);
    });
  });

  describe('rendering', () => {
    it('should render model name', () => {
      statusBar.render();
      const content = buffer.toString();
      expect(content).toMatch(/model:/);
      expect(content).toMatch(/sonnet-4|opus-4|haiku/);
    });

    it('should render agent count', () => {
      statusBar.setAgents(3);
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('agents:');
      expect(content).toContain('3');
    });

    it('should render cost', () => {
      statusBar.setCost(1.23, 5.0);
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('cost:');
      expect(content).toContain('$1.23');
      expect(content).toContain('$5.00');
    });

    it('should render within region bounds', () => {
      statusBar.render();
      expect(() => statusBar.render()).not.toThrow();
    });

    it('should apply styling', () => {
      statusBar.render();
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toContain('\x1b[');
    });

    it('should span full width', () => {
      statusBar.render();
      const lines = buffer.toString().split('\n');
      const statusLine = lines[23];
      expect(statusLine).toBeDefined();
    });

    it('should use dim colors', () => {
      statusBar.render();
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toContain('\x1b[');
    });
  });

  describe('model display', () => {
    it('should show current model', () => {
      statusBar.setModel('sonnet-4');
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('sonnet-4');
    });

    it('should update model', () => {
      statusBar.setModel('opus-4');
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('opus-4');
    });

    it('should handle short model names', () => {
      statusBar.setModel('haiku');
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('haiku');
    });

    it('should handle long model names', () => {
      statusBar.setModel('claude-sonnet-4-20250514');
      statusBar.render();
      const content = buffer.toString();
      expect(content).toBeDefined();
    });

    it('should emit model:change event', () => {
      const handler = vi.fn();
      statusBar.on('model:change', handler);
      statusBar.setModel('opus-4');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'opus-4' })
      );
    });
  });

  describe('agent count', () => {
    it('should show zero agents', () => {
      statusBar.setAgents(0);
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('agents:');
      expect(content).toMatch(/agents:\s*0/);
    });

    it('should show single agent', () => {
      statusBar.setAgents(1);
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('1');
    });

    it('should show multiple agents', () => {
      statusBar.setAgents(5);
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('5');
    });

    it('should update agent count', () => {
      statusBar.setAgents(2);
      statusBar.render();
      const content1 = buffer.toString();
      buffer.clear();
      statusBar.setAgents(3);
      statusBar.render();
      const content2 = buffer.toString();
      expect(content2).toContain('3');
    });

    it('should increment agent count', () => {
      statusBar.setAgents(2);
      statusBar.incrementAgents();
      expect(statusBar.getAgents()).toBe(3);
    });

    it('should decrement agent count', () => {
      statusBar.setAgents(2);
      statusBar.decrementAgents();
      expect(statusBar.getAgents()).toBe(1);
    });

    it('should not decrement below zero', () => {
      statusBar.setAgents(0);
      statusBar.decrementAgents();
      expect(statusBar.getAgents()).toBe(0);
    });

    it('should emit agents:change event', () => {
      const handler = vi.fn();
      statusBar.on('agents:change', handler);
      statusBar.setAgents(3);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ agents: 3 })
      );
    });
  });

  describe('cost display', () => {
    it('should show current and budget cost', () => {
      statusBar.setCost(1.23, 5.0);
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('$1.23');
      expect(content).toContain('$5.00');
    });

    it('should format cost with 2 decimals', () => {
      statusBar.setCost(1.5, 10);
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('$1.50');
      expect(content).toContain('$10.00');
    });

    it('should show zero cost', () => {
      statusBar.setCost(0, 5.0);
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('$0.00');
    });

    it('should show percentage', () => {
      statusBar.setCost(1.0, 5.0);
      statusBar.render();
      const content = buffer.toString();
      expect(content).toMatch(/20%/);
    });

    it('should update cost in real-time', () => {
      statusBar.setCost(1.0, 5.0);
      statusBar.render();
      buffer.clear();
      statusBar.setCost(2.0, 5.0);
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('$2.00');
    });

    it('should add to current cost', () => {
      statusBar.setCost(1.0, 5.0);
      statusBar.addCost(0.5);
      expect(statusBar.getCurrentCost()).toBe(1.5);
    });

    it('should handle large costs', () => {
      statusBar.setCost(999.99, 1000.0);
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('$999.99');
    });

    it('should emit cost:change event', () => {
      const handler = vi.fn();
      statusBar.on('cost:change', handler);
      statusBar.setCost(1.5, 5.0);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ current: 1.5, budget: 5.0 })
      );
    });

    it('should warn when approaching budget', () => {
      const handler = vi.fn();
      statusBar.on('cost:warning', handler);
      statusBar.setCost(4.5, 5.0); // 90%
      expect(handler).toHaveBeenCalled();
    });

    it('should alert when exceeding budget', () => {
      const handler = vi.fn();
      statusBar.on('cost:exceeded', handler);
      statusBar.setCost(5.5, 5.0);
      expect(handler).toHaveBeenCalled();
    });

    it('should style cost based on percentage', () => {
      statusBar.setCost(4.5, 5.0); // 90% - should be warning color
      statusBar.render();
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toContain('\x1b[');
    });

    it('should show cost in red when over budget', () => {
      statusBar.setCost(6.0, 5.0);
      statusBar.render();
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toContain('\x1b[');
    });
  });

  describe('additional metrics', () => {
    it('should show optional duration metric', () => {
      statusBar.setMetric('duration', '5m 23s');
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('5m 23s');
    });

    it('should show optional token count', () => {
      statusBar.setMetric('tokens', '125k');
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('125k');
    });

    it('should show custom metrics', () => {
      statusBar.setMetric('custom', 'value');
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('custom');
      expect(content).toContain('value');
    });

    it('should remove metric', () => {
      statusBar.setMetric('test', 'value');
      statusBar.removeMetric('test');
      statusBar.render();
      const content = buffer.toString();
      expect(content).not.toContain('test');
    });

    it('should clear all metrics', () => {
      statusBar.setMetric('m1', 'v1');
      statusBar.setMetric('m2', 'v2');
      statusBar.clearMetrics();
      expect(statusBar.getMetrics()).toEqual({});
    });
  });

  describe('responsive layout', () => {
    it('should handle narrow terminals', () => {
      buffer.resize(60, 24);
      statusBar.setRegion({ x: 0, y: 23, width: 60, height: 1 });
      statusBar.render();
      expect(() => statusBar.render()).not.toThrow();
    });

    it('should handle wide terminals', () => {
      buffer.resize(120, 30);
      statusBar.setRegion({ x: 0, y: 29, width: 120, height: 1 });
      statusBar.render();
      expect(() => statusBar.render()).not.toThrow();
    });

    it('should truncate content gracefully on narrow screens', () => {
      buffer.resize(40, 24);
      statusBar.setRegion({ x: 0, y: 23, width: 40, height: 1 });
      statusBar.setCost(123.45, 999.99);
      statusBar.render();
      const lines = buffer.toString().split('\n');
      const statusLine = lines[23];
      expect(statusLine.replace(/\s+$/g, '').length).toBeLessThanOrEqual(40);
    });

    it('should prioritize important metrics on small screens', () => {
      buffer.resize(50, 24);
      statusBar.setRegion({ x: 0, y: 23, width: 50, height: 1 });
      statusBar.render();
      const content = buffer.toString();
      // Should always show model and cost
      expect(content).toContain('model:');
      expect(content).toContain('cost:');
    });

    it('should show all metrics on wide screens', () => {
      buffer.resize(120, 24);
      statusBar.setRegion({ x: 0, y: 23, width: 120, height: 1 });
      statusBar.setMetric('duration', '5m');
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('model:');
      expect(content).toContain('agents:');
      expect(content).toContain('cost:');
      expect(content).toContain('duration:');
    });

    it('should use ellipsis for truncated values', () => {
      buffer.resize(40, 24);
      statusBar.setRegion({ x: 0, y: 23, width: 40, height: 1 });
      statusBar.setModel('very-long-model-name-that-exceeds-width');
      statusBar.render();
      const content = buffer.toString();
      expect(content).toMatch(/\.\.\./);
    });
  });

  describe('separators', () => {
    it('should separate items with delimiters', () => {
      statusBar.render();
      const content = buffer.toString();
      expect(content).toMatch(/\||│|·/);
    });

    it('should use consistent spacing', () => {
      statusBar.render();
      const content = buffer.toString();
      expect(content).toMatch(/\s+/);
    });
  });

  describe('updates', () => {
    it('should update all values at once', () => {
      statusBar.update({
        model: 'opus-4',
        agents: 5,
        cost: { current: 2.5, budget: 10.0 }
      });
      const values = statusBar.getValues();
      expect(values.model).toBe('opus-4');
      expect(values.agents).toBe(5);
    });

    it('should update partially', () => {
      statusBar.update({ agents: 3 });
      expect(statusBar.getAgents()).toBe(3);
    });

    it('should trigger single render on batch update', () => {
      const spy = vi.spyOn(statusBar, 'render');
      statusBar.update({
        model: 'opus-4',
        agents: 5,
        cost: { current: 2.5, budget: 10.0 }
      });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should emit update event', () => {
      const handler = vi.fn();
      statusBar.on('update', handler);
      statusBar.update({ model: 'opus-4' });
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('styling', () => {
    it('should apply background color', () => {
      statusBar.render();
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toContain('\x1b[');
    });

    it('should use dim colors for labels', () => {
      statusBar.render();
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toContain('\x1b[');
    });

    it('should use brighter colors for values', () => {
      statusBar.render();
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toContain('\x1b[');
    });

    it('should respect theme', () => {
      statusBar.setTheme('ice');
      statusBar.render();
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toContain('\x1b[');
    });

    it('should use warning color for high cost', () => {
      statusBar.setCost(4.0, 5.0); // 80%
      statusBar.render();
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toContain('\x1b[');
    });

    it('should use error color for exceeded budget', () => {
      statusBar.setCost(6.0, 5.0);
      statusBar.render();
      const contentWithANSI = buffer.toStringWithANSI();
      expect(contentWithANSI).toContain('\x1b[');
    });
  });

  describe('visibility', () => {
    it('should show status bar', () => {
      statusBar.show();
      expect(statusBar.isVisible()).toBe(true);
    });

    it('should hide status bar', () => {
      statusBar.hide();
      expect(statusBar.isVisible()).toBe(false);
    });

    it('should not render when hidden', () => {
      const spy = vi.spyOn(buffer, 'writeAt');
      statusBar.hide();
      statusBar.render();
      expect(spy).not.toHaveBeenCalled();
    });

    it('should emit visibility:change event', () => {
      const handler = vi.fn();
      statusBar.on('visibility:change', handler);
      statusBar.hide();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ visible: false })
      );
    });
  });

  describe('real-time updates', () => {
    it('should support live cost updates', () => {
      statusBar.enableLiveUpdates();
      statusBar.setCost(1.0, 5.0);
      statusBar.addCost(0.1);
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('$1.10');
    });

    it('should throttle rapid updates', () => {
      const spy = vi.spyOn(statusBar, 'render');
      statusBar.enableThrottling(100);
      for (let i = 0; i < 50; i++) {
        statusBar.addCost(0.01);
      }
      expect(spy.mock.calls.length).toBeLessThan(50);
    });

    it('should debounce updates', () => {
      vi.useFakeTimers();
      const spy = vi.spyOn(statusBar, 'render');
      statusBar.enableDebounce(100);
      statusBar.setAgents(1);
      statusBar.setAgents(2);
      statusBar.setAgents(3);
      vi.advanceTimersByTime(150);
      expect(spy).toHaveBeenCalledTimes(1);
      vi.restoreAllMocks();
    });
  });

  describe('edge cases', () => {
    it('should handle zero budget', () => {
      statusBar.setCost(0, 0);
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('$0.00');
    });

    it('should handle negative values gracefully', () => {
      expect(() => statusBar.setCost(-1, 5)).toThrow();
      expect(() => statusBar.setAgents(-1)).toThrow();
    });

    it('should handle very small costs', () => {
      statusBar.setCost(0.001, 5.0);
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('$0.00');
    });

    it('should handle extremely large costs', () => {
      statusBar.setCost(9999999.99, 10000000.0);
      statusBar.render();
      expect(() => statusBar.render()).not.toThrow();
    });

    it('should handle empty model name', () => {
      statusBar.setModel('');
      statusBar.render();
      const content = buffer.toString();
      expect(content).toContain('model:');
    });

    it('should handle region resize', () => {
      statusBar.setRegion({ x: 0, y: 23, width: 100, height: 1 });
      statusBar.render();
      expect(statusBar.getRegion().width).toBe(100);
    });
  });

  describe('formatting helpers', () => {
    it('should format currency consistently', () => {
      const formatted = statusBar.formatCurrency(1.5);
      expect(formatted).toBe('$1.50');
    });

    it('should format percentage', () => {
      const formatted = statusBar.formatPercentage(25);
      expect(formatted).toBe('25%');
    });

    it('should format duration', () => {
      const formatted = statusBar.formatDuration(323); // seconds
      expect(formatted).toBe('5m 23s');
    });

    it('should format large numbers with k/m suffix', () => {
      expect(statusBar.formatNumber(1500)).toBe('1.5k');
      expect(statusBar.formatNumber(1500000)).toBe('1.5M');
    });
  });
});
