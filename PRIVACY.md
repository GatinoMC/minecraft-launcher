# MineLatino Launcher privacy policy

MineLatino Launcher is an open-source Minecraft launcher. It does not enable the external application-analytics or remote-experiment services inherited from XMCL.

The launcher connects to network services when required by a feature the user chooses or by the selected Minecraft installation. These services can include Microsoft and Mojang for account authentication and game resources; Modrinth and CurseForge for optional content; GitHub and the MineLatino launcher backend for application and mod updates; and the MineLatino cosmetics service for MineLatino accounts, ownership, equipment and password recovery.

When a player uses a MineLatino account, the service processes the email address, chosen nickname, password verifier, internal account identifier, sessions, cosmetic ownership and order records needed to provide that account. Passwords are sent only over HTTPS and are not stored as plain text by the service. Launcher session secrets are stored through the operating-system-backed secret storage when available.

The launcher backend can receive ordinary HTTP metadata and the launcher version during configuration and update checks. If playtime features are enabled, it also receives the identity and signed session information needed to validate and aggregate playtime. Third-party services process data under their own privacy policies.

When the optional MineLatino AI assistant is used, the Cosmetics service associates the conversation, prompts, responses and token-usage counters with the same internal MineLatino account identifier. Prompt content is sent to the configured AI provider to generate a response; account passwords, launcher session secrets and administrative credentials are not included. Opening the assistant alone does not send a prompt.

When AFK Farm is used, the MineLatino service associates the assigned time balance and server-calculated usage sessions with the same internal account identifier. The mod sends periodic authenticated heartbeats while automation is active so the service can update the remaining time; it does not send account passwords or provider credentials.

Users can change their password and request account deletion through the launcher. Administrators can assist with recovery, suspension and deletion through the MineLatino panel. Security or privacy questions can be reported through [GitHub Security Advisories](https://github.com/FredyGraces20/MineLatino-Launcher/security/advisories/new).
