import {
  ApiKeyPlacement,
  HttpScheme,
  SecurityScheme,
  SecurityType,
} from '@superfaceai/ast';
import { err, SDKExecutionError, SuperJson } from '@superfaceai/one-sdk';
import { define } from 'nock';

import { RecordingDefinition, RecordingDefinitions } from '.';
import {
  ComponentUndefinedError,
  InstanceMissingError,
  SuperJsonLoadingFailedError,
  SuperJsonNotFoundError,
  UnexpectedError,
} from './common/errors';
import {
  getMockedSfConfig,
  getProfileMock,
  getProviderMock,
  getUseCaseMock,
  SuperfaceClientMock,
} from './superface.mock';
import {
  assertsDefinitionsAreNotStrings,
  assertsPreparedConfig,
  getProfileId,
  getProviderName,
  getSuperJson,
  getUseCaseName,
  HIDDEN_CREDENTIALS_PLACEHOLDER,
  isProfileProviderLocal,
  loadCredentials,
  removeCredentials,
} from './superface-test.utils';

describe('SuperfaceTest', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('assertsPreparedConfig', () => {
    describe('throws if configuration has string representation of some component', () => {
      it('profile instance missing', async () => {
        const superface = {
          ...(await getMockedSfConfig()),
          profile: 'some-profile',
        };

        expect(() => {
          assertsPreparedConfig(superface);
        }).toThrowError(new InstanceMissingError('Profile'));
      });

      it('provider instance missing', async () => {
        const superface = {
          ...(await getMockedSfConfig()),
          provider: 'some-provider',
        };

        expect(() => {
          assertsPreparedConfig(superface);
        }).toThrow(new InstanceMissingError('Provider'));
      });

      it('usecase instance missing', async () => {
        const superface = {
          ...(await getMockedSfConfig()),
          useCase: 'some-useCase',
        };

        expect(() => {
          assertsPreparedConfig(superface);
        }).toThrow(new InstanceMissingError('UseCase'));
      });
    });

    describe('throws if configuration has some undefined components', () => {
      it('client missing', () => {
        const superface = {};

        expect(() => {
          assertsPreparedConfig(superface);
        }).toThrowError(new ComponentUndefinedError('Client'));
      });

      it('profile missing', () => {
        const superface = {
          client: new SuperfaceClientMock(),
        };

        expect(() => {
          assertsPreparedConfig(superface);
        }).toThrowError(new ComponentUndefinedError('Profile'));
      });

      it('provider missing', async () => {
        const superface = {
          client: new SuperfaceClientMock(),
          profile: await getProfileMock('profile'),
        };

        expect(() => {
          assertsPreparedConfig(superface);
        }).toThrow(new ComponentUndefinedError('Provider'));
      });

      it('usecase missing', async () => {
        const superface = {
          client: new SuperfaceClientMock(),
          profile: await getProfileMock('profile'),
          provider: await getProviderMock('provider'),
        };

        expect(() => {
          assertsPreparedConfig(superface);
        }).toThrow(new ComponentUndefinedError('UseCase'));
      });
    });

    it('does nothing when every instance is present', async () => {
      const sfConfig = await getMockedSfConfig();

      expect(() => {
        assertsPreparedConfig(sfConfig);
      }).not.toThrow();
    });
  });

  describe('isProfileProviderLocal', () => {
    it('returns false when provider is not local', () => {
      const mockSuperJson = new SuperJson({
        profiles: {
          profile: {
            version: '0.0.1',
            providers: {
              provider: {},
            },
          },
        },
        providers: {
          provider: {
            security: [],
          },
        },
      });

      expect(
        isProfileProviderLocal('provider', 'profile', mockSuperJson.normalized)
      ).toBeFalsy();
    });

    it('returns true when profile provider is local', () => {
      const mockSuperJson = new SuperJson({
        profiles: {
          profile: {
            file: 'some/path/to/profile.supr',
            providers: {
              provider: {
                file: 'some/path/to/map.suma',
              },
            },
          },
        },
        providers: {
          provider: {
            security: [],
          },
        },
      });

      expect(
        isProfileProviderLocal('provider', 'profile', mockSuperJson.normalized)
      ).toBeTruthy();
    });
  });

  describe("get component's name", () => {
    it('returns id when Profile instance is given', async () => {
      const profile = await getProfileMock('profile');

      expect(getProfileId(profile)).toEqual('profile');
    });

    it('returns id when Provider instance is given', async () => {
      const provider = await getProviderMock('provider');

      expect(getProviderName(provider)).toEqual('provider');
    });

    it('returns id when UseCase instance is given', () => {
      const useCase = getUseCaseMock('useCase');

      expect(getUseCaseName(useCase)).toEqual('useCase');
    });
  });

  describe('getSuperJson', () => {
    it('throws when detecting superJson fails', async () => {
      const detectSpy = jest
        .spyOn(SuperJson, 'detectSuperJson')
        .mockResolvedValueOnce(undefined);

      const loadSpy = jest.spyOn(SuperJson, 'load');

      await expect(getSuperJson()).rejects.toThrowError(
        new SuperJsonNotFoundError()
      );

      expect(detectSpy).toHaveBeenCalledTimes(1);
      expect(loadSpy).not.toHaveBeenCalled();
    });

    it('throws when superJson loading fails', async () => {
      const detectSpy = jest
        .spyOn(SuperJson, 'detectSuperJson')
        .mockResolvedValueOnce('.');

      const loadingError = new SDKExecutionError('super.json error', [], []);
      const loadSpy = jest
        .spyOn(SuperJson, 'load')
        .mockResolvedValueOnce(err(loadingError));

      await expect(getSuperJson()).rejects.toThrowError(
        new SuperJsonLoadingFailedError(loadingError)
      );

      expect(detectSpy).toHaveBeenCalledTimes(1);
      expect(loadSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('assertsDefinitionsAreNotStrings', () => {
    it('throws when definitions contains string', () => {
      const defs: RecordingDefinitions | string[] = [
        '{ "scope": "root", "method": "POST", "status": 401 }',
        '{ "scope": "root", "method": "GET", "status": 200 }',
      ];

      expect(() => {
        assertsDefinitionsAreNotStrings(defs);
      }).toThrowError(
        new UnexpectedError('definition is a string, not object')
      );
    });
  });

  describe('loadCredentials', () => {
    describe('when loading apikey', () => {
      it('loads apikey from body', () => {
        const securityScheme: SecurityScheme = {
          id: 'api-key',
          type: SecurityType.APIKEY,
          in: ApiKeyPlacement.BODY,
          name: 'api_key',
        };
        const securityValue = { id: 'api-key', apikey: 'secret' };
        const mockedScopes = define([
          {
            scope: 'https://localhost',
            method: 'GET',
            path: '/path',
            status: 200,
            response: { some: 'data' },
            body: {
              whatever: {
                my_api_key: 'secret',
              },
            },
          },
        ]);

        const filteringBodySpy = jest.spyOn(
          mockedScopes[0],
          'filteringRequestBody'
        );

        loadCredentials({
          scope: mockedScopes[0],
          scheme: securityScheme,
          securityValue,
        });

        expect(filteringBodySpy).toHaveBeenCalledTimes(1);
        expect(filteringBodySpy).toHaveBeenCalledWith(
          /secret/g,
          HIDDEN_CREDENTIALS_PLACEHOLDER
        );
      });

      it('loads apikey from path', () => {
        const securityScheme: SecurityScheme = {
          id: 'api-key',
          type: SecurityType.APIKEY,
          in: ApiKeyPlacement.PATH,
          name: 'api_key',
        };
        const securityValue = { id: 'api-key', apikey: 'secret' };
        const mockedScopes = define([
          {
            scope: 'https://localhost',
            method: 'GET',
            path: '/path/secret',
            status: 200,
            response: { some: 'data' },
          },
        ]);

        const filteringPathSpy = jest.spyOn(mockedScopes[0], 'filteringPath');

        loadCredentials({
          scope: mockedScopes[0],
          scheme: securityScheme,
          securityValue,
        });

        expect(filteringPathSpy).toHaveBeenCalledTimes(1);
        expect(filteringPathSpy).toHaveBeenCalledWith(
          /secret/g,
          HIDDEN_CREDENTIALS_PLACEHOLDER
        );
      });

      it('loads apikey from query', () => {
        const securityScheme: SecurityScheme = {
          id: 'api-key',
          type: SecurityType.APIKEY,
          in: ApiKeyPlacement.QUERY,
          name: 'api_key',
        };
        const securityValue = { id: 'api-key', apikey: 'secret' };
        const mockedScopes = define([
          {
            scope: 'https://localhost',
            method: 'GET',
            path: '/path?api_key=secret',
            status: 200,
            response: { some: 'data' },
          },
        ]);

        const filteringPathSpy = jest.spyOn(mockedScopes[0], 'filteringPath');

        loadCredentials({
          scope: mockedScopes[0],
          scheme: securityScheme,
          securityValue,
        });

        expect(filteringPathSpy).toHaveBeenCalledTimes(1);
        expect(filteringPathSpy).toHaveBeenCalledWith(
          /api_key([^&#]+)/g,
          `api_key=${HIDDEN_CREDENTIALS_PLACEHOLDER}`
        );
      });
    });
  });

  describe('removeCredentials', () => {
    describe('when removing apikey', () => {
      it('removes apikey from header', () => {
        const definition: RecordingDefinition = {
          scope: 'https://localhost',
          path: '/get?text=123',
          method: 'GET',
          status: 200,
          reqheaders: {
            ['api_key']: 'secret',
          },
        };

        removeCredentials({
          definition,
          scheme: {
            id: 'api-key',
            type: SecurityType.APIKEY,
            in: ApiKeyPlacement.HEADER,
            name: 'api_key',
          },
          securityValue: { id: 'api-key', apikey: 'secret' },
          baseUrl: 'https://localhost',
        });

        expect(definition).toEqual({
          scope: 'https://localhost',
          path: '/get?text=123',
          method: 'GET',
          status: 200,
          reqheaders: {
            ['api_key']: HIDDEN_CREDENTIALS_PLACEHOLDER,
          },
        });
      });

      it('removes apikey from body', () => {
        const definition: RecordingDefinition = {
          scope: 'https://localhost',
          path: '/get?text=123',
          method: 'GET',
          status: 200,
          body: {
            my_api_key: 'secret',
          },
        };

        removeCredentials({
          definition,
          scheme: {
            id: 'api-key',
            type: SecurityType.APIKEY,
            in: ApiKeyPlacement.BODY,
            name: 'api_key',
          },
          securityValue: { id: 'api-key', apikey: 'secret' },
          baseUrl: 'https://localhost',
        });

        expect(definition).toEqual({
          scope: 'https://localhost',
          path: '/get?text=123',
          method: 'GET',
          status: 200,
          body: {
            my_api_key: HIDDEN_CREDENTIALS_PLACEHOLDER,
          },
        });
      });

      it('removes apikey from path', () => {
        const definition: RecordingDefinition = {
          scope: 'https://localhost',
          path: '/get/secret?text=123',
          method: 'GET',
          status: 200,
        };

        removeCredentials({
          definition,
          scheme: {
            id: 'api-key',
            type: SecurityType.APIKEY,
            in: ApiKeyPlacement.PATH,
            name: 'api_key',
          },
          securityValue: { id: 'api-key', apikey: 'secret' },
          baseUrl: 'https://localhost',
        });

        expect(definition).toEqual({
          scope: 'https://localhost',
          path: `/get/${HIDDEN_CREDENTIALS_PLACEHOLDER}?text=123`,
          method: 'GET',
          status: 200,
        });
      });

      it('removes apikey from query', () => {
        const definition: RecordingDefinition = {
          scope: 'https://localhost',
          path: '/get?api_key=secret&text=123',
          method: 'GET',
          status: 200,
        };

        removeCredentials({
          definition,
          scheme: {
            id: 'api-key',
            type: SecurityType.APIKEY,
            in: ApiKeyPlacement.QUERY,
            name: 'api_key',
          },
          securityValue: { id: 'api-key', apikey: 'secret' },
          baseUrl: 'https://localhost',
        });

        expect(definition).toEqual({
          scope: 'https://localhost',
          path: `/get?api_key=${HIDDEN_CREDENTIALS_PLACEHOLDER}&text=123`,
          method: 'GET',
          status: 200,
        });
      });
    });

    describe('when removing basic auth credentials', () => {
      it('removes basic token from Authorization header', () => {
        const definition: RecordingDefinition = {
          scope: 'https://localhost',
          path: '/get?text=123',
          method: 'GET',
          status: 200,
          reqheaders: {
            ['Authorization']: 'Basic secret',
          },
        };

        removeCredentials({
          definition,
          scheme: {
            id: 'basic',
            type: SecurityType.HTTP,
            scheme: HttpScheme.BASIC,
          },
          securityValue: { id: 'basic', username: 'user', password: 'pass' },
          baseUrl: 'https://localhost',
        });

        expect(definition).toEqual({
          scope: 'https://localhost',
          path: '/get?text=123',
          method: 'GET',
          status: 200,
          reqheaders: {
            ['Authorization']: `Basic ${HIDDEN_CREDENTIALS_PLACEHOLDER}`,
          },
        });
      });
    });

    describe('when removing bearer token', () => {
      it('removes bearer token from Authorization header', () => {
        const definition: RecordingDefinition = {
          scope: 'https://localhost',
          path: '/get?text=123',
          method: 'GET',
          status: 200,
          reqheaders: {
            ['Authorization']: 'Bearer secret',
          },
        };

        removeCredentials({
          definition,
          scheme: {
            id: 'bearer',
            type: SecurityType.HTTP,
            scheme: HttpScheme.BEARER,
          },
          securityValue: { id: 'bearer', token: 'secret' },
          baseUrl: 'https://localhost',
        });

        expect(definition).toEqual({
          scope: 'https://localhost',
          path: '/get?text=123',
          method: 'GET',
          status: 200,
          reqheaders: {
            ['Authorization']: `Bearer ${HIDDEN_CREDENTIALS_PLACEHOLDER}`,
          },
        });
      });
    });
  });
});
