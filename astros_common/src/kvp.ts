export class Kvp<T, U> {
    key: T;
    value: U;

    constructor(key: T, value: U) {
        this.key = key;
        this.value = value;
    }
}