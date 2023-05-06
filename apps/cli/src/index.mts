import { spawn, exec, ChildProcessWithoutNullStreams } from "child_process";
import figlet from "figlet";
import { Command, OptionValues } from "commander";
import { select, confirm, input } from "@inquirer/prompts";
import chalk from "chalk";
import ora, { Ora } from "ora";
import fs from "fs";
console.log(figlet.textSync("Supa", "Larry 3D"));
console.log(figlet.textSync("Based", "Larry 3D"));
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

takeoff();
let info: cliInfo = {
  username: "",
  defaultRegion: "",
  organization: "",
  pgMeta: {
    ipv6: "",
  },
  pgRest: {
    ipv6: "",
  },
};
async function takeoff() {
  // create info object to pass around

  const authSpinner = ora({
    text: `Checking fly cli authorization...`,
    color: "yellow",
  }).start();

  // grab username
  info.username = await userAuth(options, authSpinner);
  authSpinner.stop();
  console.log("Deploying database as:", chalk.green(info.username));

  // chose default region if not passed in
  info.defaultRegion = options.region
    ? options.region
    : await choseDefaultRegions();
  console.log("Deploying to region:", chalk.green(info.defaultRegion));

  // set default org if passed in
  // TODO: Prompt them with a list or orgs

  info.organization = options.org ?? "personal";
  console.log("Deploying to organization:", chalk.green(info.organization));

  // turn our info object into default fly args
  const defaultArgs = getDefaultFlyArgs(info);
  if (!options.dbUrl) {
    // deploy database
    await deployDatabase(defaultArgs);
    console.log(chalk.green("You successfully deployed your database!"));
  }
  const spinner = ora({
    text: `Checking if database was deployed correctly...`,
    color: "yellow",
  }).start();

  spinner.stop();

  // deploy api
  await deployMeta(defaultArgs);
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

//
// Fly io specific functions

//Deploying postgres-meta
async function deployMeta(userDefaultArgs: string[]) {
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

  // create array of commands
  const metalaunchCommandArray = ["launch"].concat(
    launchDefaultArgs,
    userDefaultArgs,
    nameCommands
  );

  // run fly launch --no-deploy to allocate app
  info.pgMeta.ipv6 = await flyLaunchDeployInternalIPV6(
    metalaunchCommandArray,
    "../pg-meta"
  );
  return;
}

//Deploying postgresT
async function deployPostgREST(userDefaultArgs: string[]) {
  console.log(chalk.blue("Deploying metadata"));
  let postgrestName;
  if (!options.yes) {
    postgrestName = await input({
      message:
        "Enter a name for your postgres metadata instance, or leave blank for a generated one",
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
  info.pgRest.ipv6 = await flyLaunchDeployInternalIPV6(
    metalaunchCommandArray,
    "../pg-rest"
  );
  return;
}

async function deployDatabase(userDefaultArgs: string[]) {
  const dbName = await input({
    message:
      "Enter a name for your database, or leave blank for a generated one",
  });

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
    cwd: "../../packages/database",
  });
  const resp = await execAsync(dbLaunch);
  console.log(resp);

  await allocatePrivateIPV6("../../packages/database");

  // run fly deploy --remote-only to deploy db
  console.log(chalk.blue("Deploying database"));
  const deployResp = await flyDeploy("../../packages/database");
  const machine = spawn("fly", ["scale", "memory", "1024"], {
    cwd: "../../packages/database",
  });

  await execAsyncLog(machine);
  console.log("db deploy: \n", deployResp);
  return;
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

async function flyLaunchDeployInternalIPV6(
  launchCommandArray: string[],
  path: string
) {
  // run fly launch --no-deploy to allocate app
  const metaLaunch = spawn("fly", launchCommandArray, {
    cwd: path,
  });
  await execAsyncLog(metaLaunch);
  await allocatePrivateIPV6(path);
  await flyDeploy(path);
  return await getInternalIPV6Address(path);
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

async function getInternalIPV6Address(path: string) {
  const copyHostFile = spawn(
    "fly",
    ["ssh", "sftp", "get", "/etc/hosts", "./hosts"],
    {
      cwd: path,
    }
  );
  await execAsync(copyHostFile);
  const hostFile = fs.readFileSync("./hosts", "utf8");
  // Extract the IPv6 address before "fly-local-6pn"
  const match = hostFile.match(/([0-9a-fA-F:]+)\s+fly-local-6pn/);
  let ipv6 = "";
  if (match) {
    ipv6 = match[1];
  } else {
    console.error("IPv6 address not found");
  }
  return ipv6;
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
};

type serviceInfo = {
  name?: string;
  ipv6: string;
};
