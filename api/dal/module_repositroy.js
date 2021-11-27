const { ModuleId, Module } = require('../models/module');

class ModuleRepository{
    constructor(dao) {
        this.dao = dao;
        this.dao.connect();
    }

    async getModules(){
        const map = new Map();

        map.set(ModuleId.CORE, new Module(ModuleId.CORE, "Dome Core Module"));
        map.set(ModuleId.DOME, new Module(ModuleId.DOME, "Dome Surface Module"));
        map.set(ModuleId.BODY, new Module(ModuleId.BODY, "Body Module"));
     
        return map;
    }

    async saveModules(modules){
        return true;
    }
}

module.exports = ModuleRepository;