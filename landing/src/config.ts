// Central place for the "download" wiring.
// TODO: repo doesn't exist yet — replace REPO_URL with your real GitHub repo,
// then update VERSION/ASSET_NAME to match the asset attached to your GitHub Release.
export const VERSION = '0.1.0'
export const REPO_URL = 'https://github.com/your-org/tablecraft'
export const ASSET_NAME = `TableCraft-Setup-${VERSION}.exe`

export const RELEASES_URL = `${REPO_URL}/releases/latest`
export const DOWNLOAD_URL = `${REPO_URL}/releases/download/v${VERSION}/${ASSET_NAME}`
