# Asset register

Verified on: 2026-09-05

This register covers assets used by the root Git-Up application and README. The repository also contains reference material under `skills/`; those directories are not loaded by the root app and keep their own license files/notices.

| Local path | Purpose | Source URL | Creator | License | License URL | Access date | Modifications | Attribution text |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `assets/logo/icon_Dark_mode.png` | Primary dark-mode app icon, favicon, and README logo. | Pre-existing repository asset; no upstream source URL was present in the checkout. | Project maintainers / not declared in files. | Not separately declared; root project license is also not declared. | Not available. | 2026-09-05 | None in this pass. | No third-party attribution identified. Maintainers should document the logo source/ownership before publishing a formal release. |
| `assets/logo/icon_light_mode.png` | Primary light-mode app icon and favicon. | Pre-existing repository asset; no upstream source URL was present in the checkout. | Project maintainers / not declared in files. | Not separately declared; root project license is also not declared. | Not available. | 2026-09-05 | None in this pass. | No third-party attribution identified. Maintainers should document the logo source/ownership before publishing a formal release. |
| `public/assets/logo/icon_Dark_mode.png` | Duplicate dark-mode icon kept for static-host compatibility. | Same as `assets/logo/icon_Dark_mode.png`. | Project maintainers / not declared in files. | Not separately declared; root project license is also not declared. | Not available. | 2026-09-05 | None in this pass. | Same as source logo. |
| `public/assets/logo/icon_light_mode.png` | Duplicate light-mode icon kept for static-host compatibility. | Same as `assets/logo/icon_light_mode.png`. | Project maintainers / not declared in files. | Not separately declared; root project license is also not declared. | Not available. | 2026-09-05 | None in this pass. | Same as source logo. |
| `assets/mascot/oreo-route-bot.svg` | Local Oreo chatbot button artwork, replacing a remote Lottie animation with a self-contained project asset. | Created from scratch in this audit. | Arena.ai agent for the Git-Up maintainers. | Project-owned; no separate license until the root project chooses one. | Not available. | 2026-09-05 | Original SVG; no external references, script, raster images, or embedded fonts. | No third-party attribution required. |
| `docs/assets/git-up-workflow.svg` | README architecture/workflow diagram. | Created from scratch in this audit from repository evidence. | Arena.ai agent for the Git-Up maintainers. | Project-owned; no separate license until the root project chooses one. | Not available. | 2026-09-05 | Original SVG; no external references, script, raster images, or embedded fonts. | No third-party attribution required. |
| `assets/fonts/Excalifont-Regular.woff2` | Handwriting font used only in Oreo messenger bubbles. | <https://plus.excalidraw.com/excalifont> | Excalidraw. | SIL Open Font License 1.1 (OFL-1.1), as stated on the Excalifont page. | <https://openfontlicense.org/> | 2026-09-05 | None in this pass; local copy existed before this pass. | Excalifont by Excalidraw, licensed under OFL-1.1. |
| `public/vendor/particles.min.js` | Local particle-field engine for the background. | <https://www.jsdelivr.com/package/npm/particles.js> and <https://github.com/VincentGarreau/particles.js> | Vincent Garreau. | MIT. | <https://github.com/VincentGarreau/particles.js/blob/master/LICENSE.md> | 2026-09-05 | Vendored/minified copy existed before this pass; configuration is in `public/particles-workspace.js`. | particles.js © 2015 Vincent Garreau, licensed under MIT. |

## Safety notes

- The new SVG files contain only static shapes, gradients, and text metadata. They do not contain scripts, remote image references, event handlers, or embedded data URIs.
- The previous remote dotLottie animation and external player script were removed because the animation source/license was not verifiable from the repository and it created an avoidable browser-side network dependency.
- Important README visuals are local files; external badges are allowed only for stable GitHub-owned status endpoints.
