const { parentPort } = require("worker_threads");
const superagent = require('superagent');

parentPort.on('message', data => {
    uploadScript(data);
})


const unknown = 0;
const sending = 1;
const success = 2;
const failed = 3;

function uploadScript(data) {

    const agent = superagent.agent();

    data.endpoints.forEach(async function (endpoint) {

           // TODO: remove
            await new Promise(resolve => setTimeout(resolve, 2000));
            parentPort.postMessage({ controller: endpoint.endpointName, status: sending, percent: 25 });

            await new Promise(resolve => setTimeout(resolve, 2000));
            parentPort.postMessage({ controller: endpoint.endpointName, status: sending, percent: 50 });
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            parentPort.postMessage({ controller: endpoint.endpointName, status: sending, percent: 75 });

            await new Promise(resolve => setTimeout(resolve, 2000));
            parentPort.postMessage({ controller: endpoint.endpointName, status: success, percent: 100 });

         
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
