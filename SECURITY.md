# Security Policy

## Supported Versions

We provide security patches for the following versions of Notebench:

| Version | Supported | Notes |
|---|---|---|
| `0.1.x` (current alpha) | :white_check_mark: | Active development & critical security patches |
| `< 0.1.0` | :x: | Pre-release experimental builds are unsupported |

---

## Reporting a Vulnerability

We take the security and privacy of Notebench and its self-hosted instances very seriously.

**Please do NOT report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

### How to Report

1. Navigate to the repository's **Security** tab on GitHub.
2. Select **Report a vulnerability** to open a draft advisory using [GitHub Private Vulnerability Reporting (GHSA)](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability).
3. Provide a clear description of the vulnerability, including:
   - Type of vulnerability (e.g. SSRF, prompt injection bypass, path traversal, IDOR).
   - Step-by-step reproduction instructions or a minimal proof of concept.
   - Any known mitigations or affected versions/components.

### Response Timelines & SLA

Consistent with coordinated disclosure norms:
- **Acknowledgment**: We aim to acknowledge reports within **3 business days** of submission.
- **Assessment**: We will assess severity and confirm impact within **7 business days**.
- **Remediation**: We aim to ship a verified patch or mitigation within **90 days** of confirming a report (or sooner for high/critical vulnerabilities).
- **Advisory & Release**: The advisory and patched container/release will be published simultaneously to protect self-hosted installations.

---

