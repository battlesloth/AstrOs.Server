import { Subscription } from "rxjs";

export class  FileUpload {

    fileData: any;
    uploadProgress?:number;
    subscription?: Subscription;

    constructor(file: any) {
        this.uploadProgress = 0;
        this.fileData = file;
    }
}