# Matter Management System - Take-Home Assessment

Welcome! We're excited to see your approach to building a production-ready system.

## What You'll Be Building

You'll be enhancing a **Matter Management System** - a tool for legal teams to track cases and matters. We've provided a working foundation, and you'll implement the missing features.

**Time Expectation**: We've designed this assessment to explore a realistically large problem space - intentionally more than can be completed in one sitting. We don't expect you to solve everything! We respect your time and ask that you spend approximately **4-8 hours** building features and exploring the codebase. What we're most interested in is:
- Your approach to problem-solving and prioritization
- The quality and thoughtfulness of what you do build
- Your insights about the system, challenges you encountered, and trade-offs you considered
- What you would do differently with more time

Focus on showcasing your strengths rather than achieving completeness.  

---

## 📖 Start Here

### Step 1: Read the Instructions
👉 **[ASSESSMENT.md](./ASSESSMENT.md)** - Your main task list and requirements

### Step 2: Understand the Database
👉 **[DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)** - Complete schema docs (READ THIS before coding!)

### Step 3: Quick Setup
👉 **[QUICKSTART.md](./QUICKSTART.md)** - Setup guide and troubleshooting

---

## 🚀 Quick Start

```bash
# 1. Verify you have Docker and prerequisites
./verify-setup.sh

# 2. Start everything (takes ~3 minutes to seed 10,000 matters)
docker compose up

# 3. Open the application
open http://localhost:8080

# 4. Check the API
curl http://localhost:3000/health
```

That's it! You now have a running application with 10,000 pre-seeded matters.

---

## 🎯 Your Tasks

We've intentionally left some features incomplete for you to implement:

### 1. ⏱️ Cycle Time & SLA Calculation
Implement logic to track how long matters take to resolve and whether they meet our 8-hour SLA.

**What you'll build**:
- Calculate resolution time from "To Do" → "Done"
- Determine SLA status (Met, Breached, In Progress)
- Display with color-coded badges in the UI

**Files to modify**:
- `backend/src/ticketing/matter/service/cycle_time_service.ts`
- `frontend/src/components/MatterTable.tsx`

### 2. 🔄 Column Sorting
Add sorting functionality to ALL table columns (currently only date sorting works).

**What you'll build**:
- Sort by numbers, text, dates, statuses, users, currency, booleans
- Handle NULL values appropriately
- Work with the EAV database pattern

**Files to modify**:
- `backend/src/ticketing/matter/repo/matter_repo.ts`
- `frontend/src/components/MatterTable.tsx`

### 3. 🔍 Search
Implement search across all fields using PostgreSQL full-text search.

**What you'll build**:
- Search text, numbers, status labels, user names
- Debounced search input (500ms)
- Use pg_trgm for fuzzy matching

**Files to modify**:
- `backend/src/ticketing/matter/repo/matter_repo.ts`
- `frontend/src/App.tsx` (add SearchBar component)

### 4. 🧪 Tests
Write comprehensive tests for your implementations.

**What you'll write**:
- Unit tests for cycle time logic
- Integration tests for API endpoints
- Edge case tests (NULL values, empty data)
- 80%+ coverage on business logic

**Directory**: `backend/src/ticketing/matter/service/__tests__/`

### 5. 📈 Scalability Documentation
Document how your solution would handle 10× the current load (100,000 matters, 1,000+ concurrent users).

**What to include**:
- Database optimization strategies
- Caching approaches
- Query optimization
- Specific, quantified recommendations

**File to update**: This README.md (add your analysis at the bottom)

---

## 🏗️ What We've Built For You

To save you time, we've provided a fully working foundation:

### Database (PostgreSQL)
- ✅ 11 tables with complete schema
- ✅ 10,000 pre-seeded matters with realistic data
- ✅ 8 field types (text, number, select, date, currency, boolean, status, user)
- ✅ Cycle time history tracking (for your implementation)
- ✅ Performance indexes (GIN, B-tree)
- ✅ pg_trgm extension enabled for search

### Backend (Node.js + TypeScript)
- ✅ Express API with proper structure
- ✅ Database connection pooling
- ✅ Basic CRUD endpoints (list, get, update)
- ✅ Error handling framework
- ✅ Winston logging configured
- ✅ Zod validation setup
- ✅ Vitest test configuration

### Frontend (React + TypeScript)
- ✅ React 18 with TypeScript
- ✅ Vite build tooling
- ✅ TailwindCSS styling
- ✅ Matter table with pagination
- ✅ Basic sorting UI (ready for your implementation)
- ✅ Loading and error states

### Infrastructure
- ✅ Docker Compose orchestration
- ✅ Automatic database seeding
- ✅ Health checks
- ✅ Development and production modes

---

## 📊 System Architecture

```
┌─────────────────┐
│   React SPA     │  ← Frontend (Port 8080)
│  (Vite + TS)    │     - Table with pagination
└────────┬────────┘     - YOU IMPLEMENT: Sorting, Search, Cycle Time display
         │
         │ HTTP/REST
         │
┌────────▼────────┐
│  Express API    │  ← Backend (Port 3000)
│  (Node.js + TS) │     - Basic CRUD endpoints
└────────┬────────┘     - YOU IMPLEMENT: Sorting, Search, Cycle Time service
         │
         │ pg (connection pool)
         │
┌────────▼────────┐
│  PostgreSQL 15  │  ← Database (Port 5432)
│  + pg_trgm      │     - 10,000 seeded matters
└─────────────────┘     - Complete schema ready
```

---

## 💾 Database Schema (Quick Overview)

We use an **Entity-Attribute-Value (EAV)** pattern for flexible field definitions. This is important to understand for your sorting and search implementations!

### Key Tables (11 total)

| Table | Purpose | Rows Seeded |
|-------|---------|-------------|
| `ticketing_ticket` | Matter records | 10,000 |
| `ticketing_ticket_field_value` | Field values (EAV table) | ~90,000 |
| `ticketing_fields` | Field definitions | 9 |
| `ticketing_cycle_time_histories` | Status transitions | Variable |
| `ticketing_field_status_groups` | Status groups (To Do, In Progress, Done) | 3 |
| `users` | User assignments | 5 |
| ... + 5 more tables | Options, currencies, etc. | Various |

### 8 Field Types

| Type | Storage Column | Example |
|------|----------------|---------|
| `text` | `text_value` or `string_value` | Subject, Description |
| `number` | `number_value` | Case Number |
| `select` | `select_reference_value_uuid` | Priority |
| `date` | `date_value` | Due Date |
| `currency` | `currency_value` (JSONB) | Contract Value |
| `boolean` | `boolean_value` | Urgent flag |
| `status` | `status_reference_value_uuid` | Matter Status |
| `user` | `user_value` | Assigned To |

**📖 Full Details**: See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for:
- Complete table schemas with column descriptions
- EAV pattern explanation
- Sample SQL queries for sorting and search
- Performance optimization tips
- Index documentation

---

## 🛠️ Development Commands

```bash
# Start everything
docker compose up

# Start in development mode (with hot reload)
docker compose -f docker-compose.dev.yml up

# View logs
docker compose logs -f backend

# Stop services
docker compose down

# Clean up (removes data)
docker compose down -v

# Run tests
cd backend && npm test

# Build frontend
cd frontend && npm run build

# Build backend
cd backend && npm run build
```

---

## 🔌 API Endpoints

### What's Implemented

```http
GET /health
GET /api/v1/fields
GET /api/v1/matters?page=1&limit=25&sortBy=created_at&sortOrder=desc
GET /api/v1/matters/:id
PATCH /api/v1/matters/:id
```

**Note**: `sortBy` currently only supports `created_at` and `updated_at`. You'll add support for field-based sorting (case_number, status, etc.).

### What You'll Add

**Sorting**:
```http
GET /api/v1/matters?sortBy=case_number&sortOrder=asc
GET /api/v1/matters?sortBy=status&sortOrder=desc
```

**Search**:
```http
GET /api/v1/matters?search=contract&page=1&limit=25
```

**Cycle Time/SLA** (added to response):
```json
{
  "data": [{
    "id": "uuid",
    "fields": { ... },
    "cycleTime": {
      "resolutionTimeMs": 14400000,
      "resolutionTimeFormatted": "4h",
      "isInProgress": false
    },
    "sla": "Met"
  }]
}
```

---

## 🧪 Testing

We've configured Vitest for you. You'll write the actual tests.

**Run tests**:
```bash
cd backend
npm test

# With coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

**What to test**:
- ✅ Cycle time calculations (NULL handling, edge cases)
- ✅ SLA determination logic
- ✅ Sorting with different field types
- ✅ Search across all fields
- ✅ API endpoints (integration tests)
- ✅ Error conditions

**Test location**: `backend/src/ticketing/matter/service/__tests__/`

---

## 🤖 AI Tool Usage

**You may use AI tools** (GitHub Copilot, ChatGPT, Claude, etc.), but:

### ✅ We Expect
- Honest disclosure of which tools you used
- Explanation of what was AI-generated vs. human-written
- Justification for using AI for specific parts
- **Full accountability** for all submitted code

### ❌ Unacceptable
- Blindly copying AI output without review
- Submitting code you don't understand
- Not testing AI-generated code

### Good Example Disclosure
> "I used GitHub Copilot to generate the initial cycle time query structure, but I rewrote the NULL handling logic and added edge case tests manually. The duration formatting function was AI-assisted but I modified it to handle our specific requirements (in-progress matters, very large durations). I am confident in the correctness and can explain every line."

---

## ✅ Submission Checklist

Before you submit, make sure:

### Implementation
- [ ] Cycle time & SLA working correctly
- [ ] Sorting works for ALL columns
- [ ] Search works across all field types
- [ ] Tests written with good coverage
- [ ] Edge cases handled (NULL, empty, missing data)

### Code Quality
- [ ] No TypeScript errors (`npm run build` succeeds in both backend & frontend)
- [ ] No linting errors (`npm run lint` passes)
- [ ] Code follows existing patterns
- [ ] Clear variable and function names
- [ ] Error handling throughout

### Documentation
- [ ] README.md updated with your approach
- [ ] Scalability analysis included (specific, quantified)
- [ ] AI tool usage disclosed (if applicable)
- [ ] Trade-offs explained
- [ ] Setup instructions verified

### Testing
- [ ] Application runs with `docker compose up`
- [ ] Tests pass with `npm test`
- [ ] Edge cases tested
- [ ] Integration tests included

### Performance
- [ ] No N+1 query problems
- [ ] Efficient SQL queries
- [ ] Proper index usage
- [ ] Connection pooling configured

---

## 📂 Project Structure

```
matter-management-mvp/
├── README.md                    ← You're here!
├── ASSESSMENT.md                ← Task instructions
├── DATABASE_SCHEMA.md           ← Schema docs (read this!)
├── QUICKSTART.md                ← Setup guide
├── verify-setup.sh              ← Prerequisites checker
│
├── backend/
│   ├── src/
│   │   ├── ticketing/
│   │   │   ├── matter/
│   │   │   │   ├── service/
│   │   │   │   │   ├── cycle_time_service.ts    ← IMPLEMENT: Cycle time
│   │   │   │   │   ├── matter_service.ts
│   │   │   │   │   └── __tests__/               ← ADD: Your tests
│   │   │   │   ├── repo/
│   │   │   │   │   └── matter_repo.ts           ← IMPLEMENT: Sorting & search
│   │   │   │   ├── handlers/
│   │   │   │   │   ├── getMatters.ts
│   │   │   │   │   ├── getMatterDetails.ts
│   │   │   │   │   ├── updateMatter.ts
│   │   │   │   │   └── getFields.ts
│   │   │   │   └── routes.ts
│   │   │   ├── fields/
│   │   │   │   └── repo/fields_repo.ts
│   │   │   └── types.ts
│   │   ├── db/pool.ts
│   │   ├── utils/
│   │   │   ├── config.ts
│   │   │   └── logger.ts
│   │   └── app.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                      ← ADD: SearchBar component
│   │   ├── components/
│   │   │   ├── MatterTable.tsx          ← IMPLEMENT: Sort handlers, cycle time/SLA display
│   │   │   └── Pagination.tsx
│   │   ├── hooks/
│   │   │   └── useMatters.ts
│   │   ├── types/
│   │   │   └── matter.ts
│   │   └── utils/
│   │       └── formatting.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── Dockerfile
│
├── database/
│   ├── schema.sql               ← Complete schema
│   ├── seed.js                  ← Seeds 10,000 matters
│   ├── package.json
│   └── Dockerfile
│
└── docker-compose.yml           ← Main compose file
```

---

## 🎓 What We're Looking For

We evaluate across these dimensions:

### 1. Code Quality (25%)
- Clean, maintainable code
- TypeScript best practices
- Follows SOLID principles
- Consistent patterns

### 2. Production Readiness (20%)
- Comprehensive error handling
- Input validation
- Logging with context
- Edge case handling

### 3. Security (15%)
- SQL injection prevention
- Input sanitization
- Safe error messages

### 4. Testing (20%)
- Unit and integration tests
- Edge case coverage
- Test quality and design

### 5. System Design (15%)
- Query optimization
- Scalability thinking
- Caching strategy
- Trade-off awareness

### 6. Documentation (5%)
- Clear explanations
- Decision justifications
- Scalability analysis

---

## 💡 Tips for Success

1. **Read DATABASE_SCHEMA.md first** - Understanding the EAV pattern is critical
2. **Start with cycle times** - It's the foundation for other features
3. **Test as you go** - Don't wait until the end
4. **Think production** - This is meant to be production-ready code
5. **Document your thinking** - Explain WHY, not just WHAT
6. **Be honest about AI** - We value transparency
7. **Manage your time** - 4-8 hours total, prioritize accordingly

---

## ❓ Questions?

- **Setup issues?** See [QUICKSTART.md](./QUICKSTART.md)
- **Schema questions?** See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)
- **Task unclear?** Document your assumptions in your submission
- **Found a bug in the boilerplate?** Note it in your README

We're interested in how you think through ambiguity. Make reasonable assumptions and document them.

---

## 🚀 Ready to Start?

1. ✅ Read [ASSESSMENT.md](./ASSESSMENT.md) for detailed requirements
2. ✅ Review [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) to understand the data model
3. ✅ Run `docker compose up` to start the system
4. ✅ Start coding!

**Good luck! We're excited to see your solution.** 🎉

---

---

## Scalability Strategy (10× Load)

If this system needed to handle **100,000 matters** and **1,000+ concurrent users**, here's what I would do:

### Database Optimization (Primary Focus)

The main bottleneck will be the database. Here's what I'd implement:

**1. Add Database Indexes**
```sql
-- Speed up sorting and filtering
CREATE INDEX idx_ticket_created ON ticketing_ticket(created_at DESC);
CREATE INDEX idx_ticket_board ON ticketing_ticket(board_id);

-- Speed up field value lookups
CREATE INDEX idx_field_value_ticket ON ticketing_ticket_field_value(ticket_id, ticket_field_id);

-- Speed up cycle time queries
CREATE INDEX idx_cycle_time_ticket ON ticketing_cycle_time_histories(ticket_id, transitioned_at);

-- Speed up search (full-text)
CREATE INDEX idx_field_text_search ON ticketing_ticket_field_value 
USING gin(to_tsvector('english', COALESCE(text_value, string_value)));
```
**Impact**: 50-70% faster queries  
**Complexity**: Low - just add indexes

**2. Denormalize the Data vs Materialized Views**

Current approach requires joining 5+ tables for the list view. Two options:

**Option A: Denormalized Table** (Recommended for this use case)
- Create a `matter_list_view` table with pre-computed display values
- Update it in real-time whenever a matter or field changes (via triggers or application code)
- Query becomes a simple `SELECT * FROM matter_list_view`

**When to use**: When you need real-time data and can handle write complexity

**Option B: Materialized View**
```sql
CREATE MATERIALIZED VIEW matter_list_cache AS
SELECT tt.id, tt.board_id, ... -- pre-computed fields
FROM ticketing_ticket tt
JOIN ... -- all the joins
```

**When to use**: When slightly stale data is acceptable (refresh every 5-15 minutes)

**Why I'd choose denormalization here**:
- Matter updates need to be visible immediately (real-time requirement)
- Writes are infrequent compared to reads
- More control over what gets updated and when

**Impact**: 80-90% faster list queries  
**Trade-off**: More complex writes, but reads are 90% of traffic

**3. Use PgBouncer for Connection Pooling**

Add PgBouncer between application and database:
```yaml
# docker-compose.yml
pgbouncer:
  image: pgbouncer/pgbouncer
  environment:
    - DATABASES_HOST=postgres
    - POOL_MODE=transaction
    - MAX_CLIENT_CONN=1000
    - DEFAULT_POOL_SIZE=25
```

**Impact**: Handle 10× more concurrent connections  
**Complexity**: Low - just add a container

**4. Table Partitioning**

For very large datasets (millions of matters), partition by date:

```sql
-- Partition matters by year
CREATE TABLE ticketing_ticket_2024 PARTITION OF ticketing_ticket
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE ticketing_ticket_2025 PARTITION OF ticketing_ticket
FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
```

**When to use**: When you have millions of records and queries typically filter by date  
**Impact**: 40-60% faster queries on recent data (most common use case)  
**Trade-off**: More complex schema management

**Why not needed yet**: Current dataset is 10K matters, partitioning helps at 1M+

**5. Database Read Replicas**

For read-heavy workload:
- Primary database for writes
- 1-2 read replicas for queries
- Route GET requests to replicas

**Impact**: 2-3× read capacity  
**Trade-off**: Slight replication lag (typically <1 second)

### Application Scaling

**Horizontal Scaling**

Add a load balancer (nginx) and run 3-5 backend instances:
```
Load Balancer → Backend 1, Backend 2, Backend 3 → Database
```

The application is already stateless, so this is straightforward.

**Impact**: Linear scaling (3 instances = 3× capacity)

### Caching Strategy

**What to Cache**: Only the matter list results (not individual matters)

```typescript
// Cache paginated list results for 1 minute
const cacheKey = `matters:${page}:${limit}:${sortBy}:${search}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);
```

**Why not cache individual matters?**  
- They change frequently (updates, field changes)
- Cache invalidation becomes complex
- Database is fast enough for single-record lookups

**Impact**: 60-70% reduction in database load for repeated queries  
**Trade-off**: Need to run Redis, 1-minute stale data

### What I Would NOT Do

- **Elasticsearch**: Overkill for this use case. PostgreSQL full-text search is sufficient. Instead of complex search, I'd add more filter options (status filter, priority filter, date range) which are simpler and more useful.
- **Materialized Views**: Denormalized table is simpler and more flexible.
- **Complex Caching**: Individual matter caching adds complexity without much benefit.

### Implementation Priority

1. **Week 1**: Add database indexes (biggest impact, lowest effort)
2. **Week 2**: Add PgBouncer for connection pooling,  Denormalize data into `matter_list_view` table
3. **Week 3**: Add horizontal scaling with load balancer
4. **Later**: Add read replicas and Redis caching if needed

---

## AI Tool Usage

I used **KIRO** throughout this assessment.

### What AI Helped With:

- **Test boilerplate**: Generated initial test structure and common test cases
- **TypeScript types**: Suggested type definitions and interfaces
- **SQL queries**: Co-created queries (50% AI suggestions, 50% human refinement)
- **Documentation**: Helped write comments and README sections
- **Code review**: Identified potential issues and suggested improvements

### What I Wrote Myself:

- **All business logic**: Cycle time calculations, SLA determination, duration formatting
- **SQL query optimization**: Refined AI-generated queries for performance and security
- **Architecture decisions**: 2-query approach, type separation, error handling
- **Test scenarios**: All test assertions and edge cases
- **Integration**: How everything fits together

### Collaboration Breakdown:

- **SQL Queries**: 50% AI-generated templates, 50% human refinement for optimization and security
- **Tests**: 60% AI-generated structure, 40% human-written assertions and edge cases
- **Types**: 70% AI-suggested, 30% human-refined for accuracy
- **Business Logic**: 100% human-written
- **Architecture**: 100% human-designed

### Review Process:

Every piece of AI-generated code was:
1. Reviewed line-by-line for correctness
2. Tested with unit and integration tests
3. Refactored for production readiness
4. Validated against security best practices (SQL injection, input validation)

I am fully accountable for all code submitted. AI was a productivity tool, not a replacement for engineering judgment.

---

## Trade-offs & Design Decisions

### 1. Two Queries Instead of One Big JOIN

**Decision**: Fetch matters first, then fetch fields in a second query

**Why**: 
- Avoids data duplication (matter data repeated 10× for each field)
- Simpler queries are easier to optimize
- Better performance with large datasets

**Trade-off**: Two database round trips instead of one (negligible with connection pooling)

### 2. SQL-based Cycle Time Calculation

**Decision**: Calculate cycle times in SQL, not application code

**Why**:
- Database can filter and sort before returning data
- Reduces data transfer over the network
- Leverages database indexes

**Trade-off**: More complex SQL queries

### 3. Parameterized Queries Everywhere

**Decision**: Always use `$1, $2` placeholders, never string concatenation

**Why**: Prevents SQL injection attacks

**Trade-off**: None - this is a security requirement

### 4. Batch Field Fetching

**Decision**: Fetch all fields for all matters in one query

**Why**: Avoids N+1 query problem (25 queries → 2 queries)

**Trade-off**: More complex data transformation in code, but 10-20× faster

---

## What I'd Improve With More Time

- **Frontend tests**: Component tests with React Testing Library
- **Performance benchmarks**: Document query performance with EXPLAIN ANALYZE
- **API documentation**: OpenAPI/Swagger spec
- **Audit logging**: Track all matter changes for compliance
- **Advanced search**: Fuzzy search, date range filters
- **Error recovery**: Retry logic and circuit breakers

---


