const { parentPort } = require("worker_threads");
const superagent  = require('superagent');
const { logger } = require("../logger");

parentPort.on('message', data => {
    checkControllers(data);
})

function checkControllers(data) {
    const agent = superagent.agent();

    data.forEach( ctl => {
        if (!!ctl.ip){
        agent.get(`http://${ctl.ip}`)
            .timeout({response: 4000})
            .then(res => {
                parentPort.postMessage({type: 2, controllerType: ctl.controllerType, up: res.body.result === 'up', synced: res.body.fingerprint === ctl.fingerprint});
            })
            .catch(err => {
                logger.error(`Error calling ${ctl.ip}:${err.message}`);
                parentPort.postMessage({type: 2, controllerType: ctl.controllerType, up: false, synced: false})
            });    
        } else {
            logger.warn(`No IP set for Controller Type ${ctl.controllerType}`);
            parentPort.postMessage({type: 2, controllerType: ctl.controllerType, up: false, synced: false})
        }
    });
}

