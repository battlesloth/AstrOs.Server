import type { PageButton } from '@/models/remoteControl/pageButton';

// The editor's two tabs map 1:1 to the two non-'none' PageButtonType values.
// Constrain it as a derived type so adding a new PageButtonType later forces
// the editor tab logic to update.
export type EditorTab = Exclude<PageButton['type'], 'none'>;

// Lightweight item shape for the script/playlist lists passed to the editor.
// Intentionally NOT a full Script/Playlist model — the editor only needs id
// + name to render the result rows. The consumer must adapt the store
// models (Script.scriptName / Playlist.playlistName) into this shape:
//   scripts.map(s => ({ id: s.id, name: s.scriptName }))
//   playlists.map(p => ({ id: p.id, name: p.playlistName }))
export interface EditorListItem {
  id: string;
  name: string;
}
