import type { PageButton } from '@/models/remoteControl/pageButton';

// The editor's two tabs map 1:1 to the two non-'none' PageButtonType values.
// Constrain it as a derived type so adding a new PageButtonType later forces
// the editor tab logic to update.
export type EditorTab = Exclude<PageButton['type'], 'none'>;

// Lightweight item shape for the script/playlist lists passed to the editor.
// Intentionally NOT a full Script/Playlist model — the editor only needs id
// + name to render the result rows. Decoupling here lets Phase 2d pass any
// derivation of either store without forcing the editor to know about the
// rest of the model.
export interface EditorListItem {
  id: string;
  name: string;
}
