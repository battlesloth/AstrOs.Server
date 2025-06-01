export class ControlModule {
  id: string;
  name: string;
  address: string;
  fingerprint!: string;

  constructor(id: string, name: string, address: string) {
    this.id = id;
    this.name = name;
    this.address = address;
  }
}
