const { parentPort } = require("worker_threads");
const superagent = require('superagent');
const e = require("express");

parentPort.on('message', data => {

    const sync = 1;
    const script = 0;
    
    switch (data.type) {
        case script:
            uploadScript(data);
            break;
        case sync:
            uploadConfigs(data);
            break
    }
})



async function uploadScript(data) {

    const script = 0;

    const sending = 1;
    const success = 2;
    const failed = 3;

    const agent = superagent.agent();

    for (const config of data.configs) {
        parentPort.postMessage({type: script, controllerType: config.id, scriptId: data.scriptId, status: sending})
        if (!!config.ip.trim()) {
            try {
                agent.post(`http://${config.ip}/uploadscript`)
                    .send({scriptId: data.scriptId, script:config.script})
                    .timeout({ response: 4000 })
                    .then(res => {
                        const result = res.body.success = 'true' ? success : failed;
                        parentPort.postMessage({type: script, controllerType: config.id, scriptId: data.scriptId, status: result})
                    })
                    .catch(err => {
                        parentPort.postMessage({type: script, controllerType: config.id, scriptId: data.scriptId, status: failed})
                    });

            } catch (err) {
                console.log(`uploadScript|Error posting config to controller ${config.ip}: ${err}`);
                parentPort.postMessage({type: script, controllerType: config.id, scriptId: data.scriptId, status: failed})
            };
        } else {
            console.log(`uploadScript|No IP set for Controller Type ${config.id}`);
            parentPort.postMessage({type: script, controllerType: config.id, scriptId: data.scriptId, status: failed})
        }
    };
}

async function uploadConfigs(data) {

    const sync = 1;

    const core = 1;
    const dome = 2;
    const body = 3;

    const agent = superagent.agent();

    const resultMap = new Map();

    for (const config of data.configs) {
        if (!!config.ip.trim()) {
            try {
                const body = { servoChannels: config.servoChannels };
                await agent.post(`http://${config.ip}/setconfig`)
                    .send(body)
                    .timeout({ response: 4000 })
                    .then(res => {
                        resultMap.set(config.id, res.body.fingerprint);
                    })
                    .catch(err => {
                        resultMap.set(config.id, undefined);
                    });

            } catch (err) {
                console.log(`uploadConfigs|Error posting config to controller ${config.ip}: ${err}`);
                resultMap.set(config.id, undefined);
            };
        } else {
            console.log(`uploadConfigs|No IP set for Controller Type ${config.id}`);
            resultMap.set(config.id, undefined);
        }
    };

    const result = {
        type: sync,
        results: [
            {id: core, synced: resultMap.get(core) !== undefined, fingerprint: resultMap.get(core)},
            {id: dome, synced: resultMap.get(dome) !== undefined, fingerprint: resultMap.get(dome)},
            {id: body, synced: resultMap.get(body) !== undefined, fingerprint: resultMap.get(body)},
        ]
    };

    parentPort.postMessage(result);
}

