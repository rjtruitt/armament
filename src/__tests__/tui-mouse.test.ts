import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MouseHandler, MouseEvent, ClickableRegion } from '../tui/MouseHandler.js';

describe('MouseHandler', () => {
  let handler: MouseHandler;

  beforeEach(() => {
    handler = new MouseHandler();
  });

  describe('Enable/Disable', () => {
    it('should write enable escape sequences when enabled', () => {
      const written: string[] = [];
      handler.enable((s) => written.push(s));
      expect(written).toEqual(['\x1b[?1000h\x1b[?1002h\x1b[?1006h']);
    });

    it('should write disable escape sequences when disabled', () => {
      const written: string[] = [];
      handler.enable((s) => written.push(s));
      handler.disable((s) => written.push(s));
      expect(written[1]).toBe('\x1b[?1000l\x1b[?1002l\x1b[?1006l');
    });

    it('should report enabled state after enable()', () => {
      handler.enable(() => {});
      expect(handler.isEnabled()).toBe(true);
    });

    it('should report disabled state after disable()', () => {
      handler.enable(() => {});
      handler.disable(() => {});
      expect(handler.isEnabled()).toBe(false);
    });

    it('should start in disabled state', () => {
      expect(handler.isEnabled()).toBe(false);
    });

    it('should default to writing to stdout if no write fn provided', () => {
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      handler.enable();
      expect(spy).toHaveBeenCalledWith('\x1b[?1000h\x1b[?1002h\x1b[?1006h');
      spy.mockRestore();
    });
  });

  describe('SGR Parsing', () => {
    it('should parse left click press', () => {
      const event = handler.parse('\x1b[<0;10;5M');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('click');
      expect(event!.button).toBe('left');
      expect(event!.col).toBe(9);  // 10 - 1 (0-indexed)
      expect(event!.row).toBe(4);  // 5 - 1
    });

    it('should parse right click press', () => {
      const event = handler.parse('\x1b[<2;20;10M');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('click');
      expect(event!.button).toBe('right');
      expect(event!.col).toBe(19);
      expect(event!.row).toBe(9);
    });

    it('should parse middle click press', () => {
      const event = handler.parse('\x1b[<1;15;8M');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('click');
      expect(event!.button).toBe('middle');
      expect(event!.col).toBe(14);
      expect(event!.row).toBe(7);
    });

    it('should parse scroll up', () => {
      const event = handler.parse('\x1b[<64;5;5M');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('scroll');
      expect(event!.scrollDirection).toBe('up');
    });

    it('should parse scroll down', () => {
      const event = handler.parse('\x1b[<65;5;5M');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('scroll');
      expect(event!.scrollDirection).toBe('down');
    });

    it('should parse left drag (motion with button held)', () => {
      const event = handler.parse('\x1b[<32;12;7M');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('drag');
      expect(event!.button).toBe('left');
      expect(event!.col).toBe(11);
      expect(event!.row).toBe(6);
    });

    it('should parse middle drag', () => {
      const event = handler.parse('\x1b[<33;12;7M');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('drag');
      expect(event!.button).toBe('middle');
    });

    it('should parse right drag', () => {
      const event = handler.parse('\x1b[<34;12;7M');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('drag');
      expect(event!.button).toBe('right');
    });

    it('should parse release event (lowercase m terminator)', () => {
      const event = handler.parse('\x1b[<0;10;5m');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('release');
      expect(event!.button).toBe('left');
      expect(event!.col).toBe(9);
      expect(event!.row).toBe(4);
    });

    it('should parse right button release', () => {
      const event = handler.parse('\x1b[<2;10;5m');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('release');
      expect(event!.button).toBe('right');
    });

    it('should handle large coordinates', () => {
      const event = handler.parse('\x1b[<0;200;150M');
      expect(event).not.toBeNull();
      expect(event!.col).toBe(199);
      expect(event!.row).toBe(149);
    });

    it('should handle coordinate 1 (smallest valid)', () => {
      const event = handler.parse('\x1b[<0;1;1M');
      expect(event).not.toBeNull();
      expect(event!.col).toBe(0);
      expect(event!.row).toBe(0);
    });
  });

  describe('X10 Parsing', () => {
    let x10Handler: MouseHandler;

    beforeEach(() => {
      x10Handler = new MouseHandler({ mode: 'x10' });
    });

    it('should parse X10 left click', () => {
      // Button 0 + 32 = 32 (space), col 10 + 32 + 1 = 43, row 5 + 32 + 1 = 38
      const cb = String.fromCharCode(0 + 32);
      const cx = String.fromCharCode(10 + 32 + 1);  // col 10, 1-indexed -> add 1
      const cy = String.fromCharCode(5 + 32 + 1);   // row 5, 1-indexed -> add 1
      const data = `\x1b[M${cb}${cx}${cy}`;
      const event = x10Handler.parse(data);
      expect(event).not.toBeNull();
      expect(event!.type).toBe('click');
      expect(event!.button).toBe('left');
      expect(event!.col).toBe(10);
      expect(event!.row).toBe(5);
    });

    it('should parse X10 right click', () => {
      const cb = String.fromCharCode(2 + 32);
      const cx = String.fromCharCode(5 + 32 + 1);
      const cy = String.fromCharCode(3 + 32 + 1);
      const data = `\x1b[M${cb}${cx}${cy}`;
      const event = x10Handler.parse(data);
      expect(event).not.toBeNull();
      expect(event!.type).toBe('click');
      expect(event!.button).toBe('right');
      expect(event!.col).toBe(5);
      expect(event!.row).toBe(3);
    });

    it('should parse X10 middle click', () => {
      const cb = String.fromCharCode(1 + 32);
      const cx = String.fromCharCode(1 + 32 + 1);
      const cy = String.fromCharCode(1 + 32 + 1);
      const data = `\x1b[M${cb}${cx}${cy}`;
      const event = x10Handler.parse(data);
      expect(event).not.toBeNull();
      expect(event!.button).toBe('middle');
    });

    it('should return null for data too short', () => {
      const event = x10Handler.parse('\x1b[M');
      expect(event).toBeNull();
    });

    it('should return null for non-mouse data in x10 mode', () => {
      const event = x10Handler.parse('hello world');
      expect(event).toBeNull();
    });
  });

  describe('Hit Testing', () => {
    const regionA: ClickableRegion = {
      id: 'button-a',
      x: 0, y: 0, width: 10, height: 3,
    };
    const regionB: ClickableRegion = {
      id: 'button-b',
      x: 5, y: 1, width: 10, height: 3,
    };

    beforeEach(() => {
      handler.registerRegion(regionA);
      handler.registerRegion(regionB);
    });

    it('should return region when click is inside', () => {
      const result = handler.hitTest(2, 1);
      // Both A and B contain (2,1)? A: x0-9,y0-2 => yes. B: x5-14,y1-3 => no (col 2 < 5)
      expect(result).not.toBeNull();
      expect(result!.id).toBe('button-a');
    });

    it('should return null when click is outside all regions', () => {
      const result = handler.hitTest(50, 50);
      expect(result).toBeNull();
    });

    it('should return topmost (last registered) region for overlapping area', () => {
      // Point (6, 1) is in both A (x0-9,y0-2) and B (x5-14,y1-3)
      const result = handler.hitTest(6, 1);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('button-b'); // last registered wins
    });

    it('should include top-left boundary', () => {
      const result = handler.hitTest(0, 0);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('button-a');
    });

    it('should include bottom-right boundary (width-1, height-1)', () => {
      // Region A: x0..9, y0..2 — point (4, 2) is in A but not in B (B starts at x=5)
      const result = handler.hitTest(4, 2);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('button-a');
    });

    it('should exclude just outside right boundary', () => {
      // Region A: x0..9 — col 10 is outside
      const fresh = new MouseHandler();
      fresh.registerRegion(regionA);
      const result = fresh.hitTest(10, 0);
      expect(result).toBeNull();
    });

    it('should exclude just outside bottom boundary', () => {
      // Region A: y0..2 — row 3 is outside
      const fresh = new MouseHandler();
      fresh.registerRegion(regionA);
      const result = fresh.hitTest(0, 3);
      expect(result).toBeNull();
    });
  });

  describe('Region Management', () => {
    it('should register a region', () => {
      handler.registerRegion({ id: 'r1', x: 0, y: 0, width: 5, height: 5 });
      expect(handler.getRegions()).toHaveLength(1);
      expect(handler.getRegions()[0].id).toBe('r1');
    });

    it('should register multiple regions', () => {
      handler.registerRegion({ id: 'r1', x: 0, y: 0, width: 5, height: 5 });
      handler.registerRegion({ id: 'r2', x: 10, y: 10, width: 5, height: 5 });
      expect(handler.getRegions()).toHaveLength(2);
    });

    it('should unregister a region by id', () => {
      handler.registerRegion({ id: 'r1', x: 0, y: 0, width: 5, height: 5 });
      handler.registerRegion({ id: 'r2', x: 10, y: 10, width: 5, height: 5 });
      handler.unregisterRegion('r1');
      expect(handler.getRegions()).toHaveLength(1);
      expect(handler.getRegions()[0].id).toBe('r2');
    });

    it('should clear all regions', () => {
      handler.registerRegion({ id: 'r1', x: 0, y: 0, width: 5, height: 5 });
      handler.registerRegion({ id: 'r2', x: 10, y: 10, width: 5, height: 5 });
      handler.clearRegions();
      expect(handler.getRegions()).toHaveLength(0);
    });

    it('should return a copy of regions array', () => {
      handler.registerRegion({ id: 'r1', x: 0, y: 0, width: 5, height: 5 });
      const regions = handler.getRegions();
      regions.push({ id: 'fake', x: 0, y: 0, width: 1, height: 1 });
      expect(handler.getRegions()).toHaveLength(1); // original unaffected
    });

    it('should handle unregistering non-existent id gracefully', () => {
      handler.registerRegion({ id: 'r1', x: 0, y: 0, width: 5, height: 5 });
      handler.unregisterRegion('nonexistent');
      expect(handler.getRegions()).toHaveLength(1);
    });
  });

  describe('Event Handling', () => {
    it('should fire onClick callback when click hits region', () => {
      const onClick = vi.fn();
      handler.registerRegion({ id: 'btn', x: 0, y: 0, width: 10, height: 5, onClick });
      const event: MouseEvent = { type: 'click', button: 'left', col: 5, row: 2 };
      handler.handleEvent(event);
      expect(onClick).toHaveBeenCalledWith(event);
    });

    it('should not fire onClick when click misses all regions', () => {
      const onClick = vi.fn();
      handler.registerRegion({ id: 'btn', x: 0, y: 0, width: 10, height: 5, onClick });
      const event: MouseEvent = { type: 'click', button: 'left', col: 50, row: 50 };
      handler.handleEvent(event);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('should fire click listeners with correct region', () => {
      const listener = vi.fn();
      handler.on('click', listener);
      const region: ClickableRegion = { id: 'btn', x: 0, y: 0, width: 10, height: 5 };
      handler.registerRegion(region);
      const event: MouseEvent = { type: 'click', button: 'left', col: 5, row: 2 };
      handler.handleEvent(event);
      expect(listener).toHaveBeenCalledWith(event, region);
    });

    it('should fire click listener with null region when miss', () => {
      const listener = vi.fn();
      handler.on('click', listener);
      const event: MouseEvent = { type: 'click', button: 'left', col: 50, row: 50 };
      handler.handleEvent(event);
      expect(listener).toHaveBeenCalledWith(event, null);
    });

    it('should fire release listeners', () => {
      const listener = vi.fn();
      handler.on('release', listener);
      const event: MouseEvent = { type: 'release', button: 'left', col: 5, row: 2 };
      handler.handleEvent(event);
      expect(listener).toHaveBeenCalledWith(event, null);
    });

    it('should not fire onClick on release events', () => {
      const onClick = vi.fn();
      handler.registerRegion({ id: 'btn', x: 0, y: 0, width: 10, height: 5, onClick });
      const event: MouseEvent = { type: 'release', button: 'left', col: 5, row: 2 };
      handler.handleEvent(event);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('should fire onHover for drag events on a region', () => {
      const onHover = vi.fn();
      handler.registerRegion({ id: 'btn', x: 0, y: 0, width: 10, height: 5, onHover });
      const event: MouseEvent = { type: 'drag', button: 'left', col: 5, row: 2 };
      handler.handleEvent(event);
      expect(onHover).toHaveBeenCalledWith(event);
    });
  });

  describe('Scroll Events', () => {
    it('should correctly identify scroll up from parsed event', () => {
      const event = handler.parse('\x1b[<64;10;10M');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('scroll');
      expect(event!.scrollDirection).toBe('up');
    });

    it('should correctly identify scroll down from parsed event', () => {
      const event = handler.parse('\x1b[<65;10;10M');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('scroll');
      expect(event!.scrollDirection).toBe('down');
    });

    it('should fire scroll listeners on scroll event', () => {
      const listener = vi.fn();
      handler.on('scroll', listener);
      const event: MouseEvent = { type: 'scroll', button: 'left', col: 5, row: 2, scrollDirection: 'up' };
      handler.handleEvent(event);
      expect(listener).toHaveBeenCalledWith(event, null);
    });

    it('should not have scrollDirection on non-scroll events', () => {
      const event = handler.parse('\x1b[<0;10;5M');
      expect(event).not.toBeNull();
      expect(event!.scrollDirection).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should return null for non-mouse data', () => {
      expect(handler.parse('hello world')).toBeNull();
      expect(handler.parse('')).toBeNull();
      expect(handler.parse('\x1b[H')).toBeNull(); // cursor home
      expect(handler.parse('\x1b[2J')).toBeNull(); // clear screen
    });

    it('should return null for malformed SGR sequence', () => {
      expect(handler.parse('\x1b[<abc;10;5M')).toBeNull();
      expect(handler.parse('\x1b[<0;10M')).toBeNull(); // missing param
    });

    it('should convert 1-indexed protocol coords to 0-indexed', () => {
      const event = handler.parse('\x1b[<0;1;1M');
      expect(event!.col).toBe(0);
      expect(event!.row).toBe(0);
    });

    it('should handle very large coordinates', () => {
      const event = handler.parse('\x1b[<0;999;999M');
      expect(event!.col).toBe(998);
      expect(event!.row).toBe(998);
    });

    it('should handle rapid sequential parse calls', () => {
      const events = [
        handler.parse('\x1b[<0;1;1M'),
        handler.parse('\x1b[<0;2;2M'),
        handler.parse('\x1b[<0;3;3M'),
        handler.parse('\x1b[<0;4;4M'),
        handler.parse('\x1b[<0;5;5M'),
      ];
      for (let i = 0; i < events.length; i++) {
        expect(events[i]).not.toBeNull();
        expect(events[i]!.col).toBe(i);
        expect(events[i]!.row).toBe(i);
      }
    });

    it('should return null for partial SGR sequence', () => {
      expect(handler.parse('\x1b[<0;10;5')).toBeNull(); // no terminator
    });
  });

  describe('Drag Detection', () => {
    it('should detect left drag (button code 32)', () => {
      const event = handler.parse('\x1b[<32;15;10M');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('drag');
      expect(event!.button).toBe('left');
      expect(event!.col).toBe(14);
      expect(event!.row).toBe(9);
    });

    it('should detect middle drag (button code 33)', () => {
      const event = handler.parse('\x1b[<33;15;10M');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('drag');
      expect(event!.button).toBe('middle');
    });

    it('should detect right drag (button code 34)', () => {
      const event = handler.parse('\x1b[<34;15;10M');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('drag');
      expect(event!.button).toBe('right');
    });

    it('should fire drag listener on drag event', () => {
      const listener = vi.fn();
      handler.on('drag', listener);
      const event: MouseEvent = { type: 'drag', button: 'left', col: 5, row: 5 };
      handler.handleEvent(event);
      expect(listener).toHaveBeenCalledWith(event, null);
    });

    it('should fire drag listener with region when drag is over region', () => {
      const listener = vi.fn();
      handler.on('drag', listener);
      const region: ClickableRegion = { id: 'panel', x: 0, y: 0, width: 20, height: 20 };
      handler.registerRegion(region);
      const event: MouseEvent = { type: 'drag', button: 'left', col: 5, row: 5 };
      handler.handleEvent(event);
      expect(listener).toHaveBeenCalledWith(event, region);
    });
  });

  describe('Multiple Listeners', () => {
    it('should fire all registered handlers for same event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();
      handler.on('click', handler1);
      handler.on('click', handler2);
      handler.on('click', handler3);
      const event: MouseEvent = { type: 'click', button: 'left', col: 0, row: 0 };
      handler.handleEvent(event);
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
    });

    it('should not fire removed handler after off()', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      handler.on('click', handler1);
      handler.on('click', handler2);
      handler.off('click', handler1);
      const event: MouseEvent = { type: 'click', button: 'left', col: 0, row: 0 };
      handler.handleEvent(event);
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should handle off() for handler not registered', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      handler.on('click', handler1);
      handler.off('click', handler2); // not registered — no error
      const event: MouseEvent = { type: 'click', button: 'left', col: 0, row: 0 };
      handler.handleEvent(event);
      expect(handler1).toHaveBeenCalled();
    });

    it('should handle listeners for different event types independently', () => {
      const clickHandler = vi.fn();
      const scrollHandler = vi.fn();
      handler.on('click', clickHandler);
      handler.on('scroll', scrollHandler);
      const clickEvent: MouseEvent = { type: 'click', button: 'left', col: 0, row: 0 };
      handler.handleEvent(clickEvent);
      expect(clickHandler).toHaveBeenCalled();
      expect(scrollHandler).not.toHaveBeenCalled();
    });

    it('should support adding same handler function to different events', () => {
      const sharedHandler = vi.fn();
      handler.on('click', sharedHandler);
      handler.on('scroll', sharedHandler);
      const clickEvent: MouseEvent = { type: 'click', button: 'left', col: 0, row: 0 };
      const scrollEvent: MouseEvent = { type: 'scroll', button: 'left', col: 0, row: 0, scrollDirection: 'up' };
      handler.handleEvent(clickEvent);
      handler.handleEvent(scrollEvent);
      expect(sharedHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('Mode selection', () => {
    it('should default to SGR mode', () => {
      const h = new MouseHandler();
      const event = h.parse('\x1b[<0;10;5M');
      expect(event).not.toBeNull();
    });

    it('should parse X10 when constructed with x10 mode', () => {
      const h = new MouseHandler({ mode: 'x10' });
      const cb = String.fromCharCode(0 + 32);
      const cx = String.fromCharCode(5 + 32 + 1);
      const cy = String.fromCharCode(3 + 32 + 1);
      const event = h.parse(`\x1b[M${cb}${cx}${cy}`);
      expect(event).not.toBeNull();
      expect(event!.type).toBe('click');
    });

    it('should not parse SGR sequences in X10 mode', () => {
      const h = new MouseHandler({ mode: 'x10' });
      const event = h.parse('\x1b[<0;10;5M');
      expect(event).toBeNull();
    });
  });
});
