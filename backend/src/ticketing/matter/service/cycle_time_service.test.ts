import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  determineSLAStatus,
  calculateResolutionTime,
} from './cycle_time_service.js';

describe('CycleTimeService - Pure Functions', () => {
  describe('formatDuration', () => {
    it('should format seconds correctly', () => {
      expect(formatDuration(5000, false)).toBe('5s');
      expect(formatDuration(45000, false)).toBe('45s');
    });

    it('should format minutes correctly', () => {
      expect(formatDuration(60000, false)).toBe('1m');
      expect(formatDuration(150000, false)).toBe('2m');
      expect(formatDuration(3540000, false)).toBe('59m');
    });

    it('should format hours and minutes correctly', () => {
      expect(formatDuration(3600000, false)).toBe('1h');
      expect(formatDuration(5400000, false)).toBe('1h 30m');
      expect(formatDuration(9000000, false)).toBe('2h 30m');
    });

    it('should format days and hours correctly (no minutes)', () => {
      expect(formatDuration(86400000, false)).toBe('1d');
      expect(formatDuration(90000000, false)).toBe('1d 1h');
      expect(formatDuration(176400000, false)).toBe('2d 1h');
    });

    it('should add "In Progress:" prefix when isInProgress is true', () => {
      expect(formatDuration(5000, true)).toBe('In Progress: 5s');
      expect(formatDuration(3600000, true)).toBe('In Progress: 1h');
      expect(formatDuration(90000000, true)).toBe('In Progress: 1d 1h');
    });

    it('should handle null and undefined values', () => {
      expect(formatDuration(null, false)).toBe('N/A');
      expect(formatDuration(null, true)).toBe('N/A');
    });

    it('should handle negative values', () => {
      expect(formatDuration(-1000, false)).toBe('N/A');
    });

    it('should handle zero duration', () => {
      expect(formatDuration(0, false)).toBe('0s');
    });
  });

  describe('determineSLAStatus', () => {
    const slaThresholdMs = 24 * 60 * 60 * 1000; // 24 hours

    it('should return "In Progress" when isInProgress is true', () => {
      expect(determineSLAStatus(1000, true, slaThresholdMs)).toBe('In Progress');
      expect(determineSLAStatus(100000000, true, slaThresholdMs)).toBe('In Progress');
    });

    it('should return "In Progress" when resolutionTimeMs is null', () => {
      expect(determineSLAStatus(null, false, slaThresholdMs)).toBe('In Progress');
    });

    it('should return "Met" when resolution time is within SLA threshold', () => {
      const withinSLA = 20 * 60 * 60 * 1000; // 20 hours
      expect(determineSLAStatus(withinSLA, false, slaThresholdMs)).toBe('Met');
    });

    it('should return "Met" when resolution time equals SLA threshold', () => {
      expect(determineSLAStatus(slaThresholdMs, false, slaThresholdMs)).toBe('Met');
    });

    it('should return "Breached" when resolution time exceeds SLA threshold', () => {
      const exceededSLA = 30 * 60 * 60 * 1000; // 30 hours
      expect(determineSLAStatus(exceededSLA, false, slaThresholdMs)).toBe('Breached');
    });

    it('should handle very small SLA thresholds', () => {
      const smallThreshold = 1000; // 1 second
      expect(determineSLAStatus(500, false, smallThreshold)).toBe('Met');
      expect(determineSLAStatus(1500, false, smallThreshold)).toBe('Breached');
    });
  });

  describe('calculateResolutionTime', () => {
    it('should return null when startedAt is null', () => {
      const completedAt = new Date('2026-02-04T12:00:00Z');
      expect(calculateResolutionTime(null, completedAt)).toBeNull();
    });

    it('should calculate resolution time when completed', () => {
      const startedAt = new Date('2026-02-04T10:00:00Z');
      const completedAt = new Date('2026-02-04T12:00:00Z');
      const expected = 2 * 60 * 60 * 1000; // 2 hours in ms

      expect(calculateResolutionTime(startedAt, completedAt)).toBe(expected);
    });

    it('should calculate ongoing duration when not completed', () => {
      const startedAt = new Date('2026-02-04T10:00:00Z');
      const currentTime = new Date('2026-02-04T11:30:00Z');
      const expected = 1.5 * 60 * 60 * 1000; // 1.5 hours in ms

      expect(calculateResolutionTime(startedAt, null, currentTime)).toBe(expected);
    });

    it('should use current time when not provided for in-progress matters', () => {
      const startedAt = new Date(Date.now() - 3600000); // 1 hour ago
      const result = calculateResolutionTime(startedAt, null);

      // Should be approximately 1 hour (allowing for test execution time)
      expect(result).toBeGreaterThanOrEqual(3600000);
      expect(result).toBeLessThan(3610000); // Within 10 seconds tolerance
    });

    it('should handle same start and completion time', () => {
      const time = new Date('2026-02-04T10:00:00Z');
      expect(calculateResolutionTime(time, time)).toBe(0);
    });

    it('should handle multi-day durations', () => {
      const startedAt = new Date('2026-02-01T10:00:00Z');
      const completedAt = new Date('2026-02-04T10:00:00Z');
      const expected = 3 * 24 * 60 * 60 * 1000; // 3 days in ms

      expect(calculateResolutionTime(startedAt, completedAt)).toBe(expected);
    });
  });
});
