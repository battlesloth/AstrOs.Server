export type PageButtonType = 'script' | 'playlist' | 'none';

export interface PageButton {
  id: string;
  name: string;
  type: PageButtonType;
}
