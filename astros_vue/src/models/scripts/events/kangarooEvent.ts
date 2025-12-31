import type { KangarooAction } from "@/enums/scripter/kangarooActions";

export interface KangarooEvent {
  ch1Action: KangarooAction;
  ch1Speed: number;
  ch1Position: number;
  ch2Action: KangarooAction;
  ch2Speed: number;
  ch2Position: number;
}

export interface KangarooX2 {
  id: string;
  ch1Name: string;
  ch2Name: string;
}