const { parentPort } = require("worker_threads");
const superagent = require('superagent');
const e = require("express");

const unknown = 0;
const sending = 1;
const success = 2;
const failed = 3;

const script = 0;
const sync = 1;

const core = 0;
const dome = 0;
const body = 0;

parentPort.on('message', data => {

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

function uploadConfigs(data) {

    const agent = superagent.agent();

    const resultMap = new Map();

    data.configs.forEach(config => {
        try {
            agent.post(`http://${config.ip}`)
                .send({ servoChannels: config.servoChannels })
                .timeout({ response: 4000 })
                .then(res => {
                    resultMap.set(config.id) = true;
                })
                .catch(err => {
                    resultMap.set(config.id) = false;
                });

        } catch (err) {
            console.log(`Error posting config to controller ${config.ip}: ${err}`);
            resultMap.set(config.id) = false;
        };

    });

    const result = {
        type: this.sync,
        coreSynced: resultMap.get(this.core),
        domeSynced: resultMap.get(this.dome),
        bodySynced: resultMap.get(this.body)
    };

    parentPort.postMessage(result);
}

