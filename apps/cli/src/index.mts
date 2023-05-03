import { spawn, exec } from "child_process";
import figlet from "figlet";
import { Command } from "commander";
import { select, confirm } from "@inquirer/prompts";
import chalk from "chalk";
const program = new Command();

// Async Iteration available since Node 10
main();

async function main() {
  program
    .version("0.0.1")
    .description("Deploy Supbase to Fly.io")
    .option("-o, --org  [value]", "Fly.io Target Organization")
    .option("-y, --yes", "Skip prompts and deploy")
    .parse(process.argv);

  const options = program.opts();

  console.log(figlet.textSync("Supa", "Larry 3D"));
  console.log(figlet.textSync("Based", "Larry 3D"));

  let username = await whoami();
  if (!username) {
    console.log("Auhtoritizing with Fly.io");
    // async shell cmd
    await flyLogin();
    username = await whoami();
  } else if (!options.yes) {
    const resp = await confirm({
      message: `You are logged into Fly.io as: ${username}. Do you want to continue?`,
      default: true,
    });
    if (!resp) {
      await flyLogin();
      username = await whoami();
    }
  }

  console.log("Deploying :", chalk.green(username));
}

async function flyLogin() {
  const flyLoginSpawn = spawn("fly", ["auth", "login"]);
  flyLoginSpawn.on("error", (err) => {
    console.log(`error: ${err.message}`);
  });

  flyLoginSpawn.stderr.on("error", (data) => {
    console.log(`stderr: ${data}`);
  });
  let loginData = "";

  for await (const data of flyLoginSpawn.stdout) {
    loginData = data.toString().trim();
  }
  return loginData;
}

async function whoami() {
  const whoamiSpawn = spawn("fly", ["auth", "whoami"]);
  whoamiSpawn.on("error", (err) => {
    console.log(`error: ${err.message}`);
  });

  whoamiSpawn.stderr.on("error", (data) => {
    console.log(`stderr: ${data}`);
  });
  let username = "";

  for await (const data of whoamiSpawn.stdout) {
    username = data.toString().trim();
  }
  return username;
}
