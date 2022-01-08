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
            val.forEach((af: any) => {
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

    async insertFile(id: string, fileName: string): Promise<boolean> {
        
        let result = false;

        await this.dao.run(AudioFilesTable.insert,
            [id, fileName, '', '0'])
        .then((val: any) =>{
            result = true;
        })
        .catch((err) =>{
            console.log(err);
            result = false;
        })

        return result;
    }

    async filesNeedingDuration() {
        const result = new Array<string>();
        
        await this.dao.get(AudioFilesTable.selectZeroDuration)
        .then((val: any) => {
            val.forEach((af: any) => {
                result.push(af.id);
            });
        })
        .catch((err) => {
            console.log(err);
            return result;
        });

        return result;
    }

    async updateFileDuration(id: string, duration: number){
        let result = false;
       
        await this.dao.run(AudioFilesTable.updateDuration, [duration.toString(), id])
        .then((val: any) =>{
            result = true;
        })
        .catch((err) =>{
            console.log(err);
            result = false;
        })

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