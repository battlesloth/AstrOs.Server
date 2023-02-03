export class M5Page {

    button1: PageButton;
    button2: PageButton;
    button3: PageButton;
    button4: PageButton;
    button5: PageButton;
    button6: PageButton;
    button7: PageButton;
    button8: PageButton;
    button9: PageButton;
    button10: PageButton;
    button11: PageButton;
    button12: PageButton;

    constructor(){
        this.button1 = new PageButton("0", "None");
        this.button2 = new PageButton("0", "None");
        this.button3 = new PageButton("0", "None");
        this.button4 = new PageButton("0", "None");
        this.button5 = new PageButton("0", "None");
        this.button6 = new PageButton("0", "None");
        this.button7 = new PageButton("0", "None");
        this.button8 = new PageButton("0", "None");
        this.button9 = new PageButton("0", "None"); 
        this.button10 = new PageButton("0", "None");
        this.button11 = new PageButton("0", "None");
        this.button12 = new PageButton("0", "None"); 
    }
 }

 export class PageButton {
    
    id: string;
    name: string;

    constructor(id: string, name: string ){
        this.id = id;
        this.name = name;
    }
 }