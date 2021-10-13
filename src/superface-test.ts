import { PerformError, Result, SuperfaceClient } from '@superfaceai/one-sdk';
import {
  disableNetConnect,
  enableNetConnect,
  load as loadRecording,
  recorder,
  restore as restoreRecordings,
} from 'nock';
import { join as joinPath } from 'path';

import {
  AfterLoadFunction,
  BeforeSaveFunction,
  RecordingProcessFunctions,
} from '.';
import {
  ComponentUndefinedError,
  FixturesPathUndefinedError,
  MapUndefinedError,
  RecordingPathUndefinedError,
  RecordingsNotFoundError,
  UnexpectedError,
} from './common/errors';
import {
  getFixtureName,
  matchWildCard,
  removeTimestamp,
} from './common/format';
import { exists, writeRecordings } from './common/io';
import {
  NockConfig,
  SuperfaceTestConfigPayload,
  SuperfaceTestRun,
  TestingReturn,
} from './superface-test.interfaces';
import {
  assertsDefinitionsAreNotStrings,
  assertsPreparedConfig,
  getProfileId,
  getProviderName,
  getSuperJson,
  isProviderLocal,
  removeSensitiveInformation,
} from './superface-test.utils';

export class SuperfaceTest {
  private sfConfig: SuperfaceTestConfigPayload;
  private nockConfig?: NockConfig;
  private fixturesPath?: string;
  private recordingPath?: string;

  constructor(sfConfig?: SuperfaceTestConfigPayload, nockConfig?: NockConfig) {
    this.sfConfig = sfConfig ?? {};
    this.nockConfig = nockConfig;

    this.setupFixturesPath();
  }

  /**
   * Sets up path to all fixtures.
   */
  private setupFixturesPath(): void {
    const { path } = this.nockConfig ?? {};

    if (this.fixturesPath === undefined) {
      this.fixturesPath = path ?? joinPath(process.cwd(), 'nock');
    }
  }

  /**
   * Sets up path to recording, depends on current Superface configuration.
   */
  private setupRecordingPath(fixtureName: string) {
    if (!this.fixturesPath) {
      throw new FixturesPathUndefinedError();
    }

    this.recordingPath = joinPath(
      this.fixturesPath,
      fixtureName,
      'recording.json'
    );
  }

  /**
   * Tests current configuration whether all necessary components
   * are defined and ready to use and tries to perform entered usecase.
   */
  async run(
    testCase: SuperfaceTestRun,
    hooks?: RecordingProcessFunctions
  ): Promise<TestingReturn> {
    this.prepareSuperfaceConfig(testCase);
    await this.setupSuperfaceConfig();

    assertsPreparedConfig(this.sfConfig);
    if (!(await this.isMapLocal())) {
      throw new MapUndefinedError(
        getProfileId(this.sfConfig.profile),
        getProviderName(this.sfConfig.provider)
      );
    }

    this.setupRecordingPath(getFixtureName(this.sfConfig));

    // parse env variable and check if test should be recorded
    const record = matchWildCard(this.sfConfig, process.env.SUPERFACE_LIVE_API);

    await this.startRecording(record, hooks?.afterRecordingLoad);

    let result: Result<unknown, PerformError>;
    try {
      result = await this.sfConfig.useCase.perform(testCase.input, {
        provider: this.sfConfig.provider,
      });
    } catch (error: unknown) {
      restoreRecordings();

      throw error;
    }

    await this.endRecording(record, hooks?.beforeRecordingSave);

    if (result.isErr()) {
      return { error: removeTimestamp(result.error.toString()) };
    }

    if (result.isOk()) {
      return { value: result.value };
    }

    throw new UnexpectedError('unreachable');
  }

  /**
   * Sets up entered payload to current Superface configuration
   */
  private prepareSuperfaceConfig(payload: SuperfaceTestConfigPayload): void {
    if (payload.client !== undefined) {
      this.sfConfig.client = payload.client;
    }

    if (payload.profile !== undefined) {
      this.sfConfig.profile = payload.profile;
    }

    if (payload.provider !== undefined) {
      this.sfConfig.provider = payload.provider;
    }

    if (payload.useCase !== undefined) {
      this.sfConfig.useCase = payload.useCase;
    }
  }

  /**
   * Sets up current configuration - transforms every component
   * that is represented by string to instance of that corresponding component.
   */
  private async setupSuperfaceConfig(): Promise<void> {
    if (!this.sfConfig.client) {
      this.sfConfig.client = new SuperfaceClient();
    }

    if (typeof this.sfConfig.profile === 'string') {
      this.sfConfig.profile = await this.sfConfig.client.getProfile(
        this.sfConfig.profile
      );
    }

    if (typeof this.sfConfig.provider === 'string') {
      this.sfConfig.provider = await this.sfConfig.client.getProvider(
        this.sfConfig.provider
      );
    }

    if (typeof this.sfConfig.useCase === 'string') {
      if (this.sfConfig.profile === undefined) {
        throw new ComponentUndefinedError('Profile');
      }

      this.sfConfig.useCase = this.sfConfig.profile.getUseCase(
        this.sfConfig.useCase
      );
    }
  }

  /**
   * Checks whether current components in sfConfig
   * are locally linked in super.json.
   */
  private async isMapLocal(): Promise<boolean> {
    const superJson = this.sfConfig.client?.superJson ?? (await getSuperJson());
    const superJsonNormalized = superJson.normalized;

    let profileId: string | undefined;

    if (this.sfConfig.profile !== undefined) {
      profileId = getProfileId(this.sfConfig.profile);
    }

    if (this.sfConfig.provider !== undefined) {
      return isProviderLocal(
        this.sfConfig.provider,
        profileId,
        superJsonNormalized
      );
    }

    return true;
  }

  /**
   * Checks whether nock is configured and
   * starts recording or loads recording file if exists.
   */
  private async startRecording(
    record: boolean,
    afterRecordingLoad?: AfterLoadFunction
  ): Promise<void> {
    if (!this.recordingPath) {
      throw new RecordingPathUndefinedError();
    }

    if (!record) {
      const recordingExists = await exists(this.recordingPath);

      if (!recordingExists) {
        throw new RecordingsNotFoundError();
      }

      assertsPreparedConfig(this.sfConfig);
      const scopes = loadRecording(this.recordingPath);

      if (scopes.length === 0) {
        throw new RecordingsNotFoundError();
      }

      disableNetConnect();

      await removeSensitiveInformation(this.sfConfig, { scopes });

      if (afterRecordingLoad) {
        await afterRecordingLoad(scopes);
      }
    } else {
      const enable_reqheaders_recording =
        this.nockConfig?.enableReqheadersRecording ?? false;

      recorder.rec({
        dont_print: true,
        output_objects: true,
        use_separator: false,
        enable_reqheaders_recording,
      });
    }
  }

  /**
   * Checks if recording started and if yes, it ends recording and
   * saves recording to file specified in nockConfig.
   * Possible to update recordings with property `update`.
   */
  private async endRecording(
    record: boolean,
    beforeRecordingSave?: BeforeSaveFunction
  ): Promise<void> {
    if (!this.recordingPath) {
      throw new RecordingPathUndefinedError();
    }

    if (!record) {
      enableNetConnect();

      return;
    } else {
      assertsPreparedConfig(this.sfConfig);

      const definitions = recorder.play();
      restoreRecordings();

      if (definitions === undefined) {
        return;
      }

      assertsDefinitionsAreNotStrings(definitions);
      await removeSensitiveInformation(this.sfConfig, { definitions });

      if (beforeRecordingSave) {
        await beforeRecordingSave(definitions);
      }

      await writeRecordings(this.recordingPath, definitions);
    }
  }
}
