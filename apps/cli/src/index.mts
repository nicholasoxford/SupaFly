import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import figlet from "figlet";
import { Command, OptionValues } from "commander";
import { select, confirm, input } from "@inquirer/prompts";
import chalk from "chalk";
import ora, { Ora } from "ora";
import njwt from "njwt";
import secureRandom from "secure-random";
import { readFile, writeFile } from "fs/promises";
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
    console.log("Auhtoritizing with Fly.io");
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
  console.log(chalk.blue("Deploying metadata"));
  let metaName;
  if (!options.yes) {
    metaName = await input({
      message:
        "Enter a name for your postgres metadata instance, or leave blank for a generated one",
    });
  }
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
  await execAsyncLog(flyProcess1);
  await execAsyncLog(flyProcess2);
}

//Deploying postgresT
async function deployPGREST(userDefaultArgs: string[]) {
  console.log(chalk.blue("Deploying postgREST"));
  let postgrestName;
  if (!options.yes) {
    postgrestName = await input({
      message:
        "Enter a name for your postgREST instance, or leave blank for a generated one",
    });
  }
  // if we dont have a name passed in, we need to generate one
  const nameCommands = postgrestName
    ? ["--name", postgrestName]
    : ["--generate-name"];

  // create array of commands
  const metalaunchCommandArray = ["launch"].concat(
    launchDefaultArgs,
    userDefaultArgs,
    nameCommands
  );

  // run fly launch --no-deploy to allocate app
  globalInfo.pgRest.ipv6 = await flyLaunchDeployInternalIPV6(
    metalaunchCommandArray,
    "../pg-rest"
  );
  return;
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
  setTimeout(() => {}, 2000);
  await updateFlyDBRoles(dbPath);
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
  await execAsyncLog(flyProcess);
}

async function scaleMemoryFly(path: string, memory: number) {
  const machine = spawn("fly", ["scale", "memory", memory.toString()], {
    cwd: path,
  });

  await execAsyncLog(machine);
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
  path: string
) {
  // run fly launch --no-deploy to allocate app
  const launchCommand = spawn("fly", launchCommandArray, {
    cwd: path,
  });
  await execAsyncLog(launchCommand);
  await allocatePrivateIPV6(path);
  await flyDeploy(path);
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
    // deploy database
    globalInfo.database.ipv6 = await deployDatabase(defaultArgs);
    console.log(chalk.green("You successfully deployed your database!"));
  }
}

async function allocatePrivateIPV6(path: string) {
  const ips = spawn("fly", ["ips", "allocate-v6", "--private"], {
    cwd: path,
  });

  return await execAsyncLog(ips);
}

async function flyDeploy(path: string) {
  const flyDeploy = spawn("fly", ["deploy"], {
    cwd: path,
  });
  return await execAsyncLog(flyDeploy);
}

async function getInternalIPV6Address(projPath: string) {
  console.log(chalk.blue("Getting internal ipv6 address"));
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
  } else {
    console.error("IPv6 address not found");
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

    console.log("File updated successfully!");
  } catch (err) {
    console.error(err);
  }
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
  };
  pgAuth: serviceInfo;
  database: serviceInfo & {
    hostname?: string;
    port?: string;
    username?: string;
    password?: string;
    databaseName?: string;
  };
};

type serviceInfo = {
  name?: string;
  ipv6: string;
};
