import { parentPort } from 'worker_threads';
import superagent from 'superagent';
import { logger } from '../logger.js';

parentPort.on('message', (data) => {
  logger.info(`message received, type: ${data.type}`);

  const script = 0;
  const sync = 1;
  const run = 3;
  const panic = 4;
  const directCommand = 5;
  const formatSD = 6;

  switch (data.type) {
    case script:
      uploadScript(data);
      break;
    case sync:
      uploadConfigs(data);
      break;
    case run:
      runScript(data);
      break;
    case panic:
      panicStop(data);
      break;
    case directCommand:
      runCommand(data);
      break;
    case formatSD:
      sendFormatSD(data);
      break;
  }
});

async function uploadScript(data) {
  const script = 0;

  const sending = 1;
  const success = 2;
  const failed = 3;

  const agent = superagent.agent();

  for (const config of data.configs) {
    if (config.ip === undefined || config.ip === null) {
      logger.warn(`uploadScript|No IP set for Controller Type ${config.id}`);
      parentPort.postMessage({
        type: script,
        controllerType: config.id,
        scriptId: data.scriptId,
        status: failed,
      });
      continue;
    }

    parentPort.postMessage({
      type: script,
      controllerType: config.id,
      scriptId: data.scriptId,
      status: sending,
    });
    if (config.ip.trim()) {
      try {
        agent
          .post(`http://${config.ip}/uploadscript`)
          .send({ scriptId: data.scriptId, script: config.script })
          .timeout({ response: 4000 })
          .then((res) => {
            const result = res.body.success === 'true' ? success : failed;
            parentPort.postMessage({
              type: script,
              controllerType: config.id,
              scriptId: data.scriptId,
              status: result,
            });
          })
          .catch((err) => {
            logger.error(`uploadScript|Error posting config to controller ${config.ip}: ${err}`);
            parentPort.postMessage({
              type: script,
              controllerType: config.id,
              scriptId: data.scriptId,
              status: failed,
            });
          });
      } catch (err) {
        logger.error(`uploadScript|Error posting config to controller ${config.ip}: ${err}`);
        parentPort.postMessage({
          type: script,
          controllerType: config.id,
          scriptId: data.scriptId,
          status: failed,
        });
      }
    } else {
      logger.warn(`uploadScript|No IP set for Controller Type ${config.id}`);
      parentPort.postMessage({
        type: script,
        controllerType: config.id,
        scriptId: data.scriptId,
        status: failed,
      });
    }
  }
}

async function uploadConfigs(data) {
  const sync = 1;

  const core = 1;
  const dome = 2;
  const body = 3;

  const agent = superagent.agent();

  const resultMap = new Map();

  for (const config of data.configs) {
    if (config.ip === undefined || config.ip === null) {
      logger.error(`uploadConfigs|No IP Configured for ${config.id}`);
      continue;
    }

    if (config.ip.trim()) {
      try {
        const body = { servoChannels: config.servoChannels };
        await agent
          .post(`http://${config.ip}/setconfig`)
          .send(body)
          .timeout({ response: 4000 })
          .then((res) => {
            resultMap.set(config.id, res.body.fingerprint);
          })
          .catch((err) => {
            logger.error(`uploadConfigs|Error posting config to controller ${config.ip}: ${err}`);
            resultMap.set(config.id, undefined);
          });
      } catch (err) {
        logger.error(`uploadConfigs|Error posting config to controller ${config.ip}: ${err}`);
        resultMap.set(config.id, undefined);
      }
    } else {
      logger.warn(`uploadConfigs|No IP set for Controller Type ${config.id}`);
      resultMap.set(config.id, undefined);
    }
  }

  const result = {
    type: sync,
    results: [
      { id: core, synced: resultMap.get(core) !== undefined, fingerprint: resultMap.get(core) },
      { id: dome, synced: resultMap.get(dome) !== undefined, fingerprint: resultMap.get(dome) },
      { id: body, synced: resultMap.get(body) !== undefined, fingerprint: resultMap.get(body) },
    ],
  };

  parentPort.postMessage(result);
}

async function runScript(data) {
  const agent = superagent.agent();

  for (const config of data.configs) {
    if (config.ip === undefined || config.ip === null) {
      logger.warn(`runscript|No IP set for Controller Type ${config.id}`);
      continue;
    }

    if (config.ip.trim()) {
      try {
        agent
          .get(`http://${config.ip}/runscript?scriptId=${data.scriptId}`)
          .timeout({ response: 4000 })
          .catch((err) => {
            logger.error(`runscript|Error posting config to controller ${config.ip}: ${err}`);
          });
      } catch (err) {
        logger.error(`runscript|Error posting config to controller ${config.ip}: ${err}`);
      }
    } else {
      logger.warn(`runscript|No IP set for Controller Type ${config.id}`);
    }
  }
}

async function panicStop(data) {
  logger.debug('panicstop|Panic Stop Called');

  const agent = superagent.agent();

  for (const config of data.configs) {
    if (config.ip === undefined) {
      logger.warn(`panicstop|No IP set for Controller Type ${config.id}`);
      continue;
    }

    if (config.ip.trim()) {
      try {
        agent
          .get(`http://${config.ip}/panicstop`)
          .timeout({ response: 4000 })
          .catch((err) => {
            logger.error(`panicstop|Error posting config to controller ${config.ip}: ${err}`);
          });
      } catch (err) {
        logger.error(`panicstop|Error posting config to controller ${config.ip}: ${err}`);
      }
    } else {
      logger.warn(`panicstop|No IP set for Controller Type ${config.id}`);
    }
  }
}

async function runCommand(data) {
  const uart = 1;
  const i2c = 2;
  const servo = 3;

  const agent = superagent.agent();

  let uri = '';

  switch (data.commandType) {
    case servo:
      uri = 'moveservo';
      break;
    case i2c:
      uri = 'sendi2c';
      break;
    case uart:
      uri = 'sendserial';
      break;
  }

  if (data.ip.trim()) {
    try {
      agent
        .post(`http://${data.ip}/${uri}`)
        .send(data.command)
        .timeout({ response: 4000 })
        .catch((err) => {
          logger.error(`send command|Error posting URI '${uri}' to controller ${data.ip}: ${err}`);
        });
    } catch (err) {
      logger.error(`send command|Error posting URI '${uri}' to controller ${data.ip}: ${err}`);
    }
  } else {
    logger.warn(`send command|No IP set for Controller Type ${data.id}`);
  }
}

async function sendFormatSD(data) {
  const agent = superagent.agent();

  if (data.ip.trim()) {
    try {
      agent
        .post(`http://${data.ip}/formatsd`)
        .send(data.command)
        .timeout({ response: 4000 })
        .catch((err) => {
          logger.error(`format SD|Error posting format to controller ${data.ip}: ${err}`);
        });
    } catch (err) {
      logger.error(`Format SD|Error posting format to controller ${data.ip}: ${err}`);
    }
  } else {
    logger.warn(`format SD|No IP set for Controller Type ${data.id}`);
  }
}
