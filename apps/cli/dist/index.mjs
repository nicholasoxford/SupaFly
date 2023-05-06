var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
import { spawn } from "child_process";
import figlet from "figlet";
import { Command } from "commander";
import { select, confirm, input } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
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
async function takeoff() {
    var _a;
    // create info object to pass around
    let info = {
        username: "",
        defaultRegion: "",
        organization: "",
    };
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
    info.organization = (_a = options.org) !== null && _a !== void 0 ? _a : "personal";
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
function getDefaultFlyArgs(args) {
    let argsArray = ["--force-machines", "--auto-confirm"];
    if (args.organization) {
        argsArray.push("--org", args.organization);
    }
    if (args.defaultRegion) {
        argsArray.push("--region", args.defaultRegion);
    }
    return argsArray;
}
async function userAuth(options, spinner) {
    let username = await whoami();
    if (!username) {
        console.log("Auhtoritizing with Fly.io");
        // async shell cmd
        await flyLogin();
        username = await whoami();
    }
    else if (!options.yes) {
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
async function deployMeta(userDefaultArgs) {
    const metaName = await input({
        message: "Enter a name for your postgres metadata instance, or leave blank for a generated one",
    });
    // if we dont have a name passed in, we need to generate one
    const nameCommands = metaName ? ["--name", metaName] : ["--generate-name"];
    // create array of commands
    const metalaunchCommandArray = ["launch", "--internal-port", "8080"].concat(launchDefaultArgs, userDefaultArgs, nameCommands);
    // run fly launch --no-deploy to allocate app
    const metaLaunch = spawn("fly", metalaunchCommandArray, {
        cwd: "../pg-meta",
    });
    await execAsyncLog(metaLaunch);
    await allocatePrivateV6("../pg-meta");
    await flyDeploy("../pg-meta");
    console.log("before spawn");
    const copyHostFile = spawn("fly", ["ssh", "sftp", "get", "/etc/hosts", "./hosts"], {
        cwd: "../pg-meta",
    });
    await execAsync(copyHostFile);
    console.log("post getting file");
    const hostFile = fs.readFileSync("../pg-meta/hosts", "utf8");
    // Extract the IPv6 address before "fly-local-6pn"
    const match = hostFile.match(/([0-9a-fA-F:]+)\s+fly-local-6pn/);
    if (match) {
        const ipv6 = match[1];
        console.log(ipv6); // Output the IPv6 address
    }
    else {
        console.error("IPv6 address not found");
    }
    console.log(chalk.blue("Deploying metadata"));
    return;
}
async function deployDatabase(userDefaultArgs) {
    const dbName = await input({
        message: "Enter a name for your database, or leave blank for a generated one",
    });
    // if we dont have a name passed in, we need to generate one
    const nameCommands = dbName ? ["--name", dbName] : ["--generate-name"];
    // create array of commands
    const launchCommandArray = ["launch", "--internal-port", "5432"].concat(launchDefaultArgs, userDefaultArgs, nameCommands);
    // run fly launch --no-deploy to allocate app
    const dbLaunch = spawn("fly", launchCommandArray, {
        cwd: "../../packages/database",
    });
    const resp = await execAsync(dbLaunch);
    console.log(resp);
    await allocatePrivateV6("../../packages/database");
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
async function execAsync(spawn) {
    var _a, e_1, _b, _c;
    let response = "";
    spawn.on("error", (err) => {
        console.log(`error: ${err.message}`);
    });
    spawn.stderr.on("error", (data) => {
        console.log(`stderr: ${data}`);
    });
    try {
        for (var _d = true, _e = __asyncValues(spawn.stdout), _f; _f = await _e.next(), _a = _f.done, !_a;) {
            _c = _f.value;
            _d = false;
            try {
                const data = _c;
                response += data.toString();
            }
            finally {
                _d = true;
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (!_d && !_a && (_b = _e.return)) await _b.call(_e);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return response;
}
async function execAsyncLog(spawn) {
    var _a, e_2, _b, _c;
    let response = "";
    spawn.on("error", (err) => {
        console.log(`error: ${err.message}`);
    });
    spawn.stderr.on("error", (data) => {
        console.log(`stderr: ${data}`);
    });
    try {
        for (var _d = true, _e = __asyncValues(spawn.stdout), _f; _f = await _e.next(), _a = _f.done, !_a;) {
            _c = _f.value;
            _d = false;
            try {
                const data = _c;
                console.log(data.toString());
                response += data.toString();
            }
            finally {
                _d = true;
            }
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (!_d && !_a && (_b = _e.return)) await _b.call(_e);
        }
        finally { if (e_2) throw e_2.error; }
    }
    return response;
}
async function allocatePrivateV6(path) {
    const ips = spawn("fly", ["ips", "allocate-v6", "--private"], {
        cwd: path,
    });
    return await execAsyncLog(ips);
}
async function flyDeploy(path) {
    const flyDeploy = spawn("fly", ["deploy"], {
        cwd: path,
    });
    return await execAsyncLog(flyDeploy);
}
const launchDefaultArgs = [
    "--no-deploy",
    "--copy-config",
    "--reuse-app",
    "--force-machines",
];
//# sourceMappingURL=index.mjs.map