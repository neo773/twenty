# Virtual Field Dependency Tracking Implementation Plan

## Overview

This document outlines the implementation plan for adding dependency tracking and initial calculation support to Twenty's virtual field system. The solution builds on existing infrastructure patterns while addressing two key requirements and following NestJS separation of concerns principles:

1. **Dependency Tracking**: Automatically recalculate virtual fields when dependent entities are mutated
2. **Initial Calculation**: Compute virtual field values when fields are first declared

## Current System Analysis

### Existing Virtual Field Architecture

**Core Components:**
- `PreComputedFieldsModule`: Main module with service orchestration
- `PreComputedFieldsService`: Event processing and field computation orchestration
- `VirtualFieldDiscoveryService`: Virtual field metadata discovery and management
- `PathEvaluatorService`: SQL-based path traversal and aggregation
- `BulkUpdateService`: Batch entity updates
- `ProcessPreComputedFieldsJob`: Background job for event processing

**Virtual Field Definition Pattern:**
Virtual fields are defined in workspace entities using `@WorkspaceField` decorator with `virtualField` property:

```typescript
@WorkspaceField({
  standardId: COMPANY_STANDARD_FIELD_IDS.lastCalendarEventDate,
  type: FieldMetadataType.DATE_TIME,
  virtualField: lastCalendarEventDate, // VirtualField definition
})
lastCalendarEventDate: Date | null;
```

**Current Event Processing Flow:**
1. Database events captured via `OnDatabaseBatchEvent` decorators in `EntityEventsToDbListener`
2. Events filtered to objects with virtual fields
3. Events queued to `ProcessPreComputedFieldsJob` via `entityEventsToDbQueue`
4. Background job processes events in batches by workspace

### Current Limitations

1. **No Dynamic Dependencies**: System cannot automatically determine dependencies from virtual field definitions
2. **No Reverse Lookup**: Cannot efficiently determine which virtual fields depend on a given entity type
3. **Missing Initial Calculation**: No mechanism to compute fields when first declared
4. **Limited Self-Dependencies**: Cannot handle same-object field dependencies (e.g., Company ARR affecting Company customerTier)

### Existing Infrastructure Patterns to Leverage

**MetadataArgsStorage Pattern:**
- In-memory singleton registry storing decorator metadata
- `metadataArgsStorage.filterFields(target)` for fast virtual field discovery
- No database calls - all data cached in memory at startup

**WorkspaceCacheStorageService Pattern:**
- Redis-backed caching with workspace isolation
- Key pattern: `{category}:{workspaceId}:{metadataVersion}`
- Consistent 1-week TTL (604,800,000ms) for metadata
- Pattern-based cache invalidation with `flushByPattern()`

**ObjectMetadataMaps Pattern:**
- Cached runtime metadata via `WorkspaceCacheStorageService`
- Structure: `{ byId: {}, idByNameSingular: {} }`
- Access: `workspaceCacheStorageService.getObjectMetadataMapsOrThrow(workspaceId)`

**Batch Processing Pattern:**
- Events grouped by object type: `Map<objectId, events[]>`
- Individual error isolation with try/catch per group
- Standard batch size: 20-50 items
- Sequential processing with detailed logging

**Repository Pattern:**
- `twentyORMGlobalManager.getRepositoryForWorkspace(workspaceId, entityName, { shouldBypassPermissionChecks: true })`
- Bulk operations with `updateMany` for multiple entities
- Permission bypass for system operations
- Automatic event emission for all changes

## Implementation Plan

### Code Organization Principles

**NestJS Separation of Concerns:**
- Follow existing Twenty codebase patterns for service organization
- Each service should have a single, clear responsibility
- Use consistent naming conventions: `virtual-fields-{purpose}.service.ts`
- Follow the flat module structure used in other Twenty modules
- Maintain proper dependency injection patterns

### 1. Dependency Cache Structure

**Cache Integration with WorkspaceCacheStorageService:**
The dependency mapping will use the existing `WorkspaceCacheStorageService` pattern with dedicated methods:
- `setVirtualFieldDependencyMap(workspaceId, metadataVersion, dependencyMap)`
- `getVirtualFieldDependencyMap(workspaceId, metadataVersion)`
- Cache key: `VirtualFieldDependencyMap:${workspaceId}:${metadataVersion}`

**Dependency Mapping Structure:**
The core data structure for dependency tracking follows this pattern:

```json
workspaceId: {
  {
    // Virtual field ID
    "virtualField_XYZ": {
      "dependenciesObjectNameSingular": [
        "calendarEvent", "company"
      ]
    }
  }
}
```

**Concrete Examples:**
```json
{
  "virtualField_company_lastCalendarEventDate": {
    "dependenciesObjectNameSingular": ["calendarEvent", "person", "calendarEventParticipant"]
  },
  "virtualField_company_connectionStrength": {
    "dependenciesObjectNameSingular": ["calendarEvent", "person", "calendarEventParticipant"]
  },
  "virtualField_company_customerTier": {
    "dependenciesObjectNameSingular": ["company"]
  }
}
```

**Key Benefits:**
- Simple flat structure for O(1) dependency lookups
- Clear virtual field to dependencies mapping
- Natural support for self-dependencies (e.g., company → company)
- Integrates with existing cache versioning and invalidation
- Uses established `WorkspaceCacheStorageService` patterns

### 2. Dependency Discovery System

**System Virtual Fields Discovery:**
- Use existing `metadataArgsStorage.filterFields()` pattern
- Scan all workspace entities at startup
- Extract dependencies from `virtualField.path` arrays
- Build dependency map using existing field resolution utilities

**User-Defined Virtual Fields Discovery:**
- Hook into existing metadata sync process
- Scan `FieldMetadata.virtualField` JSONB column
- Support dynamic field creation/updates
- Maintain same caching patterns as system fields

**Dependency Extraction Logic:**
- **Path-Based Fields**: Extract object names from each step in field path by analyzing the relationship chain
- **Conditional Fields**: Include source object for self-dependencies when conditions reference same-object fields
- Use existing `resolveFieldPath()` utility from `PathEvaluatorService` for path analysis
- Leverage `ObjectMetadataMaps` for object name resolution from field IDs

### 3. Enhanced Event Processing

**Fast Event Filtering:**
Modify existing `PreComputedFieldsService.processEventsForComputedFields()`:

1. **Early Dependency Check**: Load cached dependency map for workspace
2. **Object Name Lookup**: Check if `event.objectMetadata.nameSingular` exists in any dependency list
3. **Early Exit**: If no dependencies found, skip processing entirely
4. **Affected Field Identification**: Build list of virtual fields requiring recalculation
5. **Delegate to Existing Pipeline**: Use current batch processing logic for affected fields

**Integration with Existing Flow:**
- Maintain existing `ProcessEventsParams` interface
- Preserve current error isolation patterns
- Keep existing batch processing and logging
- No changes to `EntityEventsToDbListener` or job queue system

**Self-Dependency Handling:**
- Include source object in dependency extraction
- For field-level dependencies (e.g., Company ARR → Company customerTier)
- Check `event.updatedFields` for specific field changes
- Process self-dependencies in same batch as cross-object dependencies

### 4. Initial Calculation System

**Trigger Points:**
- Virtual field creation (new `@WorkspaceField` with `virtualField`)
- Metadata synchronization (user-defined virtual fields)
- Manual recalculation requests

**Implementation Approach:**
1. **Entity Discovery**: Query all entities of target object type using existing repository pattern
2. **Synthetic Event Generation**: Create `ObjectRecordNonDestructiveEvent` for each entity
3. **Batch Processing**: Process through existing computation pipeline in configurable batches
4. **Progress Tracking**: Use existing logging patterns for progress monitoring

**Performance Considerations:**
- Configurable batch size (default: 100 entities per batch)
- Memory-efficient processing with pagination
- Use existing repository patterns with permission bypass
- Leverage existing bulk update mechanisms

### 5. Cache Management Strategy

**Cache Building:**
- **Startup**: Build cache alongside existing `ObjectMetadataMaps` loading
- **Metadata Sync**: Rebuild cache when virtual fields added/modified
- **Version Control**: Use existing `metadataVersion` for cache invalidation

**Cache Invalidation:**
- Follow existing metadata cache invalidation patterns
- Use `flushByPattern()` for workspace-specific cleanup
- Coordinate with existing metadata version bumps

**Performance Optimization:**
- Single cache load per event batch processing
- In-memory cache during batch processing session
- Minimal database queries using existing metadata infrastructure

### 6. Integration Points

**With Existing Event System:**
- No changes to `EntityEventsToDbListener`
- Reuse existing `ProcessPreComputedFieldsJob` infrastructure
- Maintain existing event queuing and batch processing
- Preserve workspace isolation patterns

**With Metadata System:**
- Hook into existing metadata sync workflows
- Use existing `ObjectMetadataMaps` for field resolution
- Leverage existing metadata versioning and caching
- Support both system and custom virtual fields

**With Repository Layer:**
- Use existing `TwentyORMGlobalManager` patterns
- Follow existing permission bypass for system operations
- Maintain existing bulk update and error handling patterns
- Preserve existing event emission for repository operations

**With Caching Infrastructure:**
- Follow existing `WorkspaceCacheStorageService` patterns
- Use established key naming conventions and TTL strategies
- Coordinate with existing metadata cache invalidation
- Maintain workspace isolation in all cache operations

### 7. Error Handling Strategy

**Batch-Level Resilience:**
- Follow existing error isolation patterns from `PreComputedFieldsService`
- Individual virtual field computation errors don't break entire batch
- Comprehensive error logging with field and entity context
- Continue processing remaining fields on individual failures

**Dependency Resolution Errors:**
- Graceful handling of missing dependencies
- Fallback to existing static dependency mechanisms during transition
- Clear error messages for invalid virtual field definitions
- Maintain system stability during dependency cache rebuilds

**Initial Calculation Resilience:**
- Handle partial failures during initial calculation
- Resume capability for interrupted initial calculations
- Progress tracking and recovery mechanisms
- Memory management for large entity sets

### 8. Testing Strategy

**Unit Testing:**
- Dependency extraction from virtual field definitions
- Cache building and invalidation logic
- Event filtering accuracy with dependency maps
- Initial calculation batch processing

**Integration Testing:**
- End-to-end dependency tracking with real virtual fields
- Cross-object dependency chain processing
- Self-dependency scenarios (same-object field changes)
- Cache performance with large virtual field sets

**Performance Testing:**
- Event processing speed with dependency filtering
- Initial calculation performance with large entity sets
- Memory usage during batch processing
- Cache hit/miss ratios and lookup performance

### 9. Migration Strategy

**Backward Compatibility:**
- All existing virtual field definitions continue to work unchanged
- Dynamic dependency extraction replaces any previous static approaches
- No breaking changes to virtual field API or definition structure
- Seamless transition for all existing virtual fields

**Gradual Rollout:**
- Feature flag for new dependency tracking system
- Progressive enablement across workspaces
- Performance monitoring and validation
- Rollback capability if issues arise

**Data Consistency:**
- Validate dependency extraction accuracy from virtual field definitions
- Ensure all existing virtual fields get proper dependency mapping
- Maintain data integrity during system enhancement
- Comprehensive testing of dependency resolution for all field types

### 10. Performance Targets

**Event Processing:**
- Sub-100ms dependency lookup per event batch
- Early exit for 90%+ of events with no virtual field dependencies
- Maintain existing batch processing performance
- Handle 1000+ events per batch efficiently

**Initial Calculation:**
- Complete workspace initialization in under 2 minutes
- Process 100+ entities per batch with configurable sizing
- Memory usage under 500MB during large batch processing
- Graceful handling of workspaces with 10,000+ entities

**Cache Performance:**
- 95%+ cache hit rate for dependency lookups
- Sub-10ms cache access times
- Efficient cache invalidation without performance impact
- Coordinate cache updates with existing metadata patterns

### 11. Success Criteria

**Functional Requirements:**
1. **Automatic Dependency Tracking**: Virtual fields recalculate when dependent entities change
2. **Initial Calculation**: Virtual fields compute when first declared
3. **Self-Dependency Support**: Handle same-object field dependencies
4. **Performance**: No degradation to existing virtual field computation speed
5. **Compatibility**: Full backward compatibility with existing virtual field definitions

**Technical Requirements:**
1. **Code Quality**: Follow existing Twenty codebase patterns and conventions
2. **Separation of Concerns**: Each service has a single, well-defined responsibility
3. **Consistent Caching**: Use the same caching mechanism as existing field metadata
4. **Error Resilience**: Individual failures don't impact system stability
5. **Scalability**: Support workspaces with hundreds of virtual fields
6. **Maintainability**: Clear, simple logic that integrates with existing architecture
7. **Testability**: Comprehensive test coverage for all dependency scenarios

**Implementation Notes:**
- Research existing field metadata caching patterns before implementing dependency cache
- Follow NestJS best practices for service organization and dependency injection
- Maintain flat module structure consistent with other Twenty modules
- Use proper naming conventions with `virtual-fields-` prefix for all services

This implementation plan provides a clear path for adding dependency tracking to Twenty's virtual field system while maintaining the platform's high standards for code quality, performance, and reliability.