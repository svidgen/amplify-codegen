import { nspawn as spawn, getCLIPath, singleSelect } from '..';

type AmplifyConfiguration = {
  accessKeyId: string;
  secretAccessKey: string;
  profileName?: string;
  region?: string;
};

const defaultSettings = {
  profileName: 'amplify-integ-test-user',
  region: 'us-east-2',
  userName: '\r',
};

const defaultProjectSettings = {
  name: '\r',
  envName: 'integtest',
  editor: '\r',
  frontendType: 'javascript',
  framework: 'none',
  srcDir: '\r',
  distDir: '\r',
  buildCmd: '\r',
  startCmd: '\r',
};

/**
 * Supported regions:
 * - All Amplify regions, as reported https://docs.aws.amazon.com/general/latest/gr/amplify.html
 *
 * NOTE:
 * - The list is used to configure correct region in Amplify profile as env var $CLI_REGION
 * - The list much be in the same order as 'amplify configure' regions selection dropdown
 * - 'ap-east-1' is not included in the list due to known discrepancy in Amplify CLI 'configure' command dropdown and supported regions
 *
 * The list of supported regions must be kept in sync amongst all of:
 * - Amplify CLI 'amplify configure' command regions dropdown
 * - the internal pipeline that publishes new lambda layer versions
 * - amplify-codegen/scripts/e2e-test-regions.json
 * - amplify-codegen/scripts/split-canary-tests.ts
 * - amplify-codegen/scripts/split-e2e-tests.ts
 */
export const amplifyRegions = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-north-1',
  "eu-south-1",
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-northeast-3',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-south-1',
  'ca-central-1',
  'me-south-1',
  'sa-east-1',
];

const configurationOptions = ['Project information', 'AWS Profile setting', 'Advanced: Container-based deployments'];
const profileOptions = ['No', 'Update AWS Profile', 'Remove AWS Profile'];
const authenticationOptions = ['AWS profile', 'AWS access keys'];
const javaScriptFrameworkList = [ 'none', 'angular', 'ember', 'ionic', 'react', 'react-native', 'vue' ];


const MANDATORY_PARAMS = ['accessKeyId', 'secretAccessKey', 'region'];

export function amplifyConfigure(settings: AmplifyConfiguration): Promise<void> {
  const s = { ...defaultSettings, ...settings };
  const missingParam = MANDATORY_PARAMS.filter((p) => !Object.keys(s).includes(p));
  if (missingParam.length) {
    throw new Error(`mandatory params ${missingParam.join(' ')} are missing`);
  }

  const chain = spawn(getCLIPath(), ['configure'], { stripColors: true })
    .wait('Sign in to your AWS administrator account:')
    .wait('Press Enter to continue')
    .sendCarriageReturn()
    .wait('Specify the AWS Region');

  singleSelect(chain, s.region, amplifyRegions);

  return chain
    .wait('Press Enter to continue')
    .sendCarriageReturn()
    .wait('accessKeyId')
    .pauseRecording()
    .sendLine(s.accessKeyId)
    .wait('secretAccessKey')
    .sendLine(s.secretAccessKey)
    .resumeRecording()
    .wait('Profile Name:')
    .sendLine(s.profileName)
    .wait('Successfully set up the new user.')
    .runAsync();
}

export function amplifyConfigureProject(settings: {
  cwd: string;
  enableContainers?: boolean;
  configLevel?: string;
  profileOption?: string;
  authenticationOption?: string;
  region?: string;
}): Promise<void> {
  const {
    cwd,
    enableContainers = false,
    profileOption = profileOptions[0],
    authenticationOption,
    configLevel = 'project',
    region = defaultSettings.region,
  } = settings;

  return new Promise((resolve, reject) => {
    const chain = spawn(getCLIPath(), ['configure', 'project'], { cwd, stripColors: true }).wait('Which setting do you want to configure?');

    if (enableContainers) {
      singleSelect(chain, configurationOptions[2], configurationOptions);
      chain.wait('Do you want to enable container-based deployments?').sendConfirmYes();
    } else {
      singleSelect(chain, configurationOptions[1], configurationOptions);

      if (configLevel === 'project') {
        chain.wait('Do you want to update or remove the project level AWS profile?');
        singleSelect(chain, profileOption, profileOptions);
      } else {
        chain.wait('Do you want to set the project level configuration').sendConfirmYes();
      }

      if (profileOption === profileOptions[1] || configLevel === 'general') {
        chain.wait('Select the authentication method you want to use:');
        singleSelect(chain, authenticationOption, authenticationOptions);

        if (authenticationOption === authenticationOptions[0]) {
          chain.wait('Please choose the profile you want to use').sendCarriageReturn(); // Default profile
        } else if (authenticationOption === authenticationOptions[1]) {
          chain.wait('accessKeyId:').sendLine(process.env.AWS_ACCESS_KEY_ID);
          chain.wait('secretAccessKey:').sendLine(process.env.AWS_SECRET_ACCESS_KEY);
          chain.wait('region:');
          singleSelect(chain, region, amplifyRegions);
        }
      }
    }

    chain.wait('Successfully made configuration changes to your project.').run((err: Error) => {
      if (!err) {
        resolve();
      } else {
        reject(err);
      }
    });
  });
}

export function amplifyConfigureProjectInfo(settings: {
  cwd: string,
  frontendType: string,
}): Promise<void> {
  const {
    cwd,
  } = settings;
  const s = { ...defaultProjectSettings, ...settings };
  return new Promise((resolve, reject) => {
    const chain = spawn(getCLIPath(), ['configure', 'project'], { cwd, stripColors: true }).wait('Which setting do you want to configure?');
    singleSelect(chain, configurationOptions[0], configurationOptions);
    chain
      .wait('Enter a name for the project')
      .sendLine(s.name)
      .wait('Choose your default editor:')
      .sendLine(s.editor)
      .wait("Choose the type of app that you're building")
      .sendLine(s.frontendType);

    switch (s.frontendType) {
      case 'javascript':
        chain.wait('What javascript framework are you using');
        singleSelect(chain, s.framework, javaScriptFrameworkList);
        chain
          .wait('Source Directory Path:')
          .sendLine(s.srcDir)
          .wait('Distribution Directory Path:')
          .sendLine(s.distDir)
          .wait('Build Command:')
          .sendLine(s.buildCmd)
          .wait('Start Command:')
          .sendLine(s.startCmd);
        break;
      case 'android':
        chain
          .wait('Where is your Res directory')
          .sendLine(s.srcDir);
        break;
      case 'ios':
        break;
      case 'flutter':
        chain
          .wait('Where do you want to store your configuration file?')
          .sendLine(s.srcDir);
        break;
      default:
        throw new Error(`Frontend type ${s.frontendType} is not supported.`);
    }

    chain
      .wait('Successfully made configuration changes to your project.')
      .run((err: Error) => {
        if (!err) {
          resolve();
        } else {
          reject(err);
        }
      });
  })
}