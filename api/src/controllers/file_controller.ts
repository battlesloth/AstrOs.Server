import appdata from 'appdata-path';
import { DataAccess } from 'src/dal/data_access';
import { AudioFileRepository } from 'src/dal/repositories/audio_file_repository';
import { v4 as uuid_v4 } from "uuid";
import { UploadedFile } from 'express-fileupload';

// https://github.com/expressjs/multer/blob/master/StorageEngine.md
export class FileController {

    public static audioUploadRoute = '/audio/savefile';

    public static StoragePath() {
        return `${appdata("astrosserver")}/files/`;
    }

    public static async HandleFile(req: any, res: any) {

        try {
            if (!req.files) {
                return res.status(400).send("No files uploaded");
            }

            const file = req.files.file as UploadedFile;
            let filename = 'error';

            console.log("File Uploaded:");
            console.log(`file: ${file.name}, mimetype: ${file.mimetype}`);

            const extensionMap = new Map<string, string>([
                ['audio/ogg', 'ogg']
            ]);

            filename = `${uuid_v4()}.${extensionMap.get(file.mimetype)}`

            const path = `${FileController.StoragePath()}/${filename}`

            file.mv(path, (err) => {
                if (err) {
                    console.log(err);
                    return res.status(500).send("Internal server error");
                }
            });

            const dao = new DataAccess();
            const repo = new AudioFileRepository(dao);

            await repo.insertFile(filename, file.name);

            return res.status(200).send();

        } catch (err) {
            console.log(err);
            return res.status(500).send("Internal server error");
        }
    }

    public static async UpdateFileDurations() {

        const dao = new DataAccess();
        const repo = new AudioFileRepository(dao);

        const files = await repo.filesNeedingDuration();

        console.log(`Testing: ${JSON.stringify(files)}`);
    }
}