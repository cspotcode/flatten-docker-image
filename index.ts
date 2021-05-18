#!/usr/bin/env ts-node-transpile-only
type TODO = unknown;

import fs from 'fs';
import Path from 'path';
import execa from 'execa';
import {Cli, Builtins, Command, Usage, BaseContext, Option} from 'clipanion';

function main() {
    const [node, app, ...args] = process.argv;
    const cli = new Cli({
        binaryName: require('./package.json').name,
        binaryVersion: require('./package.json').version
    });
    cli.register(FlattenImageCommand);
    cli.register(Builtins.HelpCommand);
    cli.register(Builtins.VersionCommand);
    cli.runExit(args, Cli.defaultContext);
}

const supportedDockerfileCommands = 'CMD|ENTRYPOINT|ENV|EXPOSE|ONBUILD|USER|VOLUME|WORKDIR';

class FlattenImageCommand extends Command {
    static paths = [Command.Default];
    static usage: Usage = {
        description: 'Flatten a docker image into a new image with a single layer, copying metadata such as entrypoint and env vars.'
    }

    image = Option.String();

    async execute() {
        this.context.stdout.write(`TODO flatten this image: ${ this.image }\n`);
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
    }
}

function buildDockerImportChangeFlags(dockerInspectOutput: DockerInspectOutput) {
    const [dockerInspect] = dockerInspectOutput;
    const {Cmd, Entrypoint, Env, OnBuild, User, Volumes, WorkingDir} = dockerInspect.Config;
    const flags = [];
    function addChange(change: string) {
        flags.push('--change', change);
    }
    if(OnBuild != null || Volumes != null) {
        throw new Error('unsupported fields encountered');
    }
    if(Cmd) addChange(`CMD ${ JSON.stringify(Cmd) }`);
    if(Entrypoint) addChange(`ENTRYPOINT ${ JSON.stringify(WorkingDir) }`);
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