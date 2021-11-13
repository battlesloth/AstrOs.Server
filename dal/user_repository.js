const User = require('../api/models/users');

class UserRepository {
    constructor(dao) {
        this.dao = dao;
    }

    createTable() {

    }

    async add(name, passwordhash, salt) {
        const sql = `
        INSERT INTO users (user, hash, salt) VALUES(?, ?, ?)`;

        await this.dao.run(sql, [name, passwordhash, salt])
            .then(id => { })
            .catch((err) => {
                console.log(err);
                return 0;
            });

    }

    async getByUsername(name) {
        const sql = `
        SELECT user, hash, salt FROM users WHERE user = ?`;
        
        let result = await this.dao.get(sql, [name])
        .then((val) => {
            return new User(val[0].user, val[0].hash, val[0].salt );
        })
        .catch((err) => {
            console.log(err);
            return new User('', '', '');
        });

        return result;
    }
}

module.exports = UserRepository;