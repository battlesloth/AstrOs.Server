import type { PageButton } from '@/models/remoteControl/pageButton';

// Emitted by AstrosMobileRemote when an operator taps a filled (non-`none`)
// button. Carries the PageButton verbatim so the parent (the standalone
// operator route in Phase 4) can route by `type` (script vs playlist) and
// fire the matching backend endpoint.
export type AstrosMobileRemotePressEvent = PageButton;
