const User = require('../models/users');
const Table = require('./tables/users_table');

class UserRepository {
    constructor(dao) {
        this.dao = dao;
        this.dao.connect();
    }

    async getByUsername(name) {

        let result = await this.dao.get(Table.select, [name])
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