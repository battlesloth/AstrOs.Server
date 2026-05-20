import crypto from 'crypto';

const BUTTON_KEYS = [
  'button1',
  'button2',
  'button3',
  'button4',
  'button5',
  'button6',
  'button7',
  'button8',
  'button9',
] as const;

type ButtonKey = (typeof BUTTON_KEYS)[number];

export class M5Page {
  id: string;
  name: string;
  button1: PageButton;
  button2: PageButton;
  button3: PageButton;
  button4: PageButton;
  button5: PageButton;
  button6: PageButton;
  button7: PageButton;
  button8: PageButton;
  button9: PageButton;

  constructor(id?: string, name?: string) {
    this.id = id ?? crypto.randomUUID();
    this.name = name ?? '';
    this.button1 = new PageButton('0', 'None');
    this.button2 = new PageButton('0', 'None');
    this.button3 = new PageButton('0', 'None');
    this.button4 = new PageButton('0', 'None');
    this.button5 = new PageButton('0', 'None');
    this.button6 = new PageButton('0', 'None');
    this.button7 = new PageButton('0', 'None');
    this.button8 = new PageButton('0', 'None');
    this.button9 = new PageButton('0', 'None');
  }

  hasSettings(): boolean {
    return BUTTON_KEYS.some((key: ButtonKey) => this[key].id !== '0');
  }
}

export class PageButton {
  id: string;
  name: string;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }
}
