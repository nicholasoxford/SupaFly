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
import { confirm } from "@inquirer/prompts";
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
    }
    else if (!options.yes) {
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
    var _a, e_1, _b, _c;
    const flyLoginSpawn = spawn("fly", ["auth", "login"]);
    flyLoginSpawn.on("error", (err) => {
        console.log(`error: ${err.message}`);
    });
    flyLoginSpawn.stderr.on("error", (data) => {
        console.log(`stderr: ${data}`);
    });
    let loginData = "";
    try {
        for (var _d = true, _e = __asyncValues(flyLoginSpawn.stdout), _f; _f = await _e.next(), _a = _f.done, !_a;) {
            _c = _f.value;
            _d = false;
            try {
                const data = _c;
                loginData = data.toString().trim();
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
    return loginData;
}
async function whoami() {
    var _a, e_2, _b, _c;
    const whoamiSpawn = spawn("fly", ["auth", "whoami"]);
    whoamiSpawn.on("error", (err) => {
        console.log(`error: ${err.message}`);
    });
    whoamiSpawn.stderr.on("error", (data) => {
        console.log(`stderr: ${data}`);
    });
    let username = "";
    try {
        for (var _d = true, _e = __asyncValues(whoamiSpawn.stdout), _f; _f = await _e.next(), _a = _f.done, !_a;) {
            _c = _f.value;
            _d = false;
            try {
                const data = _c;
                username = data.toString().trim();
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
    return username;
}
//# sourceMappingURL=index.mjs.map