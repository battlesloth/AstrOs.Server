const DataAccess = require('../dal/data_access');
const ControllerRepository = require('../dal/controller_repository');
const { Controller } = require('../models/controller');

module.exports.getControllers = async (req, res, next) =>{
    try {
        const dao = new DataAccess();
        const repo = new ControllerRepository(dao);

        var modules = await repo.getControllers();

        res.status(200);
        res.json(modules);

    } catch (error) {
        console.log(error);

        res.status(500);
        res.json({
            message: 'Internal server error'
        });
    }
}

module.exports.saveControllers = async (req, res, next) =>{
    try {
        const dao = new DataAccess();
        const repo = new ModuleRepository(dao);

        if (await repo.saveControllers(req.body)){
            res.status(200);
            res.json({message: 'success'});
        } else {
            res.status(500);
            res.json({
                message: 'failed'
            });
        }  
    } catch (error) {
        console.log(error);

        res.status(500);
        res.json({
            message: 'Internal server error'
        });
    }
}