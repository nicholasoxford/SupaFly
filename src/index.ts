#! /usr/bin/env node

import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import figlet from "figlet";
import { Command } from "commander";
import { select, confirm, input } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import njwt from "njwt";
import secureRandom from "secure-random";
import { readFile, writeFile } from "fs/promises";
import { generate } from "random-words";

// Create cli program helper and options
const program = new Command();
program
  .version("0.0.1")
  .description("🚀 Deploy Supabase to Fly.io 🌐")
  .option("-d, --dir [value]", "📁 Specify the directory for deployment")
  .option("-O, --org  [value]", "🎯 Fly.io Target Organization")
  .option("-r, --region [value]", "🌍 Fly.io Target Region")
  .option("--dbUrl [value]", "🔗 Existing Database URL")
  .option("-y, --yes", "✅ Skip prompts and deploy")
  .parse(process.argv);
const options = program.opts<cliInput>();

// Globally available info variable
let global: GlobalInfo = {
  username: "",
  defaultRegion: options.region ?? "",
  organization: options.org ?? "",
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
    name: "",
  },
  kong: {
    ipv6: "",
    publicUrl: "",
  },
  studio: {
    ipv6: "",
    publicUrl: "",
  },
  defaultArgs: [],
  directory: options.dir ?? "",
  dbPath: "src/database",
  pgRestPath: "src/pg-rest",
  authPath: "src/auth",
  studioPath: "src/studio",
  kongPath: "src/kong",
  metaPath: "src/pg-meta",
  yes: Boolean(options.yes),
  FLY_API_TOKEN: "",
};

main();

// Deploy supabase starter kit to fly.io
async function main() {
  // Cool CLI font when starting CLI tool
  console.log(figlet.textSync("Supa", "Larry 3D"));
  console.log(figlet.textSync("Fly", "Larry 3D"));

  // check if fly cli is authenticated
  await flyAuth();

  await createDirectories();

  // chose default region if not passed in
  await flySetDefaultRegion();

  // set default org if passed in
  await flySetDefaultOrg();

  // turn our info object into default fly args
  setDefaultFlyArgs();

  // deploy database
  await flyDeployAndPrepareDB();

  // deploy api
  await deployPGMeta();

  // deploy postGREST
  await deployPGREST();

  // generate service and anon tokens
  generateSupaJWTs();

  await deployAuth();

  await deployCleanUp();

  await deployKong();

  await apiGatewayTest();

  await deployStudio();

  await studioTest();
}

async function flyAuth() {
  const authSpinner = ora({
    text: `Checking fly cli authorization...`,
    color: "yellow",
  }).start();
  let username = await whoami();
  if (!username) {
    // async shell cmd
    authSpinner.stop();
    await flyLogin();
    username = await whoami();
  }

  // grab username
  authSpinner.stop();

  // confirm user wants to continue
  const resp = await confirm({
    message: `You are logged into Fly.io as: ${username}. Do you want to continue?`,
    default: true,
  });

  // if they want to login
  if (!resp) {
    await flyLogin();
    username = await whoami();
  }

  // if we still dont have a username, exit
  if (!username) {
    console.error(
      chalk.red("You must be logged into fly.io to deploy Supabase")
    );
    process.exit(1);
  }
  global.username = username;
  getFlyApiToken();
  console.log("Deploying to fly.io as:", chalk.green(global.username));
}

async function getFlyApiToken() {
  // call fly auth token
  // set global variable
  const tokenCommand = spawn("fly", ["auth", "token"]);
  const token = await execAsync(tokenCommand);
  global.FLY_API_TOKEN = token;
}

// Create default cli args like org and region to make life easier
function setDefaultFlyArgs() {
  let argsArray = ["--force-machines", "--auto-confirm"];
  global.defaultArgs = argsArray;
  return;
}

async function flyLogin() {
  const flyLoginSpawn = spawn("fly", ["auth", "login"]);
  return await execAsync(flyLoginSpawn);
}

/**
 *
 * @returns username or email of the currently logged in fly user
 */
async function whoami() {
  const whoamiSpawn = spawn("fly", ["auth", "whoami"]);
  return await execAsync(whoamiSpawn);
}

// Fly io specific functions
//Deploying postgres-meta
async function deployPGMeta() {
  let metaName;
  if (!global.yes) {
    metaName = await input({
      message:
        "Enter a name for your postgres metadata instance, or leave blank for a generated one",
    });
  }

  // git clone https://github.com/supabase/postgres-meta
  const gitClone = spawn("git", [
    "clone",
    "https://github.com/supabase/postgres-meta",
    "./pg-meta",
  ]);
  await execAsyncLog(gitClone);

  const metaSpinner = ora({
    text: "Creating an application Fly.io's region ${globalInfo.defaultRegion} to host your PG metadata server",
    color: "blue",
  }).start();

  // if we dont have a name passed in, we need to generate one
  const nameCommands = metaName ? ["--name", metaName] : ["--generate-name"];
  const dockerFilePath = global.metaPath + "/Dockerfile";
  await updatePGMetaDockerFilePGHost(dockerFilePath, global.database.ipv6);

  metaSpinner.stop();
  const deploySpinner = ora({
    text: "Deploying postgres metadata server to Fly.io",
    color: "yellow",
  }).start();

  // create array of commands
  const metalaunchCommandArray = ["launch"].concat(
    launchDefaultArgs,
    global.defaultArgs,
    nameCommands
  );

  // run fly launch --no-deploy to allocate app
  global.pgMeta.ipv6 = await flyLaunchDeployInternalIPV6(
    metalaunchCommandArray,
    global.metaPath
  );
  deploySpinner.stop();
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
async function deployStudio() {
  let studioName;
  if (!global.yes) {
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
    global.defaultArgs,
    nameCommands
  );

  const secrets = {
    DEFAULT_PROJECT_NAME: "SupaFly",
    SUPABASE_PUBLIC_URL: `https://${global.kong.publicUrl}.fly.dev`,
    SUPABASE_URL: `https://${global.kong.publicUrl}.fly.dev/`,
    STUDIO_PG_META_URL: `https://${global.kong.publicUrl}.fly.dev/pg`,
    SUPABASE_ANON_KEY: global.jwtTokens.anonToken,
    SUPABASE_SERVICE_KEY: global.jwtTokens.serviceToken,
    SENTRY_IGNORE_API_RESOLUTION_ERROR: 1,
    DEFAULT_ORGANIZATION_NAME: "SupaFly Starter Project",
    POSTGRES_PASSWORD: "password",
    LOGFLARE_URL: "https://api.logflare.app/logs",
    LOGFLARE_API_KEY: "2321",
    NEXT_PUBLIC_SITE_URL: "http://localhost:300",
    NEXT_PUBLIC_GOTRUE_URL: `https://${global.kong.publicUrl}.fly.dev/auth/v1`,
    NEXT_PUBLIC_HCAPTCHA_SITE_KEY: "10000000-ffff-ffff-ffff-000000000001",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: global.jwtTokens.anonToken,
    NEXT_PUBLIC_SUPABASE_URL: `https://${global.kong.publicUrl}.fly.dev`,
  };
  global.kong.ipv6 = await flyLaunchDeployInternalIPV6(
    studioLaunchCommandArray,
    global.studioPath,
    secrets
  );

  await allocatePublicIPs(global.studioPath);

  studioSpinner.stop();
  console.log(chalk.green("Supabase Studio deployed"));
}

async function deployKong() {
  let kongName;
  if (!global.yes) {
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
    global.defaultArgs,
    nameCommands
  );
  // run fly launch --no-deploy to allocate app

  await createkongYaml();
  global.kong.ipv6 = await flyLaunchDeployInternalIPV6(
    kongLaunchCommandArray,
    global.kongPath
  );
  await allocatePublicIPs(global.kongPath);
  kongSpinner.stop();
  console.log(chalk.green("Kong deployed"));
  return;
}
//Deploying postgresT
async function deployPGREST() {
  await updateFlyDBRoles(global.dbPath);
  let postgrestName;
  if (!global.yes) {
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
    global.defaultArgs,
    nameCommands
  );

  // create secrets
  const secrets = {
    PGRST_DB_URI: `postgres://authenticator:password@[${global.database.ipv6}]:5432/postgres`,
    PGRST_DB_ANON_ROLE: "anon",
    PGRST_DB_USE_LEGACY_GUCS: "false",
    PGRST_DB_SCHEMAS: "public,storage,graphql_public",
    PGRST_JWT_SECRET: global.jwtTokens.JWT_SECRET,
  };

  // run fly launch --no-deploy to allocate app
  global.pgRest.ipv6 = await flyLaunchDeployInternalIPV6(
    pgLaunchCommandArray,
    global.pgRestPath,
    secrets
  );
  await allocatePublicIPs(global.pgRestPath);
  global.pgRest.name = await getNameFromFlyStatus(global.pgRestPath);
  pgRestSpinner.stop();
  console.log(chalk.green("PostgREST deployed"));
  return;
}

async function deployAuth() {
  let authName;
  if (!global.yes) {
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
    global.defaultArgs,
    nameCommands
  );
  // run fly launch --no-deploy to allocate app
  global.pgAuth.ipv6 = await flyLaunchDeployInternalIPV6(
    authLaunchCommandArray,
    global.authPath
  );
  const secrets = {
    PROJECT_ID: `supafly-${generate(1)}-${generate(1)}`,
    AUTH_EXTERNAL_GITHUB: "true",
    AUTH_SITE_URL: "https://example.com",
    GOTRUE_JWT_EXP: "86400",
    GOTRUE_API_PORT: 9999,
    GOTRUE_API_HOST: "fly-local-6pn",
    GOTRUE_DB_DRIVER: "postgres",
    GOTRUE_JWT_SECRET: global.jwtTokens.JWT_SECRET,
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
      "[" + global.database.ipv6 + "]"
    }:5432/postgres`,
  };

  await setFlySecrets(secrets, global.authPath);
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
  if (!global.pgRest.ipv6) {
    global.pgRest.name = await getNameFromFlyStatus(global.pgRestPath);
  }
  if (!global.pgAuth.ipv6) {
    global.pgAuth.ipv6 = await getInternalIPV6Address(global.authPath);
  }
  if (!global.pgMeta.ipv6) {
    global.pgMeta.ipv6 = await getInternalIPV6Address(global.metaPath);
  }
}
async function deployDatabase() {
  // If they passed in yes, we need to generate a name
  if (!global.yes) {
    global.database.name = await input({
      message:
        "Enter a name for your database, or leave blank for a generated one",
    });
  }

  const dbSpinner = ora({
    text: `Creating an application Fly.io's region ${global.defaultRegion} to host your database`,
    color: "blue",
  }).start();

  // if we dont have a name passed in, we need to generate one
  const nameCommands = global.database.name
    ? ["--name", global.database.name]
    : ["--generate-name"];

  // create array of commands
  const launchCommandArray = ["launch", "--internal-port", "5432"].concat(
    launchDefaultArgs,
    global.defaultArgs,
    nameCommands
  );
  // i want to get the path of where stuff is being executed right now

  // run fly launch --no-deploy to allocate app
  const dbLaunch = spawn("fly", launchCommandArray, {
    cwd: global.dbPath,
  });
  await execAsync(dbLaunch);

  dbSpinner.stop();
  const ipv6Spinner = ora({
    text: "Allocating private ipv6 address for your database",
    color: "yellow",
  }).start();

  await allocatePrivateIPV6(global.dbPath);

  ipv6Spinner.stop();
  const volumeSpinner = ora({
    text: "Creating a volume for your database",
    color: "yellow",
  }).start();

  await createFlyVolume(global.dbPath);

  volumeSpinner.stop();
  const scaleSpinner = ora({
    text: "Scaling your database to 1GB of memory and deploying to Fly.io 👟",
    color: "yellow",
  }).start();

  await flyDeploy(global.dbPath, [
    "--vm-memory",
    "1024",
    "--volume-initial-size",
    "3",
  ]);

  scaleSpinner.stop();
  const dbStatusSpinner = ora({
    text: "Waiting for your database to start",
    color: "yellow",
  }).start();

  // wait 2 seconds for the database to start
  setTimeout(() => {}, 2500);
  setTimeout(() => {}, 2000);
  dbStatusSpinner.stop();
}

async function createFlyVolume(path: string) {
  const command = "fly";
  const args = [
    "volumes",
    "create",
    "pg_data",
    "--region",
    global.defaultRegion,
    "--size",
    "3",
    "-n",
    "2",
  ];

  const flyProcess = spawn(command, args, {
    cwd: path,
  });
  await execAsync(flyProcess);
}

/**
 * @description Executes a child process and returns the response from stdout
 * @param spawn
 */
async function execAsync(spawn: ChildProcessWithoutNullStreams) {
  let response = "";
  spawn.on("error", (err) => {
    console.log(`error: ${err.message}`);
  });

  spawn.stderr.on("error", (data) => {
    console.log(`stderr: ${data}`);
  });

  spawn.on("error", (err) => {
    console.error(`error message: ${err}`);
    throw err; // Throw the error to propagate it to the caller
  });
  spawn.on("exit", (code, signal) => {
    if (code !== 0) {
      console.error(
        `child process exited with code ${code} and signal ${signal}`
      );
    }
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
    response += data.toString();
  }
  return response;
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

async function createDirectories() {
  if (!global.directory) {
    const directoryAction = await select({
      message: "Save or delete Dockerfiles and fly configuration files?",
      choices: [
        {
          name: "📁 Create a permanent directory for Dockerfile and fly.toml",
          value: "create",
        },
        {
          name: chalk.red(
            "🗑️  Delete all Dockerfiles and fly configuration files after deployment"
          ),
          value: "delete",
        },
      ],
      default: "create",
    });
    if (directoryAction === "create") {
      global.directory = await input({
        message: "Enter a name for your directory",
        default: "supafly",
      });
    } else if (directoryAction === "delete") {
      global.directory = "./temp-supafly";
    }

    // make directory with name global.directory
    const mkdir = spawn("mkdir", [global.directory]);
    await execAsync(mkdir);
  }
}

async function copyFilesToDirectory() {
  // mkdir for auth, database, kong, pg-rest, studio, and pg-meta
  const mkdirAuthPromise = execAsync(
    spawn("mkdir", [global.directory + "/auth"])
  );
  const mkdirDatabasePromise = execAsync(
    spawn("mkdir", [global.directory + "/database"])
  );
  const mkdirKongPromise = execAsync(
    spawn("mkdir", [global.directory + "/kong"])
  );
  const mkdirPgRestPromise = execAsync(
    spawn("mkdir", [global.directory + "/pg-rest"])
  );
  const mkdirStudioPromise = execAsync(
    spawn("mkdir", [global.directory + "/studio"])
  );
  const mkdirPgMetaPromise = execAsync(
    spawn("mkdir", [global.directory + "/pg-meta"])
  );
  await Promise.all([
    mkdirAuthPromise,
    mkdirDatabasePromise,
    mkdirKongPromise,
    mkdirPgRestPromise,
    mkdirStudioPromise,
    mkdirPgMetaPromise,
  ]);

  // copy files to directory
  const cpAuthPromise = execAsync(
    spawn("cp", ["./src/auth/*", global.directory + "/auth"])
  );
  const cpDatabasePromise = execAsync(
    spawn("cp", ["./src/database/*", global.directory + "/database"])
  );
  const cpKongPromise = execAsync(
    spawn("cp", ["./src/kong/*", global.directory + "/kong"])
  );
  const cpPgRestPromise = execAsync(
    spawn("cp", ["./src/pg-rest/*", global.directory + "/pg-rest"])
  );
  const cpStudioPromise = execAsync(
    spawn("cp", ["./src/studio/*", global.directory + "/studio"])
  );

  await Promise.all([
    cpAuthPromise,
    cpDatabasePromise,
    cpKongPromise,
    cpPgRestPromise,
    cpStudioPromise,
  ]);
}

async function flySetDefaultRegion() {
  // if no region is passed in as an option, we need to prompt them
  if (!global.defaultRegion) {
    let regionOptions = [
      {
        city: "",
        code: "",
      },
    ];

    // Cal fly io to get list of regions
    const regionsSpawn = spawn("fly", ["platform", "regions"]);
    const regionChoices = (await execAsync(regionsSpawn)).split("\n").slice(1);
    for (let i = 0; i < regionChoices.length; i++) {
      const infoArray = regionChoices[i].split(`\t`);
      if (infoArray[1] && infoArray[0]) {
        regionOptions.push({
          city: infoArray[0].trim(),
          code: infoArray[1].trim(),
        });
      }
    }

    // filter out the empty values
    regionOptions = regionOptions.filter((o) => o.city !== "");

    // prompt the user to select a region
    global.defaultRegion = await select({
      message: "Select a default region",
      choices: regionOptions.map((o) => {
        return {
          name: o.city + " - " + o.code,
          value: o.code,
        };
      }),
    });
  }
  console.log("Deploying to region:", chalk.green(global.defaultRegion));
}

async function flySetDefaultOrg() {
  // TODO: Prompt them with a list or orgs
  global.organization = options.org ?? "personal";
  console.log("Deploying to organization:", chalk.green(global.organization));
}

async function flyDeployAndPrepareDB() {
  if (!options.dbUrl) {
    // deploy database
    await deployDatabase();
    const dbStatusSpinner = ora({
      text: "getting database ipv6 address",
      color: "yellow",
    }).start();
    global.database.ipv6 = await getInternalIPV6Address(global.dbPath);
    dbStatusSpinner.stop();
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

async function flyDeploy(path: string, args: string[] = []) {
  const commands = ["deploy"].concat(args);
  const flyDeploy = spawn("fly", commands, {
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
  global.kong.publicUrl = (await getNameFromFlyStatus(global.kongPath)) ?? "";
  const link = `https://${global.kong.publicUrl}.fly.dev/test`;
  console.log(
    "Click this link to test your Supabase deployment:",
    chalk.green(link)
  );
}
async function studioTest() {
  global.studio.publicUrl =
    (await getNameFromFlyStatus(global.studioPath)) ?? "";
  const studioLink = `https://${global.studio.publicUrl}.fly.dev`;
  console.log(
    "Click this link to visit your Supabase studio:",
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

  global.jwtTokens.anonToken = njwt.create(anonClaims, signingKey).compact();
  global.jwtTokens.serviceToken = njwt
    .create(serviceClaims, signingKey)
    .compact();
  global.jwtTokens.JWT_SECRET = signingKey.toString("hex");

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
    - key: ${global.jwtTokens.anonToken}
- username: service_role
  keyauth_credentials:
    - key: ${global.jwtTokens.serviceToken}

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
  host: "[${global.pgAuth.ipv6}]"
  port: 9999
  routes:
    - name: auth-v1-open
      strip_path: true
      paths:
        - /auth/v1/verify
  plugins:
    - name: cors
- name: auth-v1-open-callback
  host: "[${global.pgAuth.ipv6}]"
  port: 9999
  routes:
    - name: auth-v1-open-callback
      strip_path: true
      paths:
        - /auth/v1/callback
  plugins:
    - name: cors
- name: auth-v1-open-authorize
  host: "[${global.pgAuth.ipv6}]"
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
  host: "[${global.pgAuth.ipv6}]"
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
  url: "https://${global.pgRest.name}.fly.dev/"
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
  host: "[${global.pgMeta.ipv6}]"
  port: 8080
  routes:
    - name: meta-all
      strip_path: true
      paths:
        - /pg/

  `;
  const KONG_YML_PATH = global.kongPath + "/kong.yml";
  await writeFile(KONG_YML_PATH, kongYaml, "utf8");
  return;
}

const launchDefaultArgs = [
  "--no-deploy",
  "--copy-config",
  "--reuse-app",
  "--legacy",
  "--force-machines",
];

type GlobalInfo = {
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
  defaultArgs: string[];
  dbPath: string;
  directory: string;
  pgRestPath: string;
  authPath: string;
  studioPath: string;
  kongPath: string;
  metaPath: string;
  yes?: boolean;
  FLY_API_TOKEN: string;
};

type serviceInfo = {
  name?: string;
  ipv6: string;
};

type cliInput = {
  dir?: string;
  org?: string;
  region?: string;
  dbUrl?: string;
  yes?: boolean;
};
