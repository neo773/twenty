import { Module } from '@nestjs/common';

import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import { TestComputedFieldsCommand } from 'src/modules/pre-computed-fields/commands/test-computed-fields.command';
import { ExpressionEvaluatorService } from 'src/modules/pre-computed-fields/services/expression-evaluator.service';
import { PathEvaluatorService } from 'src/modules/pre-computed-fields/services/path-evaluator.service';
import { PreComputedFieldsService } from 'src/modules/pre-computed-fields/services/pre-computed-fields.service';

@Module({
  imports: [TwentyORMModule, WorkspaceCacheStorageModule],
  providers: [
    TestComputedFieldsCommand,
    PreComputedFieldsService,
    ExpressionEvaluatorService,
    PathEvaluatorService,
  ],
})
export class PreComputedFieldsCommandsModule {}
