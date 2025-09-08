import { Module } from '@nestjs/common';

import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import { TestComputedFieldsCommand } from 'src/modules/virtual-fields/commands/test-computed-fields.command';
import { VirtualFieldsExpressionEvaluatorService } from 'src/modules/virtual-fields/services/expression-evaluator.service';
import { VirtualFieldsPathEvaluatorService } from 'src/modules/virtual-fields/services/path-evaluator.service';
import { PreComputedFieldsService } from 'src/modules/virtual-fields/services/pre-computed-fields.service';

@Module({
  imports: [TwentyORMModule, WorkspaceCacheStorageModule],
  providers: [
    TestComputedFieldsCommand,
    PreComputedFieldsService,
    VirtualFieldsExpressionEvaluatorService,
    VirtualFieldsPathEvaluatorService,
  ],
})
export class PreComputedFieldsCommandsModule {}
