import { describe, expect, it } from 'vitest';
import { prAssuranceTarget } from './targets';

const scenario = { pulls: [6, 7, 8].map((number, i) => ({ number, pull: { headSha: ['af51c26b0b9f94894cccfaa5b0fb893221952c65', 'ae50debcd01bcc47fc137855cbc21b0e72107f1e', 'b62db000bfef1449fa64588542bdb45d5abe9589'][i] } })) };

describe('where Run assurance goes', () => {
  it('opens the imported PR whose head is the change\'s source commit (short or full, any case)', () => {
    expect(prAssuranceTarget('a1', scenario, 'af51c26b0b9f')).toBe('#/pr-assurance/apps/a1/pulls/6');
    expect(prAssuranceTarget('a1', scenario, 'AE50DEB')).toBe('#/pr-assurance/apps/a1/pulls/7');
    expect(prAssuranceTarget('a1', scenario, 'b62db000bfef1449fa64588542bdb45d5abe9589')).toBe('#/pr-assurance/apps/a1/pulls/8');
  });

  it('otherwise opens the application\'s pull requests', () => {
    for (const revision of ['3f6e20d', '', undefined, 'abc', 'not-a-commit']) {
      expect(prAssuranceTarget('a1', scenario, revision)).toBe('#/pr-assurance/apps/a1');
    }
    expect(prAssuranceTarget('a1', { pulls: [] }, 'af51c26')).toBe('#/pr-assurance/apps/a1');
  });
});
