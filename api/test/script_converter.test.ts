import { ScriptConverter } from "../src/script_converter";

describe("test conversion", () =>{
    it("should return test", () => {
        const cvtr = new ScriptConverter();
        expect(cvtr.convertScript('val')).toBe('test');
    });
})