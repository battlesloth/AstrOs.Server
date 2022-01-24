const { parentPort } = require("worker_threads");
const superagent = require('superagent');

parentPort.on('message', data => {
    uploadScript(data);
})


function uploadScript(data) {

    const agent = superagent.agent();

    data.endpoints.forEach(endpoint => {

        await new Promise(resolve => setTimeout(resolve, 2000));
        parentPort.postMessage({ controller: endpoint.endpointName, sent: true })

        continue;

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
                    parentPort.postMessage({ controller: endpoint.endpointName, scriptId: data.scriptId, sent: res.result })
                })
                .catch(err => {
                    console.log(`Error calling ${data.monitor}:${err.message}`);
                    parentPort.postMessage({ controller: endpoint.endpointName, scriptId: data.scriptId, sent: false })
                });

        } catch (err) {
            console.log(`Error posting script to controller ${endpoint.endpointName}`);
            console.log(err);
            parentPort.postMessage({ controller: endpoint.endpointName, scriptId: data.scriptId, sent: false })
        };
    });

}
