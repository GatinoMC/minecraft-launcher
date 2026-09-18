# GatinoLauncher code signing policy

Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

## Signed artifacts

The official Windows installer is named `minelatino-<version>-win32-x64.exe` and is rebuilt from the matching public Git tag. The preferred path is [the signing workflow](.github/workflows/sign-release.yml), which verifies Authenticode before publishing. While SignPath approval is pending, a release explicitly requested by the project owner may include the unsigned installer built by [the release workflow](.github/workflows/publish-signed-update.yml); that release must disclose the missing Authenticode signature and publish a SHA-256 checksum. Existing installations may also receive an updater-only release: its ASAR checksum is signed with the launcher's pinned Ed25519 key and verified again immediately before replacement. Local builds, pull-request builds, dependencies, portable archives and binaries belonging to upstream projects are not signed with the MineLatino subscription.

GatinoLauncher is a maintained derivative of [X Minecraft Launcher (XMCL)](https://github.com/Voxelum/x-minecraft-launcher). Its origin and retained MIT attribution are documented in [NOTICE](NOTICE). Release binaries are published only through [GatinoLauncher GitHub Releases](https://github.com/GatinoMC/minecraft-launcher/releases).

## Team roles

- Authors and committers: members authorized by the [GatinoMC](https://github.com/GatinoMC) organization.
- Reviewers: the repository owner and explicitly appointed GitHub collaborators. Contributions from other authors must be reviewed before merge.
- Signing approver: an authorized GatinoMC release maintainer. Every release requires manual approval in SignPath.

All maintainers with repository or signing access must enable multi-factor authentication. Signing credentials are stored only as GitHub Actions secrets. The signing workflow verifies that the requested Git tag matches the application version and that SignPath returns a valid Authenticode signature before replacing a release asset.

## Privacy

The launcher privacy disclosures are maintained in [PRIVACY.md](PRIVACY.md). The project does not enable the inherited XMCL application-analytics integration. Network requests are made only to support features selected or configured by the user, Minecraft authentication and content providers, and MineLatino services described in that policy.

## Reporting concerns

Report suspected compromised releases, signing misuse or security problems privately through [GitHub Security Advisories](https://github.com/GatinoMC/minecraft-launcher/security/advisories/new). Do not publish credentials or exploitable details in a public issue.
