# Computed Fields Implementation Specification

## Overview

This document specifies a complete rewrite of the computed fields system to support both primitive return types (TEXT, NUMBER, DATE_TIME, etc.) and relational entity returns (PersonWorkspaceEntity, CompanyWorkspaceEntity, etc.) using a new, more elegant syntax design.

## Core Requirements

### 1. Complete Rewrite Strategy
- **NUKE EXISTING IMPLEMENTATION**: Delete all existing computed fields code (except job processor register code) and start from a blank slate
- This approach is cleaner than trying to refactor the existing prototype
- Maintain the same module structure but implement entirely new logic

### 2. Return Type Support
- **Primitive Types**: Support all `FieldMetadataType` values (TEXT, NUMBER, DATE_TIME, BOOLEAN, etc.)
- **Entity Types**: Support returning full workspace entities (PersonWorkspaceEntity, CompanyWorkspaceEntity, etc.)
- The system should automatically determine return type based on the VirtualField configuration

### 3. Syntax Design Principles
- **Path-based relationship traversal**: Use Felix's proven path array approach
- **Clean conditional logic**: Use `when` array for scalable conditional statements
- **Ranking system**: Use `rankBy` for "find best/worst" scenarios instead of verbose SQL-like syntax
- **Standard field ID consistency**: All field references use STANDARD_OBJECT_FIELD_IDS

## Data Structures

### Core VirtualField Type
```ts
type VirtualField = {
  objectMetadataId: string;           // STANDARD_OBJECT_IDS value
  fieldMetadataId: string;            // Field ID from STANDARD_OBJECT_FIELD_IDS
  dependencies: PreComputedFieldDependencies[];
} & (ConditionalField | PathBasedField);
```

### Conditional Fields (for primitive returns)
```ts
type ConditionalField = {
  when: WhenClause[];
  default: PrimitiveValue;
};

type WhenClause = {
  condition: Condition;
  value: PrimitiveValue;
};
```

### Path-Based Fields (for aggregations and entity returns)
```ts
type PathBasedField = {
  path: string[];                     // Array of STANDARD_OBJECT_FIELD_IDS for relationship traversal
  calculation: AggregateOperations;   // COUNT, MAX, MIN, SUM, AVG, etc.
  where?: Condition;                  // Optional filtering conditions
  rankBy?: RankingClause;            // Optional ranking for entity selection
};

type RankingClause = {
  direction: Direction;               // ASC or DESC
  limit: number;                     // Usually 1 for "strongest/best" scenarios
};
```

### Condition System
```ts
type Condition = FieldCondition | LogicalCondition;

type FieldCondition = {
  field: string;                     // STANDARD_OBJECT_FIELD_IDS value
  operator: Operator;                // GT, GTE, LT, LTE, EQ, NE
  value: PrimitiveValue;
};

type LogicalCondition = {
  and?: Condition[];
  or?: Condition[];
  not?: Condition;
};
```

### Enums
```ts
enum Operator {
  GT = "gt",
  GTE = "gte", 
  LT = "lt",
  LTE = "lte",
  EQ = "eq",
  NE = "ne",
}

enum Direction {
  ASC = "asc",
  DESC = "desc",
}

// Extend existing AggregateOperations as needed
enum AggregateOperations {
  MIN = 'MIN',
  MAX = 'MAX',
  AVG = 'AVG',
  SUM = 'SUM',
  COUNT = 'COUNT',
  COUNT_UNIQUE_VALUES = 'COUNT_UNIQUE_VALUES',
  COUNT_EMPTY = 'COUNT_EMPTY',
  COUNT_NOT_EMPTY = 'COUNT_NOT_EMPTY',
  COUNT_TRUE = 'COUNT_TRUE',
  COUNT_FALSE = 'COUNT_FALSE',
  PERCENTAGE_EMPTY = 'PERCENTAGE_EMPTY',
  PERCENTAGE_NOT_EMPTY = 'PERCENTAGE_NOT_EMPTY',
}
```

## Reference Examples

### Example 1: Customer Tier (Conditional Logic → TEXT)
```ts
const customerTier: VirtualField = {
  objectMetadataId: STANDARD_OBJECT_IDS.company,
  fieldMetadataId: COMPANY_STANDARD_FIELD_IDS.customerTier,
  when: [
    {
      condition: {
        and: [
          { field: COMPANY_STANDARD_FIELD_IDS.annualRecurringRevenue, operator: Operator.GTE, value: 100_000_000_000 },
          { field: COMPANY_STANDARD_FIELD_IDS.connectionStrength, operator: Operator.GTE, value: 50 }
        ]
      },
      value: 'ENTERPRISE'
    },
    {
      condition: {
        or: [
          { field: COMPANY_STANDARD_FIELD_IDS.annualRecurringRevenue, operator: Operator.GTE, value: 50_000_000_000 },
          { field: COMPANY_STANDARD_FIELD_IDS.connectionStrength, operator: Operator.GTE, value: 25 }
        ]
      },
      value: 'BUSINESS'
    }
  ],
  default: 'BASIC',
  dependencies: [PreComputedFieldDependencies.Company]
};
```

### Example 2: Strongest Connection (Entity Return)
```ts
const strongestConnection: VirtualField = {
  objectMetadataId: STANDARD_OBJECT_IDS.company,
  fieldMetadataId: COMPANY_STANDARD_FIELD_IDS.strongestConnection,
  path: [STANDARD_OBJECT_FIELD_IDS.company.people],
  calculation: AggregateOperations.COUNT,
  where: {
    or: [
      { field: STANDARD_OBJECT_FIELD_IDS.person.calendarEventParticipants, operator: Operator.GT, value: 0 },
      { field: STANDARD_OBJECT_FIELD_IDS.person.messageParticipants, operator: Operator.GT, value: 0 }
    ]
  },
  rankBy: {
    direction: Direction.DESC,
    limit: 1
  },
  dependencies: [PreComputedFieldDependencies.CalendarEvent, PreComputedFieldDependencies.Message]
};
```

### Example 3: Last Calendar Event Date (Aggregation → DATE_TIME)
```ts
const lastCalendarEventDate: VirtualField = {
  objectMetadataId: STANDARD_OBJECT_IDS.company,
  fieldMetadataId: COMPANY_STANDARD_FIELD_IDS.lastCalendarEventDate,
  path: [
    STANDARD_OBJECT_FIELD_IDS.company.people,
    STANDARD_OBJECT_FIELD_IDS.person.calendarEventParticipants,
    STANDARD_OBJECT_FIELD_IDS.calendarEventParticipant.calendarEvent,
    STANDARD_OBJECT_FIELD_IDS.calendarEvent.startsAt
  ],
  calculation: AggregateOperations.MAX,
  where: {
    field: STANDARD_OBJECT_FIELD_IDS.calendarEventParticipant.responseStatus,
    operator: Operator.EQ,
    value: CalendarEventParticipantResponseStatus.ACCEPTED
  },
  dependencies: [PreComputedFieldDependencies.CalendarEvent]
};
```

## Implementation Requirements

### 1. Module Structure
Keep the existing module structure but implement new logic:
```
packages/twenty-server/src/modules/pre-computed-fields/
├── commands/
├── jobs/
├── services/
│   ├── expression-evaluator.service.ts    # NEW: Handle conditional logic
│   ├── path-evaluator.service.ts          # NEW: Handle path-based queries  
│   ├── ranking.service.ts                 # NEW: Handle rankBy logic
│   └── pre-computed-fields.service.ts     # REWRITE: Main orchestration
└── utils/
    └── field-id-resolver.util.ts          # KEEP: Essential for mapping STANDARD_OBJECT_FIELD_IDS to workspace fields
```

### 2. Key Services to Implement

#### ExpressionEvaluatorService
- **Purpose**: Evaluate `when` array conditional logic
- **Input**: ConditionalField + current record data
- **Output**: Resolved primitive value
- **Logic**: Iterate through `when` clauses, evaluate conditions, return first matching value or default

#### PathEvaluatorService  
- **Purpose**: Execute path-based relationship traversal with aggregation
- **Input**: PathBasedField + current record data
- **Output**: Aggregated value (primitive) or entity (for rankings)
- **Logic**: Follow path array, apply where filters, perform calculation, handle rankBy if present

#### RankingService
- **Purpose**: Handle `rankBy` logic for entity selection
- **Input**: Entities + ranking criteria
- **Output**: Selected entity(ies) based on ranking
- **Logic**: Calculate ranking metric per entity, sort, apply limit

### 3. Return Type Determination
The system should automatically determine return type based on the **path target**:
- **Conditional fields (`when` present)**: Always return primitive based on `value` types
- **Path ends at entity level** (e.g., `[company.people]`): Return full entity object (PersonWorkspaceEntity)
- **Path ends at field level** (e.g., `[company.people, person.calendarEvents, calendarEvent.startsAt]`): Return primitive value based on field type

### 4. SQL Generation Strategy
- **Conditional fields**: Generate CASE/WHEN SQL statements
- **Path-based fields**: Generate appropriate JOINs and aggregation SQL
- **Entity returns**: Ensure full entity data is selected, not just IDs

#### Special Handling for Entity Returns
When path ends at entity level (indicating entity return):
- SELECT the complete entity record (all columns from target table)
- Apply ranking/filtering logic to determine which entity(ies) to return
- Return the full workspace entity object, not just primitive values
- Example: `strongestConnection` path `[company.people]` should return `PersonWorkspaceEntity` with all fields populated

### 5. Integration Points

#### WorkspaceEntity Integration
Virtual fields should integrate seamlessly with existing workspace entities:
```ts
@WorkspaceField({
  standardId: COMPANY_STANDARD_FIELD_IDS.customerTier,
  type: FieldMetadataType.TEXT,
  label: msg`Customer Tier`,
  virtualField: customerTier,  // Reference to VirtualField definition
})
customerTier: string;

@WorkspaceField({
  standardId: COMPANY_STANDARD_FIELD_IDS.strongestConnection,
  type: FieldMetadataType.RELATION,
  label: msg`Strongest Connection`, 
  virtualField: strongestConnection,
})
strongestConnection: Relation<PersonWorkspaceEntity>;
```

#### Job Processing
- Maintain existing job processing architecture
- Jobs should handle both primitive and entity return types
- Ensure dependency tracking works with new syntax

### 6. Testing Requirements
Create comprehensive tests covering:
- All three example scenarios
- Edge cases for conditional logic (no matching conditions)
- Complex path traversal scenarios  
- Ranking with ties/empty results
- Both primitive and entity return types
- Performance with large datasets

### 7. Migration Strategy
Since this is a complete rewrite:
1. Implement new system alongside existing (different field names for testing)
2. Test thoroughly with real data
3. Switch over existing virtual fields to new syntax
4. Remove old implementation

## Performance Considerations

### 1. Query Optimization
- Path-based fields should generate efficient SQL JOINs
- Avoid N+1 queries in entity returns
- Use appropriate indexes on ranking/filtering fields

### 2. Caching Strategy
- Cache computed results appropriately based on dependencies
- Invalidate cache when dependency fields change
- Consider memory usage for entity returns vs primitive returns

### 3. Dependency Tracking
- Maintain existing PreComputedFieldDependencies system
- Ensure dependency updates trigger recomputation correctly
- Handle cascade updates for entity dependencies

## Error Handling

### 1. Validation
- Validate VirtualField syntax at startup/registration time
- Ensure field references exist and are accessible
- Validate operator/value type compatibility

### 2. Runtime Errors
- Handle missing/null data gracefully in path traversal
- Provide meaningful error messages for debugging
- Fallback to default values where appropriate

### 3. Performance Safeguards
- Set reasonable limits on path depth
- Timeout protection for complex queries
- Memory usage monitoring for large result sets

## Documentation Requirements

### 1. Developer Documentation
- Clear examples of all syntax patterns
- Migration guide from old to new syntax
- Performance best practices
- Troubleshooting guide

### 2. Type Documentation  
- Complete TypeScript interfaces
- JSDoc comments on all public APIs
- Usage examples in code comments

This specification provides a complete foundation for implementing the new computed fields system. The implementation should prioritize correctness first, then optimize for performance as needed.