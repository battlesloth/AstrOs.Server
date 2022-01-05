import appdata from 'appdata-path';
import { DataAccess } from 'src/dal/data_access';
import { AudioFileRepository } from 'src/dal/repositories/audio_file_repository';
import { v4 as uuid_v4 } from "uuid";

export class FileController {

    public static audioUploadRoute = '/audio/savefile';

    public static HandleStorage(req: any, file: any, cb: any) {
        cb(null, `${appdata("astrosserver")}/files/`);
    }

    public static async HandleFileName(req: any, file: any, cb: any) {

        let filename = 'error';

        try {
            console.log("File Uploaded:");
            console.log(JSON.stringify(file));

            const extensionMap = new Map<string, string>([
                ['audio/ogg', 'ogg']
            ]);

            filename = `${uuid_v4()}.${extensionMap.get(file.mimetype)}`

            const dao = new DataAccess();
            const repo = new AudioFileRepository(dao);

            await repo.insertFile(filename, file.originalname);

        } catch (err) {
            console.log(err);
        }

        cb(null, filename);
    }
}