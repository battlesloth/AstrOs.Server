import { PrivateKeyInput } from "crypto";
import { AudioFile } from "src/models/audio-file";
import { DataAccess } from "../data_access";
import { AudioFilesTable } from "../tables/audio_files_table";

export class AudioFileRepository {

    dao: DataAccess;

    constructor(dao: DataAccess) {
        this.dao = dao;
        this.dao.connect();
    }

    async getAudioFiles() : Promise<Array<AudioFile>> {

        const result = new Array<AudioFile>();
        await this.dao.get(AudioFilesTable.selectAll)
        .then((val: any) => {
            val.array.forEach((af: any) => {
                const file = new AudioFile(af.id, af.fileName, af.description, af.duration);
                result.push(file);
            });
        })
        .catch((err) => {
            console.log(err);
            return result;
        });

        return result;
    }

    async deleteFile(id: string) : Promise<boolean>{
       
        let result = false;
       
        await this.dao.run(AudioFilesTable.delete, [id])
        .then((val: any) =>{
            result = true;
        })
        .catch((err) =>{
            console.log(err);
            result = false;
        })

        return result;
    }
}