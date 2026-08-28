// Central place for the "download" wiring.
// Bump VERSION whenever you cut a new GitHub Release (must match the tag "vX.Y.Z"
// and the asset name uploaded to that release).
export const VERSION = '0.4.0'
export const REPO_URL = 'https://github.com/huynq24/table-craft'
export const ASSET_NAME = `TableCraft-Setup-${VERSION}.exe`

export const RELEASES_URL = `${REPO_URL}/releases/latest`
export const DOWNLOAD_URL = `${REPO_URL}/releases/download/v${VERSION}/${ASSET_NAME}`
