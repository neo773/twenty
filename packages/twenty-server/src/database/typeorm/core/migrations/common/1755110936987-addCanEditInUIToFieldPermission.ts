import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddCanEditInUIToFieldPermission1755110936987
  implements MigrationInterface
{
  name = 'AddCanEditInUIToFieldPermission1755110936987';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."fieldPermission" ADD "canEditInUI" boolean`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."fieldPermission" DROP COLUMN "canEditInUI"`,
    );
  }
}
