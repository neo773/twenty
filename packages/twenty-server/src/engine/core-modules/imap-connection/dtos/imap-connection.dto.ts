import { Field, InputType } from '@nestjs/graphql';

import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ConnectedAccountProvider } from 'twenty-shared/types';

@InputType()
export class ValidateImapConnectionInput {
  @Field(() => String)
  @IsNotEmpty()
  @IsUUID()
  workspaceId: string;

  @Field(() => String)
  @IsNotEmpty()
  @IsUUID()
  accountOwnerId: string;

  @Field(() => String)
  @IsNotEmpty()
  @IsString()
  handle: string;

  @Field(() => String)
  @IsNotEmpty()
  @IsEnum(ConnectedAccountProvider)
  provider: ConnectedAccountProvider;

  @Field(() => String)
  @IsNotEmpty()
  @IsString()
  imapServer: string;

  @Field(() => Number)
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  imapPort: number;

  @Field(() => String)
  @IsNotEmpty()
  @IsString()
  imapEncryption: string;

  @Field(() => String)
  @IsNotEmpty()
  @IsString()
  imapPassword: string;
}

@InputType()
export class ImapConnectionInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  id?: string;

  @Field(() => String)
  @IsNotEmpty()
  @IsUUID()
  accountOwnerId: string;

  @Field(() => String)
  @IsNotEmpty()
  @IsString()
  handle: string;

  @Field(() => String)
  @IsNotEmpty()
  @IsString()
  imapServer: string;

  @Field(() => Number)
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  imapPort: number;

  @Field(() => String)
  @IsNotEmpty()
  @IsString()
  imapEncryption: string;

  @Field(() => String)
  @IsNotEmpty()
  @IsString()
  imapPassword: string;
}
