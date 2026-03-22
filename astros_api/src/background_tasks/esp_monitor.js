import { parentPort } from 'worker_threads';
import superagent from 'superagent';
import { logger } from '../logger.js';

parentPort.on('message', (data) => {
  checkControllers(data);
});

function checkControllers(data) {
  const agent = superagent.agent();

  data.forEach((ctl) => {
    if (ctl.ip) {
      agent
        .get(`http://${ctl.ip}`)
        .timeout({ response: 4000 })
        .then((res) => {
          parentPort.postMessage({
            pe: 2,
            controllerType: ctl.controllerType,
            up: res.body.result === 'up',
            synced: res.body.fingerprint === ctl.fingerprint,
          });
        })
        .catch((err) => {
          logger.error(`Error calling ${ctl.ip}:${err.message}`);
          parentPort.postMessage({
            type: 2,
            controllerType: ctl.controllerType,
            up: false,
            synced: false,
          });
        });
    } else {
      logger.warn(`No IP set for Controller Type ${ctl.controllerType}`);
      parentPort.postMessage({
        type: 2,
        controllerType: ctl.controllerType,
        up: false,
        synced: false,
      });
    }
  });
}
