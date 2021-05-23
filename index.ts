#!/usr/bin/env ts-node
type TODO = unknown;

import fs from 'fs';
import Path from 'path';
import os from 'os';
import execa from 'execa';
import {Cli, Builtins, Command, Usage, BaseContext, Option} from 'clipanion';
import { Console } from 'console';
const shqModulePromise = eval('import("shq")');

const {name: binaryName, version: binaryVersion} = require('./package.json');

function main() {
    const [node, app, ...args] = process.argv;
    const cli = new Cli({
        binaryName,
        binaryVersion
    });
    cli.register(FlattenImageCommand);
    cli.register(Builtins.HelpCommand);
    cli.register(Builtins.VersionCommand);
    cli.runExit(args, Cli.defaultContext);
}

/*
 * Supported dockerfile commands:
 * CMD|ENTRYPOINT|ENV|EXPOSE|ONBUILD|USER|VOLUME|WORKDIR
*/

class FlattenImageCommand extends Command {
    static paths = [Command.Default];
    static usage: Usage = {
        description: 'Flatten a docker image into a new image with a single layer, copying metadata such as entrypoint and env vars.'
    }

    image = Option.String();
    tag = Option.String('-t,--tag');
    quiet = Option.Boolean('-q,--quiet', {
        description: 'Suppress informational logging.'
    });

    console!: Console;

    async execute() {
        this.console = new Console(this.context.stdout, this.context.stderr);
        const {console, image, tag, quiet} = this;
        const {default: shq} = await shqModulePromise;
        const cleanupTasks: Array<() => void | Promise<void>> = [];
        const log = quiet ? (...args: any[]) => {} : console.error.bind(console);
        try {
            log(`Inspecting docker image ${image}...`);
            const [result] = await Promise.allSettled([execa('docker', ['image', 'inspect', image], {
                stdout: 'pipe',
                stderr: 'inherit'
            })]);
            if(result.status === 'rejected') {
                console.error('Image not found.  Did you forget to `docker pull`?');
                console.error(result.reason.message);
                return 1;
            }
            const [dockerInspect] = JSON.parse(result.value.stdout) as DockerInspectOutput;
            log(`Image has ${ dockerInspect.RootFS.Layers.length} layers.`);
            
            log(`Creating temporary container...`);
            const result2 = await execa('docker', ['container', 'create', dockerInspect.Id]);
            const containerId = result2.stdout;
            log(`Created temporary container ${containerId}`);
            cleanupTasks.push(async () => {
                log(`Deleting temporary container...`);
                await execa('docker', ['container', 'rm', containerId]);
            });

            const tempDir = fs.mkdtempSync(Path.join(os.tmpdir(), binaryName));
            const tempFilePath = Path.join(tempDir, 'export.tar');
            cleanupTasks.push(async () => {
                log(`Deleting temporary file ${ tempFilePath }...`);
                fs.rmSync(tempFilePath);
            });
            log(`Exporting container filesystem to temporary file ${ tempFilePath }...`);
            await execa('docker', ['container', 'export', '-o', tempFilePath, containerId], {
                stdio: 'inherit'
            });

            const flags = buildDockerImportChangeFlags(dockerInspect);
            log(`Computed set of Dockerfile changes to apply to imported image: ${flags.map(flag => shq(flag)).join(' ')}`);
            log(`Importing exported filesystem into new image...`);
            const result3 = await execa('docker', ['image', 'import', ...flags, tempFilePath], {
                stderr: 'inherit'
            });
            const flattenedImageId = result3.stdout;
            log(`Created image ${flattenedImageId}`);
            if(tag) {
                await execa('docker', ['image', 'tag', flattenedImageId, tag], {stdio: 'inherit'});
                log(`Tagged image as ${tag}`);
            }
            console.log(flattenedImageId);
        } finally {
            for(const task of cleanupTasks) {
                await task();
            }
        }
    }
}

type DockerInspectOutput = [DockerInspectStruct];
interface DockerInspectStruct {
    Id: string;
    Config: {
        Cmd: string[];
        Entrypoint: string[];
        Env: string[];
        WorkingDir: string;
        Volumes: null | TODO;
        OnBuild: null | TODO;
        User: string;
        // TODO add support for expose, onbuild, volume
    };
    RootFS: {
        Type: 'layers';
        Layers: string[];
    }
}

function buildDockerImportChangeFlags(dockerInspect: DockerInspectStruct) {
    const {Cmd, Entrypoint, Env, OnBuild, User, Volumes, WorkingDir} = dockerInspect.Config;
    const flags: string[] = [];
    function addChange(change: string) {
        flags.push('--change', change);
    }
    if(OnBuild != null || Volumes != null) {
        throw new Error('unsupported fields encountered');
    }
    if(Cmd) addChange(`CMD ${ JSON.stringify(Cmd) }`);
    if(Entrypoint) addChange(`ENTRYPOINT ${ JSON.stringify(Entrypoint) }`);
    if(WorkingDir) addChange(`WORKDIR ${ JSON.stringify(WorkingDir) }`);
    if(Env) {
        for(const env of Env) {
            const [name, ...valueRest] = env.split('=');
            const value = valueRest.join('=');
            addChange(`ENV ${name}=${JSON.stringify(value)}`);
        }
    }
    if(User) {
        addChange(`USER ${ User }`);
    }
    return flags;
}

main();
