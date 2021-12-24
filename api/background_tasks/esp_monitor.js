const { parentPort } = require("worker_threads");
const superagent  = require('superagent');

parentPort.on('message', data => {
    monitorModule(data);
})

function monitorModule(data) {
    const agent = superagent.agent();

    let uri = '';
    
    if (data.ip){
        uri = data.ip;
    } else {
        uri = data.monitor;
    }

    agent.get(`http://${uri}`)
        .timeout({response: 4000})
        .then(res => {
            parentPort.postMessage({module:module,status:res.body.status});
        })
        .catch(err => {
            console.log(`Error calling ${data.monitor}:${err.message}`);
            parentPort.postMessage({module:data.monitor,status:"down"})
        });
}

