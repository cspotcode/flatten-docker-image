type TODO = unknown;

import fs from 'fs';
import Path from 'path';
import execa from 'execa';

const supportedDockerfileCommands = 'CMD|ENTRYPOINT|ENV|EXPOSE|ONBUILD|USER|VOLUME|WORKDIR';

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

function main() {
    execa
}
