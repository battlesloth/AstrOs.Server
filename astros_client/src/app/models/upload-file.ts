import { Subscription } from "rxjs";

export class  FileUpload {

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fileData: string | any;
    uploadProgress?:number;
    subscription?: Subscription;

    constructor(file: string | unknown) {
        this.uploadProgress = 0;
        this.fileData = file;
    }
}