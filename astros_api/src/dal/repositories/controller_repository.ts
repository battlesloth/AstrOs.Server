import { DataAccess } from "../../dal/data_access";
import { ControlModule } from "astros-common";
import { ControllersTable } from "../../dal/tables/controllers_table";
import { logger } from "../../logger";

export class ControllerRepository {
    dao: DataAccess;

    constructor(dao: DataAccess) {
        this.dao = dao;
        this.dao.connect();
    }


    public async getControllers(): Promise<Array<ControlModule>> {
        const result = new Array<ControlModule>();
        await this.dao
            .get(ControllersTable.selectAll, [])
            .then((val: any) => {
                for (const c of val) {
                    const control = new ControlModule(
                        c.id,
                        c.controllerName,
                        c.controllerAddress);
                    result.push(control);
                }
            })
            .catch((err: any) => {
                logger.error(err);
                throw "error";
            });

        return result;
    }

    public async insertController(controller: ControlModule): Promise<number> {

        let id = -1;

        await this.dao.get(ControllersTable.insert, [controller.name, controller.address])
            .then((val: any) => {
                id = val[0].id;
            })
            .catch((err: any) => {
                logger.error(err);
                throw "error";
            });

        return id;
    }

    public async updateController(controller: ControlModule): Promise<boolean> {
        await this.dao
            .run(ControllersTable.update, [
                controller.name,
                controller.address,
                controller.id.toString(),
            ])
            .catch((err: any) => {
                logger.error(err);
                throw "error";
            });

        return true;
    }
}
