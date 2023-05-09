import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import figlet from "figlet";
import { Command, OptionValues } from "commander";
import { select, confirm, input } from "@inquirer/prompts";
import chalk from "chalk";
import ora, { Ora } from "ora";
import njwt from "njwt";
import secureRandom from "secure-random";
import { readFile, writeFile, appendFile } from "fs/promises";
import randomWords from "random-words";
// Create cli program helper and options
const program = new Command();
program
  .version("0.0.1")
  .description("Deploy Supbase to Fly.io")
  .option("-O, --org  [value]", "Fly.io Target Organization")
  .option("-y, --yes", "Skip prompts and deploy")
  .option("-r, --region [value]", "Fly.io Target Region")
  .option("--dbUrl [value]", "Fly.io Target Region")
  .parse(process.argv);
const options = program.opts();

// Cool CLI font when starting CLI tool
console.log(figlet.textSync("Supa", "Larry 3D"));
console.log(figlet.textSync("Based", "Larry 3D"));

// Globally available info variable
let globalInfo: cliInfo = {
  username: "",
  defaultRegion: "",
  organization: "",
  jwtTokens: {
    anonToken: "",
    serviceToken: "",
  },
  pgMeta: {
    ipv6: "",
  },
  pgRest: {
    ipv6: "",
  },
  pgAuth: {
    ipv6: "",
  },
  database: {
    ipv6: "",
  },
  kong: {
    ipv6: "",
    publicUrl: "",
  },
  studio: {
    ipv6: "",
    publicUrl: "",
  },
};

main();

// Deploy supabase starter kit to fly.io
async function main() {
  // check if fly cli is authenticated
  await flyAuth();

  // generate service and anon tokens
  generateSupaJWTs();

  // chose default region if not passed in
  await flySetDefaultRegion();

  // set default org if passed in
  await flySetDefaultOrg();

  // turn our info object into default fly args
  const defaultArgs = getDefaultFlyArgs(globalInfo);

  // deploy database
  await flyDeployAndPrepareDB(defaultArgs);

  // deploy api
  await deployPGMeta(defaultArgs);

  // deploy postGREST
  await deployPGREST(defaultArgs);

  await deployAuth(defaultArgs);

  await deployCleanUp();

  await deployKong(defaultArgs);

  await apiGatewayTest();

  await deployStudio(defaultArgs);

  await studioTest();
}

// ---------------------------------------------
// You are enterning function forest
// Proceed with caution
// ---------------------------------------------
// Create default cli args like org and region to make life easier
function getDefaultFlyArgs(args: cliInfo) {
  let argsArray = ["--force-machines", "--auto-confirm"];
  if (args.organization) {
    argsArray.push("--org", args.organization);
  }
  if (args.defaultRegion) {
    argsArray.push("--region", args.defaultRegion);
  }
  return argsArray;
}

async function userAuth(options: OptionValues, spinner: Ora) {
  let username = await whoami();
  if (!username) {
    // async shell cmd
    await flyLogin();
    username = await whoami();
  } else if (!options.yes) {
    spinner.stop();
    const resp = await confirm({
      message: `You are logged into Fly.io as: ${username}. Do you want to continue?`,
      default: true,
    });
    if (!resp) {
      await flyLogin();
      username = await whoami();
    }
  }
  return username;
}

async function flyLogin() {
  const flyLoginSpawn = spawn("fly", ["auth", "login"]);
  return await execAsync(flyLoginSpawn);
}

async function whoami() {
  const whoamiSpawn = spawn("fly", ["auth", "whoami"]);
  return await execAsync(whoamiSpawn);
}

async function choseDefaultRegions() {
  let options = [
    {
      city: "",
      code: "",
    },
  ];
  const regionsSpawn = spawn("fly", ["platform", "regions"]);
  const regions = await execAsync(regionsSpawn);
  const regionChoices = regions.split("\n").slice(1);
  for (let i = 0; i < regionChoices.length; i++) {
    const infoArray = regionChoices[i].split(`\t`);
    if (infoArray[1] && infoArray[0]) {
      options.push({
        city: infoArray[1],
        code: infoArray[0].trim(),
      });
    }
  }
  options = options.filter((o) => o.city !== "");
  return await select({
    message: "Select a default region",
    choices: options.map((o) => {
      return {
        name: o.city + " " + o.code,
        value: o.code,
      };
    }),
  });
}

// Fly io specific functions
//Deploying postgres-meta
async function deployPGMeta(userDefaultArgs: string[]) {
  let metaName;
  if (!options.yes) {
    metaName = await input({
      message:
        "Enter a name for your postgres metadata instance, or leave blank for a generated one",
    });
  }
  const metaSpinner = ora({
    text: "Deploying metadata",
    color: "yellow",
  }).start();
  // if we dont have a name passed in, we need to generate one
  const nameCommands = metaName ? ["--name", metaName] : ["--generate-name"];
  await updatePGMetaDockerFilePGHost(
    "../pg-meta/Dockerfile",
    globalInfo.database.ipv6
  );
  // create array of commands
  const metalaunchCommandArray = ["launch"].concat(
    launchDefaultArgs,
    userDefaultArgs,
    nameCommands
  );

  // run fly launch --no-deploy to allocate app
  globalInfo.pgMeta.ipv6 = await flyLaunchDeployInternalIPV6(
    metalaunchCommandArray,
    "../pg-meta"
  );
  metaSpinner.stop();
  console.log(chalk.green("Metadata deployed"));
  return;
}

async function updateFlyDBRoles(path: string) {
  const psqlCommand1 = `psql postgres://supabase_admin:password@localhost:5432/postgres -c "ALTER ROLE authenticator WITH PASSWORD 'password';"`;
  const psqlCommand2 = `psql postgres://supabase_admin:password@localhost:5432/postgres -c "ALTER ROLE supabase_auth_admin WITH PASSWORD 'password';"`;
  const flyProcess1 = spawn(
    "fly",
    ["ssh", "console", "--command", psqlCommand1],
    {
      cwd: path,
    }
  );
  const flyProcess2 = spawn(
    "fly",
    ["ssh", "console", "--command", psqlCommand2],
    {
      cwd: path,
    }
  );
  await execAsync(flyProcess1);
  await execAsync(flyProcess2);
}
async function deployStudio(userDefaultArgs: string[]) {
  let studioName;
  if (!options.yes) {
    studioName = await input({
      message:
        "Enter a name for your Supabase Studio instance, or leave blank for a generated one",
    });
  }
  const studioSpinner = ora({
    text: "Deploying Supabase Studio",
    color: "yellow",
  }).start();
  // if we dont have a name passed in, we need to generate one
  const nameCommands = studioName
    ? ["--name", studioName]
    : ["--generate-name"];
  // create array of commands
  const studioLaunchCommandArray = ["launch"].concat(
    launchDefaultArgs,
    userDefaultArgs,
    nameCommands
  );

  const secrets = {
    DEFAULT_PROJECT_NAME: "SupaFly",
    SUPABASE_PUBLIC_URL: `https://${globalInfo.kong.publicUrl}.fly.dev`,
    STUDIO_PG_META_URL: `https://${globalInfo.kong.publicUrl}.fly.dev/pg`,
    SUPABASE_ANON_KEY: globalInfo.jwtTokens.anonToken,
    SUPABASE_SERVICE_KEY: globalInfo.jwtTokens.serviceToken,
    SENTRY_IGNORE_API_RESOLUTION_ERROR: 1,
    DEFAULT_ORGANIZATION_NAME: "SupaFly Starter Project",
    POSTGRES_PASSWORD: "password",
    LOGFLARE_URL: "https://api.logflare.app/logs",
    LOGFLARE_API_KEY: "2321",
    NEXT_PUBLIC_SITE_URL: "http://localhost:300",
    NEXT_PUBLIC_GOTRUE_URL: `https://${globalInfo.kong.publicUrl}.fly.dev/auth/v1`,
    NEXT_PUBLIC_HCAPTCHA_SITE_KEY: "10000000-ffff-ffff-ffff-000000000001",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: globalInfo.jwtTokens.anonToken,
    NEXT_PUBLIC_SUPABASE_URL: `https://${globalInfo.kong.publicUrl}.fly.dev`,
  };
  globalInfo.kong.ipv6 = await flyLaunchDeployInternalIPV6(
    studioLaunchCommandArray,
    "../studio",
    secrets
  );

  await allocatePublicIPs("../studio");

  studioSpinner.stop();
  console.log(chalk.green("Supabase Studio deployed"));
}

async function deployKong(userDefaultArgs: string[]) {
  let kongName;
  if (!options.yes) {
    kongName = await input({
      message:
        "Enter a name for your Kong instance, or leave blank for a generated one",
    });
  }
  const kongSpinner = ora({
    text: "Deploying Kong",
    color: "yellow",
  }).start();
  // if we dont have a name passed in, we need to generate one
  const nameCommands = kongName ? ["--name", kongName] : ["--generate-name"];

  // create array of commands
  const kongLaunchCommandArray = ["launch"].concat(
    launchDefaultArgs,
    userDefaultArgs,
    nameCommands
  );
  // run fly launch --no-deploy to allocate app

  await createkongYaml();
  globalInfo.kong.ipv6 = await flyLaunchDeployInternalIPV6(
    kongLaunchCommandArray,
    "../kong"
  );
  await allocatePublicIPs("../kong");
  kongSpinner.stop();
  console.log(chalk.green("Kong deployed"));
  return;
}
//Deploying postgresT
async function deployPGREST(userDefaultArgs: string[]) {
  await updateFlyDBRoles("../../packages/database");
  let postgrestName;
  if (!options.yes) {
    postgrestName = await input({
      message:
        "Enter a name for your postgREST instance, or leave blank for a generated one",
    });
  }
  const pgRestSpinner = ora({
    text: "Deploying postgREST",
    color: "yellow",
  }).start();
  // if we dont have a name passed in, we need to generate one
  const nameCommands = postgrestName
    ? ["--name", postgrestName]
    : ["--generate-name"];

  // create array of commands
  const pgLaunchCommandArray = ["launch"].concat(
    launchDefaultArgs,
    userDefaultArgs,
    nameCommands
  );

  // create secrets
  const secrets = {
    PGRST_DB_URI: `postgres://authenticator:password@[${globalInfo.database.ipv6}]:5432/postgres`,
    PGRST_DB_ANON_ROLE: "anon",
    PGRST_DB_USE_LEGACY_GUCS: "false",
    PGRST_DB_SCHEMAS: "public,storage,graphql_public",
    PGRST_JWT_SECRET: globalInfo.jwtTokens.JWT_SECRET,
  };

  // run fly launch --no-deploy to allocate app
  globalInfo.pgRest.ipv6 = await flyLaunchDeployInternalIPV6(
    pgLaunchCommandArray,
    "../pg-rest",
    secrets
  );
  await allocatePublicIPs("../pg-rest");
  globalInfo.pgRest.name = await getNameFromFlyStatus("../pg-rest");
  pgRestSpinner.stop();
  console.log(chalk.green("PostgREST deployed"));
  return;
}

async function deployAuth(userDefaultArgs: string[]) {
  let authName;
  if (!options.yes) {
    authName = await input({
      message:
        "Enter a name for your auth instance, or leave blank for a generated one",
    });
  }
  const authSpinner = ora({
    text: "Deploying auth",
    color: "yellow",
  }).start();
  // if we dont have a name passed in, we need to generate one
  const nameCommands = authName ? ["--name", authName] : ["--generate-name"];

  // create array of commands
  const authLaunchCommandArray = ["launch"].concat(
    launchDefaultArgs,
    userDefaultArgs,
    nameCommands
  );
  // run fly launch --no-deploy to allocate app
  globalInfo.pgAuth.ipv6 = await flyLaunchDeployInternalIPV6(
    authLaunchCommandArray,
    "../auth"
  );
  const secrets = {
    PROJECT_ID: `supabased-${randomWords(1)}-${randomWords(1)}`,
    AUTH_EXTERNAL_GITHUB: "true",
    AUTH_SITE_URL: "https://example.com",
    GOTRUE_JWT_EXP: "86400",
    GOTRUE_API_PORT: 9999,
    GOTRUE_API_HOST: "fly-local-6pn",
    GOTRUE_DB_DRIVER: "postgres",
    GOTRUE_JWT_SECRET: globalInfo.jwtTokens.JWT_SECRET,
    GOTRUE_DISABLE_SIGNUP: "false",
    GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
    ENABLE_DOUBLE_CONFIRM: "false",
    GOTRUE_MAILER_AUTOCONFIRM: "false",
    GOTRUE_JWT_ADMIN_ROLES: "service_role",
    GOTRUE_JWT_AUD: "authenticated",
    GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
    API_EXTERNAL_URL: "https://example.com",
    GOTRUE_SITE_URL: "https://example.com",
    GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:password@${
      "[" + globalInfo.database.ipv6 + "]"
    }:5432/postgres`,
  };

  await setFlySecrets(secrets, "../auth");
  authSpinner.stop();
  console.log(chalk.green("Auth deployed"));
  return;
}

async function setFlySecrets(secrets: any, path: string) {
  const args = Object.entries(secrets).map(([key, value]) => `${key}=${value}`);

  const child = spawn("fly", ["secrets", "set", ...args], { cwd: path });

  return await execAsync(child);
}
async function deployCleanUp() {
  if (!globalInfo.pgRest.ipv6) {
    globalInfo.pgRest.name = await getNameFromFlyStatus("../pg-rest");
  }
  if (!globalInfo.pgAuth.ipv6) {
    globalInfo.pgAuth.ipv6 = await getInternalIPV6Address("../pg-meta");
  }
  if (!globalInfo.pgMeta.ipv6) {
    globalInfo.pgMeta.ipv6 = await getInternalIPV6Address("../pg-meta");
  }
}
async function deployDatabase(userDefaultArgs: string[]) {
  let dbName;
  const dbPath = "../../packages/database";
  if (!options.yes) {
    dbName = await input({
      message:
        "Enter a name for your database, or leave blank for a generated one",
    });
  }
  // if we dont have a name passed in, we need to generate one
  const nameCommands = dbName ? ["--name", dbName] : ["--generate-name"];

  // create array of commands
  const launchCommandArray = ["launch", "--internal-port", "5432"].concat(
    launchDefaultArgs,
    userDefaultArgs,
    nameCommands
  );

  // run fly launch --no-deploy to allocate app
  const dbLaunch = spawn("fly", launchCommandArray, {
    cwd: dbPath,
  });
  await execAsync(dbLaunch);
  await allocatePrivateIPV6(dbPath);
  await createFlyVolume(dbPath);
  await flyDeploy(dbPath);
  await scaleMemoryFly(dbPath, 1024);
  // wait 2 seconds for the database to start
  setTimeout(() => {}, 2500);
  setTimeout(() => {}, 2000);
  return await getInternalIPV6Address(dbPath);
}

async function createFlyVolume(path: string) {
  const command = "fly";
  const args = [
    "volumes",
    "create",
    "pg_data",
    "--region",
    "lax",
    "--size",
    "3",
  ];

  const flyProcess = spawn(command, args, {
    cwd: path,
  });
  await execAsync(flyProcess);
}

async function scaleMemoryFly(path: string, memory: number) {
  const machine = spawn("fly", ["scale", "memory", memory.toString()], {
    cwd: path,
  });

  await execAsync(machine);
}

async function execAsync(spawn: ChildProcessWithoutNullStreams) {
  let response = "";
  spawn.on("error", (err) => {
    console.log(`error: ${err.message}`);
  });

  spawn.stderr.on("error", (data) => {
    console.log(`stderr: ${data}`);
  });

  for await (const data of spawn.stdout) {
    response += data.toString();
  }
  return response;
}
async function execAsyncLog(spawn: ChildProcessWithoutNullStreams) {
  let response = "";
  spawn.on("error", (err) => {
    console.log(`error: ${err.message}`);
  });

  spawn.stderr.on("error", (data) => {
    console.log(`stderr: ${data}`);
  });

  for await (const data of spawn.stdout) {
    console.log(data.toString());
    response += data.toString();
  }
  return response;
}

async function flyAuth() {
  const authSpinner = ora({
    text: `Checking fly cli authorization...`,
    color: "yellow",
  }).start();

  // grab username
  globalInfo.username = await userAuth(options, authSpinner);
  authSpinner.stop();
  console.log("Deploying to fly.io as:", chalk.green(globalInfo.username));
}

async function flyLaunchDeployInternalIPV6(
  launchCommandArray: string[],
  path: string,
  secrets?: any
) {
  // run fly launch --no-deploy to allocate app
  const launchCommand = spawn("fly", launchCommandArray, {
    cwd: path,
  });
  await execAsync(launchCommand);
  await allocatePrivateIPV6(path);
  if (secrets) {
    await setFlySecrets(secrets, path);
  }
  await flyDeploy(path);
  setTimeout(() => {}, 2000);
  return await getInternalIPV6Address(path);
}

async function flySetDefaultRegion() {
  // chose default region if not passed in
  globalInfo.defaultRegion = options.region
    ? options.region
    : await choseDefaultRegions();
  console.log("Deploying to region:", chalk.green(globalInfo.defaultRegion));
}

async function flySetDefaultOrg() {
  // TODO: Prompt them with a list or orgs
  globalInfo.organization = options.org ?? "personal";
  console.log(
    "Deploying to organization:",
    chalk.green(globalInfo.organization)
  );
}

async function flyDeployAndPrepareDB(defaultArgs: string[]) {
  if (!options.dbUrl) {
    const dbSpinner = ora({
      text: `Deploying your database...`,
      color: "yellow",
    }).start();
    // deploy database
    globalInfo.database.ipv6 = await deployDatabase(defaultArgs);
    dbSpinner.stop();
    console.log(chalk.green("You successfully deployed your database!"));
  }
}

async function allocatePublicIPs(path: string) {
  const ips4 = spawn("fly", ["ips", "allocate-v4", "--shared"], {
    cwd: path,
  });
  const ips6 = spawn("fly", ["ips", "allocate-v6"], {
    cwd: path,
  });
  await execAsync(ips6);
  return await execAsync(ips4);
}
async function allocatePrivateIPV6(path: string) {
  const ips = spawn("fly", ["ips", "allocate-v6", "--private"], {
    cwd: path,
  });

  return await execAsync(ips);
}

async function getNameFromFlyStatus(path: string) {
  const flyStatus = spawn("fly", ["status"], {
    cwd: path,
  });
  const result = await execAsync(flyStatus);
  const regex = /Name\s+=\s+(\S+)/;
  const res = result.match(regex);
  if (res) {
    return res[1];
  } else {
    console.error("Name not found: ", path);
    console.error(result);
  }
}

async function flyDeploy(path: string) {
  const flyDeploy = spawn("fly", ["deploy"], {
    cwd: path,
  });
  return await execAsync(flyDeploy);
}

async function getInternalIPV6Address(projPath: string) {
  const copyHostFile = spawn(
    "fly",
    ["ssh", "console", "--command", "cat etc/hosts"],
    {
      cwd: projPath,
    }
  );
  const result = await execAsync(copyHostFile);
  // Extract the IPv6 address before "fly-local-6pn"
  const match = result.match(/([0-9a-fA-F:]+)\s+fly-local-6pn/);
  let ipv6 = "";
  if (match) {
    ipv6 = match[1];
  }
  return ipv6;
}

async function updatePGMetaDockerFilePGHost(
  filePath: string,
  newInternalAddress: string
) {
  try {
    const data = await readFile(filePath, "utf8");

    const regex = /PG_META_DB_HOST=".*"/g;
    const newContent = data.replace(
      regex,
      `PG_META_DB_HOST="[${newInternalAddress}]"`
    );

    await writeFile(filePath, newContent, "utf8");
  } catch (err) {
    console.error(err);
  }
}

async function apiGatewayTest() {
  globalInfo.kong.publicUrl = (await getNameFromFlyStatus("../kong")) ?? "";
  const link = `https://${globalInfo.kong.publicUrl}.fly.dev/test`;
  console.log(
    "Click this link to test your Supabase deployment:",
    chalk.green(link)
  );
}
async function studioTest() {
  globalInfo.studio.publicUrl = (await getNameFromFlyStatus("../studio")) ?? "";
  const studioLink = `https://${globalInfo.studio.publicUrl}.fly.dev`;
  console.log(
    "Click this link to visir your Supabase studio:",
    chalk.green(studioLink)
  );
}

function generateSupaJWTs() {
  var signingKey = secureRandom(256, { type: "Buffer" });
  const anonClaims = {
    role: "anon",
    iss: "supabase",
  };
  const serviceClaims = {
    role: "service_role",
    iss: "supabase",
  };

  globalInfo.jwtTokens.anonToken = njwt
    .create(anonClaims, signingKey)
    .compact();
  globalInfo.jwtTokens.serviceToken = njwt
    .create(serviceClaims, signingKey)
    .compact();
  globalInfo.jwtTokens.JWT_SECRET = signingKey.toString("hex");

  return;
}

async function createkongYaml() {
  const kongYaml = `_format_version: '1.1'

###
### Consumers / Users
###
consumers:
- username: anon
  keyauth_credentials:
    - key: ${globalInfo.jwtTokens.anonToken}
- username: service_role
  keyauth_credentials:
    - key: ${globalInfo.jwtTokens.serviceToken}

###
### Access Control List
###
acls:
- consumer: anon
  group: anon
- consumer: service_role
  group: admin

###
### API Routes
###
services:
## Open Auth routes
- name: test
  url: https://kongtest.nick-prim.workers.dev/
  routes:
    - name: test
      strip_path: true
      paths:
        - /test
  plugins:
    - name: cors
- name: auth-v1-open
  host: "[${globalInfo.pgAuth.ipv6}]"
  port: 9999
  routes:
    - name: auth-v1-open
      strip_path: true
      paths:
        - /auth/v1/verify
  plugins:
    - name: cors
- name: auth-v1-open-callback
  host: "[${globalInfo.pgAuth.ipv6}]"
  port: 9999
  routes:
    - name: auth-v1-open-callback
      strip_path: true
      paths:
        - /auth/v1/callback
  plugins:
    - name: cors
- name: auth-v1-open-authorize
  host: "[${globalInfo.pgAuth.ipv6}]"
  port: 9999
  routes:
    - name: auth-v1-open-authorize
      strip_path: true
      paths:
        - /auth/v1/authorize
  plugins:
    - name: cors

## Secure Auth routes
- name: auth-v1
  host: "[${globalInfo.pgAuth.ipv6}]"
  port: 9999
  routes:
    - name: auth-v1-all
      strip_path: true
      paths:
        - /auth/v1/
  plugins:
    - name: cors
    - name: key-auth
      config:
        hide_credentials: false
    - name: acl
      config:
        hide_groups_header: true
        allow:
          - admin
          - anon

## Secure REST routes
- name: rest-v1
  url: "https://${globalInfo.pgRest.name}.fly.dev/"
  routes:
    - name: rest-v1-all
      strip_path: true
      paths:
        - /rest/v1/
  plugins:
    - name: cors
    - name: key-auth
      config:
        hide_credentials: true
    - name: acl
      config:
        hide_groups_header: true
        allow:
          - admin
          - anon
## Secure Database routes
- name: meta
  host: "[${globalInfo.pgMeta.ipv6}]"
  port: 8080
  routes:
    - name: meta-all
      strip_path: true
      paths:
        - /pg/

  `;
  await writeFile("../kong/kong.yml", kongYaml, "utf8");
  return;
}

const launchDefaultArgs = [
  "--no-deploy",
  "--copy-config",
  "--reuse-app",
  "--force-machines",
];

type cliInfo = {
  username: string;
  defaultRegion: string;
  organization: string;
  pgMeta: serviceInfo;
  pgRest: serviceInfo;
  jwtTokens: {
    anonToken: string;
    serviceToken: string;
    JWT_SECRET?: string;
  };
  pgAuth: serviceInfo;
  database: serviceInfo & {
    hostname?: string;
    port?: string;
    username?: string;
    password?: string;
    databaseName?: string;
  };
  studio: {
    ipv6: string;
    publicUrl: string;
  };
  kong: {
    ipv6: string;
    publicUrl: string;
  };
};

type serviceInfo = {
  name?: string;
  ipv6: string;
};
