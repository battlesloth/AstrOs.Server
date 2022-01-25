export class AudioFile {

    id: string;
    fileName: string;
    description: string;
    duration: number;

    constructor(id: string, fileName: string, description: string, duration: number) {
        this.id = id;
        this.fileName = fileName;
        this.description = description;
        this.duration = duration;
    }
}