const { UploadedBody } = require("../dal/tables/scripts_table");

class Script{
    constructor(id, name, description, 
        uploadedCore, dateTimeCoreUploaded,
        uploadedDome, dateTimeDomeUploaded,
        uploadedBody, dateTimeBodyUploaded){
            this.id = id;
            this.name = name;
            this.description = description;
            this.uploadedCore = uploadedCore;
            this.dateTimeCoreUploaded = dateTimeCoreUploaded;
            this.uploadedDome = uploadedDome;
            this.dateTimeDomeUploaded = dateTimeDomeUploaded;    
            this.uploadedBody = uploadedBody;
            this.dateTimeBodyUploaded = dateTimeBodyUploaded;
        }
}

module.exports = {
    Script: Script
}