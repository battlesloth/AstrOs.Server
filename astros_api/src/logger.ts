import pino from "pino";
import appdata from "appdata-path";


function timestamp(): string {
    const date_ob = new Date();
    const day = ("0" + date_ob.getDate()).slice(-2);
    const month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
    const year = date_ob.getFullYear();
    const hours = date_ob.getHours();
    const minutes = date_ob.getMinutes();
    const seconds = date_ob.getSeconds();

    return `${year}_${month}_${day}_${hours}_${minutes}_${seconds}`;
}

export const logger = pino({
    level: "debug"
},
    pino.destination(`${appdata("astrosserver")}/astros_${timestamp()}.log`)
)


