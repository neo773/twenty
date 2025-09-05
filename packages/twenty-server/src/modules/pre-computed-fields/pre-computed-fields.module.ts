import { Module } from '@nestjs/common';

import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';

import { ProcessPreComputedFieldsJob } from './jobs/process-pre-computed-fields.job';
import { ExpressionEvaluatorService } from './services/expression-evaluator.service';
import { PathEvaluatorService } from './services/path-evaluator.service';
import { PreComputedFieldsService } from './services/pre-computed-fields.service';

@Module({
  imports: [TwentyORMModule, WorkspaceCacheStorageModule],
  providers: [
    PreComputedFieldsService,
    ExpressionEvaluatorService,
    PathEvaluatorService,

    ProcessPreComputedFieldsJob,
  ],
  exports: [
    PreComputedFieldsService,
    ExpressionEvaluatorService,
    PathEvaluatorService,
  ],
})
export class PreComputedFieldsModule {}
