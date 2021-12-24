import { DataAccess } from "../data_access";
import { UsersTable } from "../tables/users_table";
import { User } from "../../models/users";

export class UserRepository {

    dao: DataAccess;

    constructor(dao: DataAccess) {
        this.dao = dao;
        this.dao.connect();
    }

    async getByUsername(name: string) {

        const result = await this.dao.get(UsersTable.select, [name])
        .then((val: any) => {
            return new User(val[0].user, val[0].hash, val[0].salt );
        })
        .catch((err) => {
            console.log(err);
            return new User('', '', '');
        });

        return result;
    }
}
