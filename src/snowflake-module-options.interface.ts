import type { ModuleMetadata, Type } from '@nestjs/common';
import type { ConnectionOptions } from 'snowflake-sdk';

export interface SnowflakePoolOptions {
  max?: number;
  min?: number;
  evictionRunIntervalMillis?: number;
  idleTimeoutMillis?: number;
  acquireTimeoutMillis?: number;
}

export interface SnowflakeModuleOptions {
  connection: ConnectionOptions;
  pool?: SnowflakePoolOptions;
  isGlobal?: boolean;
}

export interface SnowflakeModuleOptionsFactory {
  createSnowflakeOptions():
    | Promise<SnowflakeModuleOptions>
    | SnowflakeModuleOptions;
}

export interface SnowflakeModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  isGlobal?: boolean;
  useExisting?: Type<SnowflakeModuleOptionsFactory>;
  useClass?: Type<SnowflakeModuleOptionsFactory>;
  useFactory?: (
    ...args: unknown[]
  ) => Promise<SnowflakeModuleOptions> | SnowflakeModuleOptions;
  inject?: Array<Type<unknown> | string | symbol>;
}
