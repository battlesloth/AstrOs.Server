const DataAccess = require('../dal/data_access');
const ModuleRepository = require('../dal/module_repository');

module.exports.getModules = async (req, res, next) =>{
    try {
        const dao = new DataAccess();
        const repo = new ModuleRepository(dao);

        var modules = await repo.getModules();

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

module.exports.saveModules = async (req, res, next) =>{
    try {
        const dao = new DataAccess();
        const repo = new ModuleRepository(dao);

        if (await repo.saveModules(req.body)){
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