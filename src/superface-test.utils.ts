import {
  NormalizedSuperJsonDocument,
  SecurityScheme,
  SecurityValues,
} from '@superfaceai/ast';
import {
  BoundProfileProvider,
  Profile,
  Provider,
  SuperfaceClient,
  SuperJson,
  UnexpectedError,
  UseCase,
} from '@superfaceai/one-sdk';
import { join as joinPath } from 'path';

import {
  CompleteSuperfaceTestConfig,
  RecordingDefinition,
  RecordingScope,
  SuperfaceTestConfigPayload,
} from '.';
import {
  ComponentUndefinedError,
  InstanceMissingError,
  SuperJsonLoadingFailedError,
  SuperJsonNotFoundError,
} from './common/errors';
import {
  loadCredentialsToScope,
  loadParamsToScope,
  removeCredentialsFromDefinition,
  removeParamsFromDefinition,
} from './nock.utils';

/**
 * Asserts that entered sfConfig contains every component and
 * that every component is instance of corresponding class not string.
 */
export function assertsPreparedConfig(
  sfConfig: SuperfaceTestConfigPayload
): asserts sfConfig is CompleteSuperfaceTestConfig {
  assertsPreparedClient(sfConfig.client);
  assertsPreparedProfile(sfConfig.profile);
  assertsPreparedProvider(sfConfig.provider);
  assertsPreparedUseCase(sfConfig.useCase);
}

export function assertsPreparedClient(
  client: SuperfaceClient | undefined
): asserts client is SuperfaceClient {
  if (client === undefined) {
    throw new ComponentUndefinedError('Client');
  }
}

export function assertsPreparedProfile(
  profile: Profile | string | undefined
): asserts profile is Profile {
  if (profile === undefined) {
    throw new ComponentUndefinedError('Profile');
  }

  if (typeof profile === 'string') {
    throw new InstanceMissingError('Profile');
  }
}

export function assertsPreparedProvider(
  provider: Provider | string | undefined
): asserts provider is Provider {
  if (provider === undefined) {
    throw new ComponentUndefinedError('Provider');
  }

  if (typeof provider === 'string') {
    throw new InstanceMissingError('Provider');
  }
}

export function assertsPreparedUseCase(
  useCase: UseCase | string | undefined
): asserts useCase is UseCase {
  if (useCase === undefined) {
    throw new ComponentUndefinedError('UseCase');
  }

  if (typeof useCase === 'string') {
    throw new InstanceMissingError('UseCase');
  }
}

export function assertBoundProfileProvider(
  boundProfileProvider: BoundProfileProvider | undefined
): asserts boundProfileProvider is BoundProfileProvider {
  if (boundProfileProvider === undefined) {
    throw new ComponentUndefinedError('BoundProfileProvider');
  }
}

/**
 * Checks whether provider is local and contains some file path.
 */
export function isProfileProviderLocal(
  provider: Provider | string,
  profileId: string,
  superJsonNormalized: NormalizedSuperJsonDocument
): boolean {
  const providerId = getProviderName(provider);
  const targetedProfileProvider =
    superJsonNormalized.profiles[profileId].providers[providerId];

  if (!('file' in targetedProfileProvider)) {
    return false;
  }

  return true;
}

/**
 * Returns profile id if entered profile is either instance of Profile or string
 */
export function getProfileId(profile: Profile | string): string {
  if (typeof profile === 'string') {
    return profile;
  } else {
    return profile.configuration.id;
  }
}

/**
 * Returns provider id if entered provider is either instance of Provider or string
 */
export function getProviderName(provider: Provider | string): string {
  if (typeof provider === 'string') {
    return provider;
  } else {
    return provider.configuration.name;
  }
}

/**
 * Returns usecase name if entered usecase is either instance of UseCase or string
 */
export function getUseCaseName(useCase: UseCase | string): string {
  if (typeof useCase === 'string') {
    return useCase;
  } else {
    return useCase.name;
  }
}

/**
 * Returns SuperJson based on path detected with its abstract method.
 */
export async function getSuperJson(): Promise<SuperJson> {
  const superPath = await SuperJson.detectSuperJson(process.cwd(), 3);

  if (superPath === undefined) {
    throw new SuperJsonNotFoundError();
  }

  const superJsonResult = await SuperJson.load(
    joinPath(superPath, 'super.json')
  );

  if (superJsonResult.isErr()) {
    throw new SuperJsonLoadingFailedError(superJsonResult.error);
  }

  return superJsonResult.value;
}

export function assertsDefinitionsAreNotStrings(
  definitions: string[] | RecordingDefinition[]
): asserts definitions is RecordingDefinition[] {
  for (const def of definitions) {
    if (typeof def === 'string') {
      throw new UnexpectedError('definition is a string, not object');
    }
  }
}

export function loadCredentials({
  securitySchemes,
  securityValues,
  scopes,
  integrationParameters,
}: {
  securitySchemes: SecurityScheme[];
  securityValues: SecurityValues[];
  scopes: RecordingScope[];
  integrationParameters?: Record<string, string>;
}): void {
  for (const scope of scopes) {
    loadParamsToScope(scope, integrationParameters);

    for (const scheme of securitySchemes) {
      const securityValue = securityValues.find(val => val.id === scheme.id);

      loadCredentialsToScope({
        scope,
        scheme,
        securityValue,
      });
    }
  }
}

export function removeCredentials({
  securitySchemes,
  securityValues,
  baseUrl,
  definitions,
  integrationParameters,
}: {
  securitySchemes: SecurityScheme[];
  securityValues: SecurityValues[];
  baseUrl: string;
  definitions: RecordingDefinition[];
  integrationParameters?: Record<string, string>;
}): void {
  for (const definition of definitions) {
    removeParamsFromDefinition(definition, integrationParameters, baseUrl);

    for (const scheme of securitySchemes) {
      const securityValue = securityValues.find(val => val.id === scheme.id);

      removeCredentialsFromDefinition({
        definition,
        scheme,
        baseUrl,
        securityValue,
      });
    }
  }
}
