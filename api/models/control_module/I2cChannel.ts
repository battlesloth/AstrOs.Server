

export class I2cChannel {
    id: number;
    name: string;

    constructor(id: number, name: string) {
        if (name === null) {
            this.name = "unnamed";
        } else {
            this.name = name;
        }
        this.id = id;
    }
}
