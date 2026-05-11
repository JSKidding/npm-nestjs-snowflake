import { DynamicModule, Module, Provider } from '@nestjs/common';
import * as snowflake from 'snowflake-sdk';
import type { Connection, Pool } from 'snowflake-sdk';
import {
  SNOWFLAKE_MODULE_OPTIONS,
  SNOWFLAKE_POOL,
} from './snowflake.constants';
import {
  SnowflakeModuleAsyncOptions,
  SnowflakeModuleOptions,
  SnowflakeModuleOptionsFactory,
} from './snowflake-module-options.interface';
import { SnowflakeService } from './snowflake.service';

@Module({})
export class SnowflakeModule {
  static forRoot(options: SnowflakeModuleOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: SNOWFLAKE_MODULE_OPTIONS,
      useValue: options,
    };

    return {
      module: SnowflakeModule,
      global: options.isGlobal ?? false,
      providers: [optionsProvider, poolProvider, SnowflakeService],
      exports: [SnowflakeService, SNOWFLAKE_POOL],
    };
  }

  static forRootAsync(options: SnowflakeModuleAsyncOptions): DynamicModule {
    return {
      module: SnowflakeModule,
      global: options.isGlobal ?? false,
      imports: options.imports ?? [],
      providers: [
        ...createAsyncOptionsProviders(options),
        poolProvider,
        SnowflakeService,
      ],
      exports: [SnowflakeService, SNOWFLAKE_POOL],
    };
  }
}

const poolProvider: Provider = {
  provide: SNOWFLAKE_POOL,
  inject: [SNOWFLAKE_MODULE_OPTIONS],
  useFactory: (options: SnowflakeModuleOptions): Pool<Connection> => {
    return snowflake.createPool(options.connection, options.pool ?? {});
  },
};

function createAsyncOptionsProviders(
  options: SnowflakeModuleAsyncOptions,
): Provider[] {
  if (options.useFactory) {
    return [
      {
        provide: SNOWFLAKE_MODULE_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject ?? [],
      },
    ];
  }

  const useClassOrExisting = options.useClass ?? options.useExisting;
  if (!useClassOrExisting) {
    throw new Error(
      'SnowflakeModule.forRootAsync requires one of: useFactory, useClass, useExisting',
    );
  }

  const optionsProvider: Provider = {
    provide: SNOWFLAKE_MODULE_OPTIONS,
    useFactory: (factory: SnowflakeModuleOptionsFactory) =>
      factory.createSnowflakeOptions(),
    inject: [useClassOrExisting],
  };

  if (options.useExisting) {
    return [optionsProvider];
  }

  return [
    optionsProvider,
    {
      provide: options.useClass!,
      useClass: options.useClass!,
    },
  ];
}
