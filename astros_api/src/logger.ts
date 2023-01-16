import pino from "pino";
import appdata from "appdata-path";

export const logger = pino({
    level: "debug"
}, pino.destination(`${appdata("astrosserver")}/astros.log`))