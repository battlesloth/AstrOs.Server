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



function uploadScript(data) {

    const unknown = 0;
    const sending = 1;
    const success = 2;
    const failed = 3;

    const agent = superagent.agent();

    data.endpoints.forEach(async function (endpoint) {

        // TODO: remove
        await new Promise(resolve => setTimeout(resolve, 2000));
        parentPort.postMessage({ type: 'scriptUploadStatus', scriptId: data.scriptId, controller: endpoint.type, status: sending, percent: 25 });

        await new Promise(resolve => setTimeout(resolve, 2000));
        parentPort.postMessage({ type: 'scriptUploadStatus', scriptId: data.scriptId, controller: endpoint.type, status: sending, percent: 50 });

        await new Promise(resolve => setTimeout(resolve, 2000));
        parentPort.postMessage({ type: 'scriptUploadStatus', scriptId: data.scriptId, controller: endpoint.type, status: sending, percent: 75 });

        await new Promise(resolve => setTimeout(resolve, 2000));
        parentPort.postMessage({ type: 'scriptUploadStatus', scriptId: data.scriptId, controller: endpoint.type, status: success, percent: 100 });

        return;

        try {
            let uri = '';

            if (endpoint.useIp) {
                uri = endpoint.ip;
            } else {
                uri = endpoint.endpointName;
            }

            agent.post(`http://${uri}`)
                .send(data.script)
                .timeout({ response: 4000 })
                .then(res => {
                    parentPort.postMessage({ controller: endpoint.endpointName, scriptId: data.scriptId, sent: res.result });
                })
                .catch(err => {
                    console.log(`Error calling ${data.monitor}:${err.message}`);
                    parentPort.postMessage({ controller: endpoint.endpointName, scriptId: data.scriptId, sent: false });
                });

        } catch (err) {
            console.log(`Error posting script to controller ${endpoint.endpointName}`);
            console.log(err);
            parentPort.postMessage({ controller: endpoint.endpointName, scriptId: data.scriptId, sent: false });
        };
    });
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
                console.log(`Error posting config to controller ${config.ip}: ${err}`);
                resultMap.set(config.id, undefined);
            };
        } else {
            console.log(`No IP set for Controller Type ${config.id}`);
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

