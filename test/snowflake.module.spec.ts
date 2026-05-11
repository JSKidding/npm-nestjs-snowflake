import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';

jest.mock('snowflake-sdk', () => {
  const fakePool = {
    use: jest.fn(),
    acquire: jest.fn(),
    release: jest.fn(),
    drain: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  };
  return {
    __esModule: true,
    createPool: jest.fn().mockReturnValue(fakePool),
    default: { createPool: jest.fn().mockReturnValue(fakePool) },
    __fakePool: fakePool,
  };
});

import * as snowflake from 'snowflake-sdk';
import { SnowflakeModule } from '../src/snowflake.module';
import { SnowflakeService } from '../src/snowflake.service';
import { SNOWFLAKE_POOL } from '../src/snowflake.constants';
import {
  SnowflakeModuleOptions,
  SnowflakeModuleOptionsFactory,
} from '../src/snowflake-module-options.interface';

const createPoolMock = (snowflake as unknown as { createPool: jest.Mock })
  .createPool;

describe('SnowflakeModule', () => {
  beforeEach(() => {
    createPoolMock.mockClear();
  });

  it('forRoot wires up SnowflakeService with a pool from createPool', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        SnowflakeModule.forRoot({
          connection: { account: 'a', username: 'u', password: 'p' },
          pool: { max: 5, min: 1 },
        }),
      ],
    }).compile();

    const service = moduleRef.get(SnowflakeService);
    expect(service).toBeInstanceOf(SnowflakeService);

    expect(createPoolMock).toHaveBeenCalledTimes(1);
    expect(createPoolMock).toHaveBeenCalledWith(
      { account: 'a', username: 'u', password: 'p' },
      { max: 5, min: 1 },
    );

    const pool = moduleRef.get(SNOWFLAKE_POOL);
    expect(pool).toBeDefined();
  });

  it('forRootAsync resolves options via useFactory', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        SnowflakeModule.forRootAsync({
          useFactory: () => ({
            connection: { account: 'async-acct', username: 'u' },
            pool: { max: 10 },
          }),
        }),
      ],
    }).compile();

    expect(moduleRef.get(SnowflakeService)).toBeInstanceOf(SnowflakeService);
    expect(createPoolMock).toHaveBeenCalledWith(
      { account: 'async-acct', username: 'u' },
      { max: 10 },
    );
  });

  it('forRootAsync resolves options via useClass', async () => {
    @Injectable()
    class ConfigFactory implements SnowflakeModuleOptionsFactory {
      createSnowflakeOptions(): SnowflakeModuleOptions {
        return {
          connection: { account: 'class-acct', username: 'u' },
        };
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [
        SnowflakeModule.forRootAsync({
          useClass: ConfigFactory,
        }),
      ],
    }).compile();

    expect(moduleRef.get(SnowflakeService)).toBeInstanceOf(SnowflakeService);
    expect(createPoolMock).toHaveBeenCalledWith(
      { account: 'class-acct', username: 'u' },
      {},
    );
  });

  it('forRootAsync throws when no provider strategy is supplied', () => {
    expect(() => SnowflakeModule.forRootAsync({})).toThrow(
      /useFactory, useClass, useExisting/,
    );
  });
});
