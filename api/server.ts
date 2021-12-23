import Express from "express";
import Dotenv from "dotenv";

class Server {

    port: number = 3000;

    public app: Express.Application;

    constructor() {
        this.app = Express();

        this.config();
        this.run();
    }

    public static bootstrap(): Server {
        return new Server();
    }

    private config() {
        

        Dotenv.config();
    }

    private run(){
        this.app.listen(3000,()=>{
            console.log('The application is listening on port 3000');
        });
    }
}

Server.bootstrap();
