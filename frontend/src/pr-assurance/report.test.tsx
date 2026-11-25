import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { Report } from './Report';
// Built by the real assessment logic from the evidence prcheck-verifiers recorded for each PR commit.
import report6 from './fixtures/report-6.json';
import report7 from './fixtures/report-7.json';
import report8 from './fixtures/report-8.json';

afterEach(cleanup);
const ruleCard = (id: string) => document.querySelector<HTMLElement>(`[data-rule="${id}"]`)!;

describe('PR assurance report', () => {
  it('leads with the result: the disposition and the broken-rule count', () => {
    render(<Report report={report6} />);
    expect(screen.getByText('NOT READY · 2 rules broken · 11 of 14 obligations supported')).toBeTruthy();
    expect(screen.getByText('Violated: FIN-001.1, FIN-002.1, FIN-002.3')).toBeTruthy();
  });

  it('contrasts the team’s green tests with the rules Qivvera found broken', () => {
    render(<Report report={report6} />);
    expect(screen.getByText(/25 of 25 passed/)).toBeTruthy();
    expect(screen.getByText('The team’s own tests all passed, yet 2 business rules are broken.')).toBeTruthy();
  });

  it('shows one card per broken rule, with each failing obligation, its check and what was observed', () => {
    render(<Report report={report6} />);
    expect([...document.querySelectorAll('[data-rule]')].map(e => e.getAttribute('data-rule'))).toEqual(['FIN-001', 'FIN-002']);
    const fin001 = ruleCard('FIN-001');
    expect(within(fin001).getByText(/@qivvra-demo\/finance-controls/)).toBeTruthy();
    expect(within(fin001).getByText('The person who requested a bank account change cannot approve it.')).toBeTruthy();
    expect(within(fin001).getByText('V2/bank-change-self-approval-blocked')).toBeTruthy();
    expect(within(fin001).getByText(/Expected: 403\s+Received: 200/)).toBeTruthy();
    expect(within(fin001).getByText('A violation cannot be waived by an exception.')).toBeTruthy();
    expect([...ruleCard('FIN-002').querySelectorAll('[data-obligation]')].map(e => e.getAttribute('data-obligation'))).toEqual(['FIN-002.1', 'FIN-002.3']);
  });

  it('says what would resolve each failing obligation', () => {
    render(<Report report={report6} />);
    expect(within(ruleCard('FIN-001')).getByText(/Change the code so that “The person who requested a bank account change cannot approve it\.” holds/)).toBeTruthy();
  });

  it('compares with the previous PR: FIN-001 fixed, FIN-002 still broken', () => {
    render(<Report report={report7} />);
    const since = screen.getByRole('region', { name: 'Since PR #6' });
    expect(within(since).getByText('Fixed')).toBeTruthy();
    expect(within(since).getByText('FIN-001')).toBeTruthy();
    expect(within(since).getByText('FIN-002')).toBeTruthy();
    expect(screen.getByText('The team’s own tests all passed, yet 1 business rule is broken.')).toBeTruthy();
  });

  it('a READY report has no rule cards and says every obligation is supported', () => {
    render(<Report report={report8} />);
    expect(screen.getByText('READY · no rules broken · 14 of 14 obligations supported')).toBeTruthy();
    expect(document.querySelectorAll('[data-rule]')).toHaveLength(0);
    expect(screen.getByText('No business rule is broken on this commit.')).toBeTruthy();
  });

  it('lists all 14 obligations with their states', () => {
    render(<Report report={report6} />);
    const all = screen.getByRole('table', { name: 'All obligations' });
    expect(within(all).getAllByRole('row')).toHaveLength(15);
    expect(within(all).getAllByText('VIOLATED')).toHaveLength(3);
  });

  it('shows the proof: commits, digests and the GitHub run', () => {
    render(<Report report={report6} />);
    const proof = screen.getByRole('region', { name: 'Proof' });
    expect(within(proof).getByText(report6.proof.evidenceSha256)).toBeTruthy();
    expect(within(proof).getByText(report6.proof.headSha)).toBeTruthy();
    expect(within(proof).getByText(report6.proof.rulesCommit)).toBeTruthy();
    expect(within(proof).getByRole('link', { name: 'GitHub run' }).getAttribute('href')).toBe(report6.proof.githubRunUrl);
  });

  it('states its scope: not a release approval, and a digest is not a signature', () => {
    render(<Report report={report6} />);
    expect(screen.getByText(/Only these 14 obligations were checked\. This is not a release approval\./)).toBeTruthy();
    expect(screen.getByText(/it is not a signature/)).toBeTruthy();
  });

  it('when the team’s tests could not run, says so instead of inventing a count', () => {
    render(<Report report={{ ...report6, teamTests: null }} />);
    expect(screen.getByText(/The team’s own tests could not run on this commit/)).toBeTruthy();
  });

  it('shows observations as text, never as HTML', () => {
    const hostile = structuredClone(report6);
    hostile.rules[1]!.obligations[0]!.observation = { note: '<img src=x onerror=alert(1)>' } as never;
    render(<Report report={hostile} />);
    expect(document.querySelector('img')).toBeNull();
  });
});
