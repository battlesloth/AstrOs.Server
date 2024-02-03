export class MessageHelpers {


    static uint8ArrayToNum(arr: Uint8Array) : number {
        let num = 0;
      
        for (let i = 7; i >= 0; i--) {
          num = num * 256 + arr[i];
        }
      
        return num;
      }
      
}