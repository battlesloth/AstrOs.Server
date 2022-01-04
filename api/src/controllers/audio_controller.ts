import { DataAccess } from "src/dal/data_access";
import { AudioFileRepository } from "src/dal/repositories/audio_file_repository";
import { AudioFile } from "src/models/audio-file";

export class AudioController {
    public static getAll = '/audio/all';
    public static deleteRoute = '/audio/delete';

    public static async getAllAudioFiles(req: any, res: any, next: any) {
        try {
            const dao = new DataAccess();
            const repo = new AudioFileRepository(dao);

            const files = await repo.getAudioFiles();

            files.push(new AudioFile('1', 'my cool file', 'test', 500));

            res.status(200);
            res.json(files);

        } catch (error) {
            console.log(error);

            res.status(500);
            res.json({
                message: 'Internal server error'
            });
        }
    }

    public static async deleteAudioFile(req: any, res: any, next: any) {

        try {
            const dao = new DataAccess();
            const repo = new AudioFileRepository(dao);

            const result = await repo.deleteFile(req.query.id);

            res.status(200);
            res.json({success: true});

        } catch (error) {
            console.log(error);

            res.status(500);
            res.json({
                message: 'Internal server error'
            });
        }
    }

}