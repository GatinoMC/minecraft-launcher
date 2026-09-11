# MineLatino Launcher code signing policy

Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

## Signed artifacts

Only the official Windows installer named `minelatino-<version>-win32-x64.exe` is submitted for signing. It is rebuilt from the matching public Git tag by [the signing workflow](.github/workflows/sign-release.yml). Local builds, pull-request builds, dependencies, portable archives and binaries belonging to upstream projects are not signed with the MineLatino subscription.

MineLatino Launcher is a maintained derivative of [X Minecraft Launcher (XMCL)](https://github.com/Voxelum/x-minecraft-launcher). Its origin and retained MIT attribution are documented in [NOTICE](NOTICE). Release binaries are published only through [MineLatino Launcher GitHub Releases](https://github.com/FredyGraces20/MineLatino-Launcher/releases).

## Team roles

- Authors and committers: [FredyGraces20](https://github.com/FredyGraces20), the repository owner and maintainer.
- Reviewers: the repository owner and explicitly appointed GitHub collaborators. Contributions from other authors must be reviewed before merge.
- Signing approver: [FredyGraces20](https://github.com/FredyGraces20). Every release requires manual approval in SignPath.

All maintainers with repository or signing access must enable multi-factor authentication. Signing credentials are stored only as GitHub Actions secrets. The signing workflow verifies that the requested Git tag matches the application version and that SignPath returns a valid Authenticode signature before replacing a release asset.

## Privacy

The launcher privacy disclosures are maintained in [PRIVACY.md](PRIVACY.md). The project does not enable the inherited XMCL application-analytics integration. Network requests are made only to support features selected or configured by the user, Minecraft authentication and content providers, and MineLatino services described in that policy.

## Reporting concerns

Report suspected compromised releases, signing misuse or security problems privately through [GitHub Security Advisories](https://github.com/FredyGraces20/MineLatino-Launcher/security/advisories/new). Do not publish credentials or exploitable details in a public issue.

