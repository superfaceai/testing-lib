import {
  MapDocumentNode,
  ProfileDocumentNode,
  SecurityValues,
} from '@superfaceai/ast';
import {
  BoundProfileProvider,
  PerformError,
  Profile,
  ProfileConfiguration,
  Provider,
  ProviderConfiguration,
  Result,
  SecurityScheme,
  SuperfaceClient,
  SuperJson,
  UseCase,
} from '@superfaceai/one-sdk';

/* eslint-disable @typescript-eslint/no-unsafe-return */

const defaultMockedSuperJson = new SuperJson({
  profiles: {},
  providers: {},
});

interface UseCaseOptions {
  isOk?: boolean;
  isErr?: boolean;
  result?: Result<unknown, PerformError>;
}

export const getUseCaseMock = jest.fn<
  Promise<UseCase>,
  Parameters<(name: string, options?: UseCaseOptions) => Promise<UseCase>>
>(async (name: string, options?: UseCaseOptions) => ({
  ...Object.create(UseCase.prototype),
  perform: jest.fn().mockResolvedValue({
    isOk:
      options?.isOk !== undefined
        ? jest.fn().mockResolvedValue(options.isOk)
        : jest.fn(),
    isErr:
      options?.isErr !== undefined
        ? jest.fn().mockResolvedValue(options.isErr)
        : jest.fn(),
    unwrap: options?.result?.unwrap ?? jest.fn(),
    value: options?.result?.isOk() && options.result.value,
    error: options?.result?.isErr() && options.result.error,
  }),
  name,
}));

export interface ProfileOptions {
  version?: string;
  cacheKey?: string;
}

export const getProfileMock = jest.fn<
  Promise<Profile>,
  Parameters<(profileId: string, options?: ProfileOptions) => Promise<Profile>>
>(async (profileId: string, options?: ProfileOptions) => ({
  ...Object.create(Profile.prototype),
  client: jest.createMockFromModule<SuperfaceClient>(
    '@superfaceai/one-sdk/dist/client/client'
  ),
  configuration: {
    id: profileId ?? 'profile',
    version: options?.version ?? '1.0.0',
    cacheKey: options?.cacheKey ?? '',
  },
  getUseCase: getUseCaseMock,
}));

export interface ProviderOptions {
  securityValues?: SecurityValues;
}

export const getProviderMock = jest.fn<
  Promise<Provider>,
  Parameters<
    (providerName: string, options?: ProviderOptions) => Promise<Provider>
  >
>(async (providerName: string, options?: ProviderOptions) => ({
  ...Object.create(Provider.prototype),
  configuration: {
    name: providerName,
    security: options?.securityValues ?? [],
  },
}));

export interface BoundProfileProviderOptions {
  profileAst?: ProfileDocumentNode;
  mapAst?: MapDocumentNode;
  providerName?: string;
  configuration?: {
    baseUrl: string;
    securitySchemes?: SecurityScheme[];
  };
}

export const cacheBoundProfileProviderMock = jest.fn<
  Promise<BoundProfileProvider>,
  Parameters<
    (
      profileConfig: ProfileConfiguration,
      providerConfig: ProviderConfiguration,
      options?: BoundProfileProviderOptions
    ) => Promise<BoundProfileProvider>
  >
>(
  async (
    _profileConfig: ProfileConfiguration,
    _providerConfig: ProviderConfiguration,
    options?: BoundProfileProviderOptions
  ) => ({
    ...Object.create(BoundProfileProvider.prototype),
    profileAst: options?.profileAst ?? {},
    mapAst: options?.mapAst ?? {},
    providerName: options?.providerName ?? 'provider',
    configuration: {
      baseUrl: options?.configuration?.baseUrl ?? 'https://base.url',
      security: options?.configuration?.securitySchemes ?? [],
    },
  })
);

export interface SuperfaceClientOptions {
  superJson?: SuperJson;
}

export const SuperfaceClientMock = jest.fn<
  SuperfaceClient,
  Parameters<(options?: SuperfaceClientOptions) => SuperfaceClient>
>((options?: SuperfaceClientOptions) => ({
  ...Object.create(SuperfaceClient.prototype),
  superJson: options?.superJson ?? defaultMockedSuperJson,
  getProfile: getProfileMock,
  getProvider: getProviderMock,
  cacheBoundProfileProvider: cacheBoundProfileProviderMock,
}));
