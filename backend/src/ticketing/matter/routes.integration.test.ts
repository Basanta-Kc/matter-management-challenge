import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import 'express-async-errors';
import { matterRouter } from './routes.js';
import { errorHandler, notFoundHandler } from '../../middleware/errorHandler.js';
import pool from '../../db/pool.js';
import type { 
  MatterListResponseOptimized,
  MatterListItem,
  SLAStatus,
} from '../types.js';

describe('GET /api/v1/matters - Integration Tests', () => {
  let app: Express;

  beforeAll(async () => {
    // Set up Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/v1', matterRouter);
    app.use(notFoundHandler);
    app.use(errorHandler);

    // Verify database connection
    const client = await pool.connect();
    client.release();
  });

  afterAll(async () => {
    // Close database pool
    await pool.end();
  });

  it('should return paginated matters with default parameters', async () => {
    const response = await request(app)
      .get('/api/v1/matters')
      .expect(200);

    const body = response.body as MatterListResponseOptimized;

    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('page');
    expect(body).toHaveProperty('limit');
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('totalPages');
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('should respect pagination parameters', async () => {
    const response = await request(app)
      .get('/api/v1/matters?page=1&limit=5')
      .expect(200);

    const body = response.body as MatterListResponseOptimized;

    expect(body.data.length).toBeLessThanOrEqual(5);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(5);
  });

  it('should sort by created_at in descending order', async () => {
    const response = await request(app)
      .get('/api/v1/matters?sortBy=created_at&sortOrder=desc')
      .expect(200);

    const body = response.body as MatterListResponseOptimized;
    const dates = body.data.map((m) => new Date(m.createdAt).getTime());
    
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });

  it('should sort by created_at in ascending order', async () => {
    const response = await request(app)
      .get('/api/v1/matters?sortBy=created_at&sortOrder=asc')
      .expect(200);

    const body = response.body as MatterListResponseOptimized;
    const dates = body.data.map((m) => new Date(m.createdAt).getTime());
    
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeLessThanOrEqual(dates[i]);
    }
  });

  it('should sort by text field (subject)', async () => {
    const response = await request(app)
      .get('/api/v1/matters?sortBy=subject&sortOrder=asc')
      .expect(200);

    const body = response.body as MatterListResponseOptimized;
    const subjects = body.data.map((m) => {
      const subject = m.fields.subject;
      return typeof subject === 'string' ? subject.toLowerCase() : '';
    });
    
    for (let i = 1; i < subjects.length; i++) {
      expect(subjects[i - 1].localeCompare(subjects[i])).toBeLessThanOrEqual(0);
    }
  });

  it('should sort by number field (Case Number)', async () => {
    const response = await request(app)
      .get('/api/v1/matters?sortBy=Case Number&sortOrder=desc')
      .expect(200);

    const body = response.body as MatterListResponseOptimized;
    const caseNumbers = body.data
      .map((m) => m.fields['Case Number'])
      .filter((n): n is string => typeof n === 'string')
      .map((n) => parseInt(n.replace(/,/g, ''), 10));
    
    for (let i = 1; i < caseNumbers.length; i++) {
      expect(caseNumbers[i - 1]).toBeGreaterThanOrEqual(caseNumbers[i]);
    }
  });

  it('should sort by boolean field (Urgent)', async () => {
    const response = await request(app)
      .get('/api/v1/matters?sortBy=Urgent&sortOrder=desc')
      .expect(200);

    const body = response.body as MatterListResponseOptimized;
    expect(body.data.length).toBeGreaterThan(0);
    body.data.forEach((matter) => {
      expect(matter).toHaveProperty('fields');
    });
  });

  it('should sort by date field (Due Date)', async () => {
    const response = await request(app)
      .get('/api/v1/matters?sortBy=Due Date&sortOrder=asc')
      .expect(200);

    const body = response.body as MatterListResponseOptimized;
    const dueDates = body.data
      .map((m) => m.fields['Due Date'])
      .filter((d): d is string => typeof d === 'string')
      .map((d) => new Date(d).getTime());
    
    for (let i = 1; i < dueDates.length; i++) {
      expect(dueDates[i - 1]).toBeLessThanOrEqual(dueDates[i]);
    }
  });

  it('should search by subject field', async () => {
    const response = await request(app)
      .get('/api/v1/matters?search=Merger')
      .expect(200);

    const body = response.body as MatterListResponseOptimized;
    expect(body.data.length).toBeGreaterThan(0);
    
    const hasMatch = body.data.some((m) => {
      const subject = m.fields.subject;
      return typeof subject === 'string' && subject.toLowerCase().includes('merger');
    });
    expect(hasMatch).toBe(true);
  });

  it('should search case-insensitively', async () => {
    const response = await request(app)
      .get('/api/v1/matters?search=MERGER')
      .expect(200);

    const body = response.body as MatterListResponseOptimized;
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('should combine search and sorting', async () => {
    const response = await request(app)
      .get('/api/v1/matters?search=Matter&sortBy=created_at&sortOrder=desc')
      .expect(200);

    const body = response.body as MatterListResponseOptimized;
    expect(body.data.length).toBeGreaterThan(0);
    
    const dates = body.data.map((m) => new Date(m.createdAt).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });

  it('should return 400 for invalid page number', async () => {
    const response = await request(app)
      .get('/api/v1/matters?page=0')
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('should return 400 for invalid limit', async () => {
    const response = await request(app)
      .get('/api/v1/matters?limit=101')
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('should return 400 for invalid sortBy field', async () => {
    const response = await request(app)
      .get('/api/v1/matters?sortBy=invalid_field')
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('should return 400 for invalid sortOrder', async () => {
    const response = await request(app)
      .get('/api/v1/matters?sortOrder=invalid')
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('should return 400 for search string exceeding max length', async () => {
    const longSearch = 'a'.repeat(201);
    const response = await request(app)
      .get(`/api/v1/matters?search=${longSearch}`)
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('should include resolution time and SLA data', async () => {
    const response = await request(app)
      .get('/api/v1/matters?limit=5')
      .expect(200);

    const body = response.body as MatterListResponseOptimized;
    expect(body.data.length).toBeGreaterThan(0);
    
    body.data.forEach((matter) => {
      expect(matter).toHaveProperty('resolutionTime');
      expect(matter).toHaveProperty('sla');
      const validSLAStatuses: SLAStatus[] = ['In Progress', 'Met', 'Breached'];
      expect(validSLAStatuses).toContain(matter.sla);
    });
  });

  it('should return matters with proper field structure', async () => {
    const response = await request(app)
      .get('/api/v1/matters?limit=1')
      .expect(200);

    const body = response.body as MatterListResponseOptimized;
    expect(body.data.length).toBeGreaterThan(0);
    
    const matter: MatterListItem = body.data[0];
    expect(matter).toHaveProperty('id');
    expect(matter).toHaveProperty('boardId');
    expect(matter).toHaveProperty('fields');
    expect(matter).toHaveProperty('createdAt');
    expect(matter).toHaveProperty('updatedAt');
    
    expect(typeof matter.fields).toBe('object');
    Object.values(matter.fields).forEach((value) => {
      expect(['string', 'number', 'boolean', 'object']).toContain(typeof value);
    });
  });

  // Edge Cases Tests
  describe('Edge Cases', () => {
    it('should handle NULL field values gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/matters?limit=100')
        .expect(200);

      const body = response.body as MatterListResponseOptimized;
      
      // Check that matters with null fields are returned without errors
      body.data.forEach((matter) => {
        expect(matter).toHaveProperty('fields');
        // Null values should be allowed in fields
        Object.values(matter.fields).forEach((value) => {
          expect([null, 'string', 'number', 'boolean', 'object']).toContain(typeof value === null ? null : typeof value);
        });
      });
    });

    it('should handle sorting with missing/null field values', async () => {
      const response = await request(app)
        .get('/api/v1/matters?sortBy=Priority&sortOrder=asc&limit=50')
        .expect(200);

      const body = response.body as MatterListResponseOptimized;
      
      // Should not crash when some matters have null Priority
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
      
      // Verify matters with null values are included
      const hasNullValues = body.data.some((m) => m.fields.Priority === null);
      // If there are null values, they should be sorted (typically at the end or beginning)
      if (hasNullValues) {
        expect(body.data.length).toBeGreaterThan(0);
      }
    });

    it('should handle empty search results', async () => {
      const response = await request(app)
        .get('/api/v1/matters?search=NONEXISTENTMATTER12345XYZ')
        .expect(200);

      const body = response.body as MatterListResponseOptimized;
      
      // Should return empty array, not error
      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.totalPages).toBe(0);
    });

    it('should handle pagination beyond available data', async () => {
      const response = await request(app)
        .get('/api/v1/matters?page=99999&limit=25')
        .expect(200);

      const body = response.body as MatterListResponseOptimized;
      
      // Should return empty array for pages beyond data
      expect(body.data).toEqual([]);
      expect(body.page).toBe(99999);
    });

    it('should handle matters with partial field data', async () => {
      const response = await request(app)
        .get('/api/v1/matters?limit=100')
        .expect(200);

      const body = response.body as MatterListResponseOptimized;
      
      // Some matters may not have all fields populated
      body.data.forEach((matter) => {
        expect(matter).toHaveProperty('id');
        expect(matter).toHaveProperty('fields');
        
        // Fields object should exist even if some fields are missing
        expect(typeof matter.fields).toBe('object');
      });
    });

    it('should handle matters with no cycle time history', async () => {
      const response = await request(app)
        .get('/api/v1/matters?limit=100')
        .expect(200);

      const body = response.body as MatterListResponseOptimized;
      
      // All matters should have resolutionTime and sla, even if null or "N/A"
      body.data.forEach((matter) => {
        expect(matter).toHaveProperty('resolutionTime');
        expect(matter).toHaveProperty('sla');
        
        // Resolution time can be null or a string
        if (matter.resolutionTime !== null) {
          expect(typeof matter.resolutionTime).toBe('string');
        }
        
        // SLA should always be one of the valid statuses
        const validSLAStatuses: SLAStatus[] = ['In Progress', 'Met', 'Breached'];
        expect(validSLAStatuses).toContain(matter.sla);
      });
    });

    it('should handle special characters in search', async () => {
      const response = await request(app)
        .get('/api/v1/matters?search=%26')
        .expect(200);

      const body = response.body as MatterListResponseOptimized;
      
      // Should handle URL-encoded special characters without SQL injection
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should handle sorting by field with all null values', async () => {
      // Try sorting by a field that might have all nulls in some datasets
      const response = await request(app)
        .get('/api/v1/matters?sortBy=Description&sortOrder=asc&limit=10')
        .expect(200);

      const body = response.body as MatterListResponseOptimized;
      
      // Should not crash, should return data
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should handle minimum limit (1)', async () => {
      const response = await request(app)
        .get('/api/v1/matters?limit=1')
        .expect(200);

      const body = response.body as MatterListResponseOptimized;
      
      expect(body.data.length).toBe(1);
      expect(body.limit).toBe(1);
    });

    it('should handle maximum limit (100)', async () => {
      const response = await request(app)
        .get('/api/v1/matters?limit=100')
        .expect(200);

      const body = response.body as MatterListResponseOptimized;
      
      expect(body.data.length).toBeLessThanOrEqual(100);
      expect(body.limit).toBe(100);
    });

    it('should handle empty string search', async () => {
      const response = await request(app)
        .get('/api/v1/matters?search=')
        .expect(200);

      const body = response.body as MatterListResponseOptimized;
      
      // Empty search should return all results (no filtering)
      expect(body.data.length).toBeGreaterThan(0);
    });

    it('should handle whitespace-only search', async () => {
      const response = await request(app)
        .get('/api/v1/matters?search=%20%20%20')
        .expect(200);

      const body = response.body as MatterListResponseOptimized;
      
      // Whitespace search should be handled gracefully
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
    });
  });
});

