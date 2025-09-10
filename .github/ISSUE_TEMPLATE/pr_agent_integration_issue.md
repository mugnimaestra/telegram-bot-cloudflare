---
name: PR-Agent with Chutes AI Integration Issue
about: Report issues with PR-Agent and Chutes AI integration
title: '[PR-Agent Issue] '
labels: 'pr-agent, chutes-ai, bug'
assignees: ''

---

## Issue Description
Please describe the issue you're experiencing with the PR-Agent and Chutes AI integration.

## Environment Information
- **Repository**: [Your repository name]
- **PR-Agent Version**: [Latest]
- **Chutes AI Deployment**: [Self-hosted/Cloud]
- **Node.js Version**: [e.g., 18.x]
- **GitHub Actions Runner**: [Ubuntu-latest/Windows-latest/macOS-latest]

## Issue Details

### Expected Behavior
What did you expect to happen?

### Actual Behavior
What actually happened?

### Error Messages
Please provide any error messages or logs:

```log
# Paste error messages here
```

## Reproduction Steps
Please describe the steps to reproduce the issue:

1. [First step]
2. [Second step]
3. [Third step]

## Configuration Files

### GitHub Actions Workflow
```yaml
# Paste your .github/workflows/pr-agent.yml content here
```

### PR-Agent Configuration
```toml
# Paste your .pr_agent.toml content here
```

### Environment Variables
```env
# Paste relevant environment variables (remove sensitive values)
CHUTES_AI_BASE_URL=
CHUTES_AI_MODEL=
# Other relevant vars (without actual values)
```

## Debugging Information

### Test Script Results
If you've run the test script, please provide the output:

```bash
# Paste the output of `node scripts/test-chutes-ai.js` here
```

### GitHub Actions Logs
Please provide relevant parts of the GitHub Actions logs:

```log
# Paste GitHub Actions logs here
```

### Chutes AI Logs
If available, please provide relevant Chutes AI deployment logs:

```log
# Paste Chutes AI logs here
```

## Troubleshooting Steps Already Taken
Please describe what you've already tried to fix the issue:

- [ ] Ran the test script
- [ ] Verified environment variables
- [ ] Checked GitHub secrets
- [ ] Verified Chutes AI deployment status
- [ ] Tested API connectivity manually
- [ ] Reviewed configuration files
- [ ] Checked GitHub Actions runner logs
- [ ] Other (please specify)

## Additional Context
Add any other context about the problem here, including:
- Screenshots
- Network topology information
- Any other relevant information

## Checklist for Bug Reports
- [ ] I have read the [PR-Agent Chutes AI Setup Guide](../PR_AGENT_CHUTES_AI_SETUP.md)
- [ ] I have provided all the requested information
- [ ] I have tried the troubleshooting steps
- [ ] I have checked for duplicate issues
- [ ] I have provided enough information for the issue to be reproduced