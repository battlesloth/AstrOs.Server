export class ControlModuleStatus {
  id: number;
  location: string;
  name: string;
  address: string;

  online: boolean;
  synced: boolean;

  constructor(id: number, location: string, name: string, address: string) {
    this.id = id;
    this.location = location;
    this.name = name;
    this.address = address;
    this.online = false;
    this.synced = false;
  }
}
