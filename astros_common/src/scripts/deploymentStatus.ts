import { UploadStatus } from "../astros_enums";
import { Kvp } from "../kvp";

export class DeploymentStatus extends Kvp<
  string,
  { date: Date; value: UploadStatus }
> {
  constructor(key: string, value: { date: Date; value: UploadStatus }) {
    super(key, value);
  }
}
