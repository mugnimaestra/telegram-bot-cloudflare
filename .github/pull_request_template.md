# Pull Request Template for Testing PR-Agent Integration

## Changes Description
Please provide a clear and concise description of your changes:
- What was changed?
- Why was it changed?
- How was it implemented?

## Type of Change
Please delete options that are not relevant.

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Test additions or modifications

## Testing
Please describe the tests that you ran to verify your changes:
- Unit tests
- Integration tests
- Manual testing steps

## Checklist
- [ ] My code follows the project's coding style and guidelines
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings or errors
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published in downstream modules

## Additional Notes
Add any additional context or screenshots about the pull request here.

---

## PR-Agent Test Section (for Chutes AI Integration Testing)

This section is specifically for testing the PR-Agent integration with Chutes AI. The AI should review the code changes and provide feedback on:

1. Code quality and best practices
2. TypeScript-specific improvements
3. Cloudflare Workers optimizations
4. Security considerations
5. Performance suggestions

### Expected AI Review Areas:
- Type safety improvements
- Error handling patterns
- Async/await usage
- Memory efficiency
- API design
- Naming conventions
- Documentation completeness

### Test Code Sample (if applicable):
```typescript
// Example of the type of code PR-Agent should review
export class TestClass {
  private readonly config: Config;
  
  constructor(config: Config) {
    this.config = config;
  }
  
  async processData(data: unknown): Promise<Result> {
    try {
      // Implementation to be reviewed
      const result = await this.transform(data);
      return this.validate(result);
    } catch (error) {
      console.error('Processing failed:', error);
      throw new Error('Data processing failed');
    }
  }
  
  private async transform(data: unknown): Promise<ProcessedData> {
    // Transform logic
    return data as ProcessedData;
  }
  
  private validate(data: ProcessedData): Result {
    // Validation logic
    return { success: true, data };
  }
}