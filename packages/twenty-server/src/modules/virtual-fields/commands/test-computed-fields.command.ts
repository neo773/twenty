import { Logger } from '@nestjs/common';

import { Command, CommandRunner, Option } from 'nest-commander';

import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';
import { WorkspaceCacheStorageService } from 'src/engine/workspace-cache-storage/workspace-cache-storage.service';
import {
    type ConditionalField,
    type PathBasedField,
    type VirtualField,
} from 'src/modules/computed-fields/types/VirtualField';
import { PreComputedFieldsService } from 'src/modules/virtual-fields/services/pre-computed-fields.service';
import { resolveFieldPath } from 'src/modules/virtual-fields/utils/resolve-field-path.util';

interface TestComputedFieldsOptions {
  companyId?: string;
  workspaceId?: string;
}

// Type guards to differentiate between field types
const isPathBasedField = (
  field: VirtualField,
): field is VirtualField & PathBasedField => {
  return 'path' in field;
};

const isConditionalField = (
  field: VirtualField,
): field is VirtualField & ConditionalField => {
  return 'when' in field;
};

@Command({
  name: 'pre-computed-fields:test',
  description:
    'Test computed field calculations for a specific company. Used for development and debugging.',
})
export class TestComputedFieldsCommand extends CommandRunner {
  private readonly logger = new Logger(TestComputedFieldsCommand.name);

  constructor(
    private readonly preComputedFieldsService: PreComputedFieldsService,
    private readonly twentyORMGlobalManager: TwentyORMGlobalManager,
    private readonly workspaceCacheStorageService: WorkspaceCacheStorageService,
  ) {
    super();
  }

  private async getReadableFieldPath(
    field: VirtualField,
    workspaceId: string,
  ): Promise<string> {
    if (!isPathBasedField(field)) {
      return 'N/A (ConditionalField)';
    }

    try {
      const objectMetadataMaps =
        await this.workspaceCacheStorageService.getObjectMetadataMapsOrThrow(
          workspaceId,
        );

      const resolvedPath = resolveFieldPath(field.path, objectMetadataMaps);

      if (resolvedPath) {
        return resolvedPath
          .map((step) => `${step.objectName}.${step.fieldName}`)
          .join(' -> ');
      } else {
        return `UNRESOLVED PATH: ${field.path.join(' -> ')}`;
      }
    } catch (error) {
      return `ERROR RESOLVING PATH: ${field.path.join(' -> ')} (${error.message})`;
    }
  }

  async run(
    passedParam: string[],
    options: TestComputedFieldsOptions,
  ): Promise<void> {
    try {
      // Default company ID
      const COMPANY_ID =
        options.companyId || '20202020-a305-41e7-8c72-ba44072a4c58';

      this.logger.log('🚀 Testing computed fields calculation...');
      this.logger.log(`Company ID: ${COMPANY_ID}`);

      const WORKSPACE_ID = options.workspaceId!;

      this.logger.log(`Workspace ID: ${WORKSPACE_ID}`);
      this.logger.log('---');

      // Get all computed field metadata
      const computedFields =
        this.preComputedFieldsService.getComputedFieldMetadata();

      this.logger.log(`Found ${computedFields.length} computed fields:`);

      for (const field of computedFields) {
        const index = computedFields.indexOf(field);

        this.logger.log(`${index + 1}. ${field.entityName}.${field.fieldName}`);

        // Handle dependencies (now optional)
        if (field.virtualField.dependencies?.length) {
          this.logger.log(
            `   - Dependencies: ${field.virtualField.dependencies.join(', ')}`,
          );
        } else {
          this.logger.log('   - Dependencies: none');
        }

        // Handle different field types
        if (isPathBasedField(field.virtualField)) {
          this.logger.log(`   - Type: PathBased`);
          this.logger.log(
            `   - Raw Path: ${field.virtualField.path.join(' -> ')}`,
          );

          // Resolve readable path
          const readablePath = await this.getReadableFieldPath(
            field.virtualField,
            WORKSPACE_ID,
          );

          this.logger.log(`   - Resolved Path: ${readablePath}`);

          this.logger.log(
            `   - Calculation: ${field.virtualField.calculation}`,
          );
          if (field.virtualField.where) {
            this.logger.log('   - Has WHERE clause: true');
          }
          if (field.virtualField.rankBy) {
            this.logger.log(
              `   - Ranking: ${field.virtualField.rankBy.direction} (limit: ${field.virtualField.rankBy.limit})`,
            );
          }
        } else if (isConditionalField(field.virtualField)) {
          this.logger.log(`   - Type: Conditional`);
          this.logger.log(
            `   - When clauses: ${field.virtualField.when.length}`,
          );
          this.logger.log(`   - Default value: ${field.virtualField.default}`);
        }
      }

      this.logger.log('---');

      // Filter for company-related fields
      const companyFields = computedFields.filter(
        (field) => field.entityName === 'company',
      );

      if (companyFields.length === 0) {
        this.logger.log('❌ No computed fields found for company entity');

        return;
      }

      this.logger.log(`Computing ${companyFields.length} company fields...`);

      // Check if company exists first
      try {
        const companyRepository =
          await this.twentyORMGlobalManager.getRepositoryForWorkspace(
            WORKSPACE_ID,
            'company',
            { shouldBypassPermissionChecks: true },
          );

        const company = await companyRepository.findOne({
          where: { id: COMPANY_ID },
        });

        if (!company) {
          this.logger.error(`❌ Company with ID ${COMPANY_ID} not found`);

          return;
        }

        this.logger.log(
          `✅ Company found: ${company.name || 'Unnamed Company'}`,
        );
      } catch (error) {
        this.logger.error(
          `❌ Error checking company existence: ${error.message}`,
        );

        return;
      }

      // Execute computation for each field
      for (const field of companyFields) {
        this.logger.log(`\n📊 Computing ${field.fieldName}...`);

        // Display field-specific information
        if (isPathBasedField(field.virtualField)) {
          const readablePath = await this.getReadableFieldPath(
            field.virtualField,
            WORKSPACE_ID,
          );

          this.logger.log(`   Field path: ${readablePath}`);
        } else if (isConditionalField(field.virtualField)) {
          this.logger.log(
            `   Conditional field with ${field.virtualField.when.length} conditions`,
          );
        }

        try {
          await this.preComputedFieldsService.executeComputedFieldsForEntity({
            entityId: COMPANY_ID,
            workspaceId: WORKSPACE_ID,
            fieldsToProcess: [field],
          });

          this.logger.log(`✅ Successfully computed ${field.fieldName}`);

          // Try to read the updated value
          try {
            const companyRepository =
              await this.twentyORMGlobalManager.getRepositoryForWorkspace(
                WORKSPACE_ID,
                'company',
                { shouldBypassPermissionChecks: true },
              );

            const company = await companyRepository.findOne({
              where: { id: COMPANY_ID },
            });

            if (company && company[field.fieldName] !== undefined) {
              this.logger.log(
                `   💾 Cached value: ${company[field.fieldName]}`,
              );
            } else {
              this.logger.log(
                `   ⚠️  Field ${field.fieldName} not found in company record`,
              );
            }
          } catch (readError) {
            this.logger.log(
              `   ⚠️  Could not read cached value: ${readError.message}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `❌ Error computing ${field.fieldName}:`,
            error.message,
          );

          // Show more detailed error information
          if (error.message?.includes('missing FROM-clause')) {
            this.logger.error(
              `   💡 This usually indicates an issue with table alias generation in SQL joins`,
            );
          } else if (error.message?.includes('does not exist')) {
            this.logger.error(
              `   💡 This indicates a field reference that doesn't exist in the database schema`,
            );
          } else if (error.message?.includes('Field metadata')) {
            this.logger.error(
              `   💡 This indicates the computed field references a field that's not in the object metadata`,
            );
          }

          if (error.stack) {
            const stackLine = error.stack.split('\n')[1];

            if (stackLine) {
              this.logger.error(`   Stack: ${stackLine}`);
            }
          }
        }
      }

      this.logger.log('\n🎉 Computation test completed!');
    } catch (error) {
      this.logger.error('❌ Command failed:', error);
    }
  }

  @Option({
    flags: '-c, --company-id <companyId>',
    description: 'Company ID to test (defaults to sample ID)',
  })
  parseCompanyId(val: string): string {
    return val;
  }

  @Option({
    flags: '-w, --workspace-id <workspaceId>',
    description: 'Workspace ID (auto-discovered if not provided)',
  })
  parseWorkspaceId(val: string): string {
    return val;
  }
}
