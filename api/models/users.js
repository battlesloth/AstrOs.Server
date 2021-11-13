const crypto = require('crypto');
const jwt = require('jsonwebtoken');


class User{
    constructor(name, hash = '', salt = ''){
        this.name = name;
        this.hash = hash;
        this.salt = salt;
    }

    setPassword(password){
        this.salt = crypto.randomBytes(16).toString('hex');
        this.hash = crypto
        .pbkdf2Sync(password, this.salt, 1000, 64, 'sha512')
        .toString('hex');
    }

    validatePassword(password){
        const hash = crypto
        .pbkdf2Sync(password, this.salt, 1000, 64, 'sha512')
        .toString('hex');
        return this.hash === hash;    
    }

    generateJwt(){
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 7);

        return jwt.sign({
            _id: this._id,
            name: this.name,
            exp: parseInt(expiry.getTime() / 1000)
        },
            process.env.JWT_KEY
        );
    }
}

module.exports = User;