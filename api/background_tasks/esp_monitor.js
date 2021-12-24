const { parentPort } = require("worker_threads");
const superagent  = require('superagent');

parentPort.on('message', data => {
    monitorModule(data.monitor);
})

function monitorModule(module) {
    const agent = superagent.agent();
    agent.get(`http://${module}`)
        .timeout({response: 4000})
        .then(res => {
            parentPort.postMessage({module:module,status:res.body.status});
        })
        .catch(err => {
            console.log(`Error calling ${module}:${err.message}`);
            parentPort.postMessage({module:module,status:"down"})
        });
}

