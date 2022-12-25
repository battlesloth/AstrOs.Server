const { parentPort, workerData } = require("worker_threads");
const superagent  = require('superagent');

parentPort.on('message', data => {
    checkControllers(data);
})

function checkControllers(data) {
    const agent = superagent.agent();

    data.forEach( ctl => {

        agent.get(`http://${ctl.ip}`)
            .timeout({response: 4000})
            .then(res => {
                parentPort.postMessage({type:'status', module:ctl.monitor, status:res.body.result, synced: res.body.fingerprint === ctl.fingerprint});
            })
            .catch(err => {
                console.log(`Error calling ${data.monitor}:${err.message}`);
                parentPort.postMessage({type: 'status', module:ctl.monitor, status:"down"})
            });    
    });
}

