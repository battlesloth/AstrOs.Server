export class ControlModule {
    id: number;
    name: string;
    address: string;
    fingerprint!: string;

    constructor(id: number, name: string, address: string) {
        this.id = id;
        this.name = name;
        this.address = address;
    }
}



