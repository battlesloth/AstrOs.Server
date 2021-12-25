import crypto from 'crypto';
import jsonwebtoken  from 'jsonwebtoken';

export class User{

    name: string;
    hash: string;
    salt: string;

    constructor(name: string, hash = '', salt = ''){
        this.name = name;
        this.hash = hash;
        this.salt = salt;
    }

    public setPassword(password: string) : void {
        this.salt = crypto.randomBytes(16).toString('hex');
        this.hash = crypto
        .pbkdf2Sync(password, this.salt, 1000, 64, 'sha512')
        .toString('hex');
    }

    public validatePassword(password: string) : boolean {
        const hash = crypto
        .pbkdf2Sync(password, this.salt, 1000, 64, 'sha512')
        .toString('hex');
        return this.hash === hash;    
    }

    public generateJwt(): string {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 7);
        
        const jwtKey : string = (process.env.JWT_KEY as string);

        return jsonwebtoken.sign({
            //_id:  _id,
            name: this.name,
            exp: (expiry.getTime() / 1000)
        },
            jwtKey
        );
    }
}
