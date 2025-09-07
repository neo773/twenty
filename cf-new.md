# Computed Fields Simplified Implementation Plan

## Overview
This document provides a comprehensive implementation plan for simplifying the pre-computed fields system in Twenty CRM. The goal is to leverage existing infrastructure (metadataArgsStorage, ObjectMetadataMaps, Redis caching, TwentyORM) to create a high-performance, production-ready system that processes thousands of events efficiently without "raping the database."

## Research Findings

### Current Implementation Issues
1. **Overcomplicated Logic**: Service checks ALL computed fields globally instead of checking if event entity has virtual fields
2. **Poor Performance**: Multiple metadata DB calls, individual processing, no batching
3. **Hardcoded Limitations**: Only works with `standardObjectMetadataDefinitions`
4. **Bad Code Quality**: Scattered logic, inefficient patterns
5. **Wrong Approach**: Calls `getComputedFieldMetadata()` globally instead of checking event entity itself

### Existing Infrastructure Analysis

#### 1. MetadataArgsStorage Pattern
**Location**: `src/engine/twenty-orm/storage/metadata-args.storage.ts`
- **Singleton in-memory registry** storing all decorator metadata
- Contains `WorkspaceFieldMetadataArgs[]` with virtual field information
- Provides `filterFields(target)` method for fast lookups
- **NO DATABASE CALLS** - all data in memory from application startup

#### 2. WorkspaceField Decorator Pattern  
**Location**: `src/engine/twenty-orm/decorators/workspace-field.decorator.ts`
```typescript
@WorkspaceField({
  standardId: COMPANY_STANDARD_FIELD_IDS.lastCalendarEventDate,
  type: FieldMetadataType.DATE_TIME,
  label: msg`Last Calendar Event Date`,
  virtualField: lastCalendarEventDate, // <-- Virtual field stored here
})
```
- Virtual fields stored via `virtualField` property
- Automatically added to `metadataArgsStorage` on startup
- Contains full `VirtualField` definition with dependencies, paths, conditions

#### 3. ObjectMetadataMaps Infrastructure
**Location**: `src/engine/metadata-modules/types/object-metadata-maps.ts`
- **Already cached** runtime metadata via `WorkspaceCacheStorageService`
- Structure: `{ byId: {}, idByNameSingular: {} }`
- Each object includes `fieldsById` and `fieldIdByJoinColumnName` maps
- Access pattern: `workspaceCacheStorageService.getObjectMetadataMapsOrThrow(workspaceId)`

#### 4. Batch Processing Patterns
**Found in**: workflow triggers
- **Standard batch size**: 20-50 items
- **Error isolation**: Individual batch failures don't stop processing
- **Sequential processing**: Batches processed one at a time, not parallel
- **Detailed logging**: Progress tracking for each batch

#### 5. Repository Patterns
**Location**: `src/engine/twenty-orm/entity-manager/workspace-entity-manager.ts`
- **Permission-aware operations** with bypass for system operations
- **Bulk operations**: `updateMany` with multiple criteria/entity pairs
- **Event emission**: All changes emit events automatically
- Access pattern: `twentyORMGlobalManager.getRepositoryForWorkspace(workspaceId, entityName, { shouldBypassPermissionChecks: true })`

#### 6. Caching Patterns
**Location**: `src/engine/workspace-cache-storage/workspace-cache-storage.service.ts`
- **Redis-backed caching** with TTL support
- Pattern: `workspaceCacheStorageService.get(key)` / `workspaceCacheStorageService.set(key, value, ttl)`
- Used for metadata caching and fast lookups

## Implementation Specification

### Core Design Principles

1. **Leverage Existing Infrastructure**: Use metadataArgsStorage, ObjectMetadataMaps, Redis caching
2. **Batch-First Processing**: Process events in batches of 20-50 items
3. **Fast Event Filtering**: Early exit for events with no virtual fields
4. **Error Isolation**: Failed batches don't stop processing
5. **Cache-Aware**: Use existing Redis patterns for fast lookups
6. **Permission-Conscious**: Use system permissions for bulk updates

### Data Structures

```typescript
type PreComputedFieldMetadata = {
  fieldName: string;
  virtualField: VirtualField;
  objectMetadataId: string;
};

type BulkUpdateOperation = {
  entityId: string;
  fieldName: string;
  value: PrimitiveValue;
};

type ProcessEventsParams = {
  events: ObjectRecordNonDestructiveEvent[];
  workspaceId: string;
};
```

### High-Level Flow

```
Events In → Fast Filter (has virtual fields?) → Group by Object Type → 
Filter by Dependencies → Bulk Resolve Affected Entities → 
Bulk Compute Values → Bulk Update → Done
```

### Detailed Implementation Steps

#### Step 1: Fast Event Filtering
**Method**: `processEventsForComputedFields(params: ProcessEventsParams)`

1. **Input**: Batch of events from `entityEventsToDbQueue` via existing event infrastructure
2. **Fast Filter**: For each event, check if object has virtual fields using in-memory metadataArgsStorage
3. **Early Exit**: If no events have virtual fields, return immediately
4. **Cache ObjectMetadataMaps**: Get once for entire batch using `getObjectMetadataMapsOrThrow()`
5. **Delegate**: Call batch processing with filtered events

**Key Pattern**: Use existing in-memory metadataArgsStorage for fast virtual field checks

#### Step 2: Virtual Field Existence Check
**Method**: `hasVirtualFields(objectMetadataId: string)`

1. **Direct Check**: Use `metadataArgsStorage.filterFields()` to check for virtual fields (already in memory)
2. **Return**: Boolean indicating if object has virtual fields

**Key Pattern**: Use existing in-memory metadataArgsStorage, no manual caching needed

#### Step 3: Virtual Field Discovery
**Method**: `getVirtualFieldsForObjectMetadata(objectMetadataId: string)`

1. **Find Entity Target**: Locate entity class in `standardObjectMetadataDefinitions` by objectMetadataId
2. **Get Field Metadata**: Use `metadataArgsStorage.filterFields(entityTarget)` 
3. **Filter Virtual Fields**: Return only fields with `virtualField` property
4. **Map Structure**: Convert to `PreComputedFieldMetadata[]` format

**Key Pattern**: Use existing metadataArgsStorage pattern, no database calls

#### Step 4: Batch Processing with Object Grouping  
**Method**: `processBatchWithExistingInfra(events, objectMetadataMaps, workspaceId)`

1. **Group Events**: Create `Map<objectId, events[]>` for efficient processing
2. **Process by Object Type**: Handle all events for same object together
3. **Error Isolation**: Wrap each object type processing in try/catch
4. **Logging**: Log progress for each object type batch

**Key Pattern**: Follow existing batch processing patterns from IMAP/workflow services

#### Step 5: Object-Type Event Processing
**Method**: `processEventsForObjectType(events, objectMetadataId, objectMetadataMaps, workspaceId)`

1. **Get Virtual Fields**: Use cached virtual field discovery (Step 3)
2. **Dependency Filtering**: Filter virtual fields that depend on event types
3. **Early Exit**: If no relevant fields, skip processing
4. **Bulk Processing**: Delegate to bulk computation step

**Key Pattern**: Smart filtering to avoid unnecessary computation

#### Step 6: Dependency-Based Field Filtering
**Method**: `fieldNeedsProcessing(field: PreComputedFieldMetadata, events: ObjectRecordNonDestructiveEvent[])`

1. **Extract Event Types**: Map events to their `nameSingular` values
2. **Check Dependencies**: Compare with `field.virtualField.dependencies`
3. **Return Match**: Boolean indicating if field depends on any event types

**Key Pattern**: Efficient dependency matching using existing `PreComputedFieldDependencies` enum

#### Step 7: Bulk Virtual Field Processing
**Method**: `bulkProcessVirtualFields(events, virtualFields, objectMetadataMaps, workspaceId)`

1. **Get Repository**: Use `twentyORMGlobalManager.getRepositoryForWorkspace()` with permission bypass
2. **Affected Entity Resolution**: For each event, find entities that need recomputation
3. **Bulk Computation**: Compute all virtual field values for affected entities
4. **Bulk Update**: Execute single bulk update operation
5. **Error Handling**: Log individual computation errors, continue processing

**Key Pattern**: Leverage existing TwentyORM bulk operations

#### Step 8: Affected Entity Resolution
**Method**: `getAffectedEntityIds(event, virtualFields, objectMetadataMaps)`

1. **Per-Field Resolution**: For each virtual field, find affected entities
2. **Path-Based Logic**: Use existing `findAffectedEntitiesByPath()` method
3. **Deduplication**: Use `Set<string>` to avoid duplicate entity processing
4. **Return Array**: Convert set to array of entity IDs

**Key Pattern**: Reuse existing path resolution logic

#### Step 9: Bulk Database Updates
**Method**: `executeBulkUpdates(repository, updateOperations: BulkUpdateOperation[])`

1. **Group by Entity**: Create `Map<entityId, updates>` structure
2. **Batch Updates**: Use repository pattern for bulk operations
3. **Single Transaction**: Execute all updates efficiently
4. **Error Handling**: Log failures but continue processing

**Key Pattern**: Follow existing bulk update patterns from TwentyORM

### Integration Points

#### With Existing Event System
- **No changes** to existing event infrastructure
- Events come from `entityEventsToDbQueue` (defined in `src/engine/core-modules/message-queue/message-queue.constants.ts`)
- Service receives batched events through existing `ProcessEventsParams` interface
- Works with existing `ObjectRecordNonDestructiveEvent` types

#### With Existing Job Processing
- Maintain existing job processing architecture  
- Jobs continue to call `processEventsForComputedFields()` method
- No changes to job registration or scheduling

#### With Existing Caching
- Use existing `WorkspaceCacheStorageService` for Redis operations
- Follow existing caching key patterns and TTL strategies
- Leverage existing `ObjectMetadataMaps` caching

#### With Existing Repository Layer
- Use existing `TwentyORMGlobalManager` for repository access
- Follow existing permission patterns (bypass for system operations)
- Use existing bulk update methods

### Performance Optimizations

#### 1. Fast Event Filtering
- **In-memory metadataArgsStorage** for virtual field existence (already cached in memory)
- **Early exit** for events with no virtual fields
- **Batch-level** filtering before any heavy processing

#### 2. Efficient Metadata Access  
- **metadataArgsStorage** for in-memory virtual field discovery
- **ObjectMetadataMaps** for cached runtime metadata
- **No database calls** for metadata access

#### 3. Bulk Processing
- **Group events** by object type to minimize context switching
- **Batch computations** by field dependency patterns
- **Single bulk updates** instead of individual operations

#### 4. Smart Dependency Filtering
- **Dependency-based processing** to avoid unnecessary computation
- **Field-level filtering** before computation
- **Event type matching** for efficient field selection

### Error Handling Strategy

#### 1. Batch-Level Resilience
- Individual batch failures don't stop overall processing
- Detailed error logging with batch context
- Continue processing remaining batches on failure

#### 2. Field-Level Error Handling
- Individual field computation errors don't stop batch
- Log errors with entity and field context
- Skip failed computations, continue with others

#### 3. Repository-Level Safety
- Use existing transaction patterns for consistency
- Handle repository errors gracefully
- Maintain data integrity on partial failures

### Testing Strategy

#### 1. Unit Tests
- Test virtual field discovery logic
- Test dependency filtering accuracy
- Test bulk computation correctness
- Mock external dependencies (Redis, repositories)

#### 2. Integration Tests
- Test with real ObjectMetadataMaps
- Test with actual virtual field definitions
- Test bulk processing with multiple event types
- Verify performance with large event batches

#### 3. Performance Tests  
- Benchmark with 1000+ events
- Measure Redis cache hit rates
- Profile database query patterns
- Verify no N+1 query issues

### Migration Considerations

#### 1. Backward Compatibility
- Maintain existing `processEventsForComputedFields` interface
- Keep existing job processing patterns
- No breaking changes to virtual field definitions

#### 2. Gradual Rollout
- Feature flag for new implementation
- Side-by-side comparison with old system  
- Monitor performance metrics during transition
- Rollback capability if issues arise

#### 3. Data Consistency
- Ensure computed values match between implementations
- Handle any existing computed field inconsistencies
- Verify virtual field dependency accuracy

### Future Enhancements

#### 1. User-Defined Virtual Fields
- Add `virtualField` column to `FieldMetadata` entity
- Extend discovery logic to check database-stored virtual fields
- Maintain same performance patterns with cached lookups

#### 2. Advanced Dependency Tracking
- More granular dependency tracking beyond object-level
- Field-level change detection for more precise updates
- Intelligent change propagation algorithms

#### 3. Real-Time Processing
- WebSocket integration for real-time virtual field updates
- Incremental computation for large datasets
- Priority-based processing for critical virtual fields

## File Changes Required

### Modified Files
- `packages/twenty-server/src/modules/pre-computed-fields/services/pre-computed-fields.service.ts` - Complete rewrite using patterns above

### No Changes Required  
- Job processing infrastructure
- Event emission system
- Virtual field definitions in workspace entities
- Existing caching infrastructure
- Repository patterns
- Permission system

## Success Criteria

1. **Performance**: Handle 1000+ events per batch efficiently
2. **Database Efficiency**: Minimal database queries (leverage caching)
3. **Code Quality**: Follow existing codebase patterns and conventions
4. **Error Resilience**: Individual failures don't stop batch processing
5. **Maintainability**: Clear, simple logic that's easy to understand and extend
6. **Production Ready**: Suitable for high-throughput production environments

This specification provides a complete blueprint for implementing the simplified, high-performance computed fields system using Twenty's existing infrastructure and patterns.