

async function heartbeat() {
    while (true) {
        await new Promise(r => setTimeout(r, 2000));
        console.log('Heartbeat');
    }
}

function start() {
    return heartbeat();
}

(async () => {
    console.log('starting...');

    await start();

    console.log('never finish');
})();