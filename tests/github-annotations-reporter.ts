import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { relative, sep } from 'node:path';

function escapeData(value: string) {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeProperty(value: string) {
  return escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

/** Preserve the actionable Playwright failure in GitHub's check annotations,
 * even when the Actions log archive cannot be fetched. */
export default class GitHubAnnotationsReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === 'passed' || result.status === 'skipped') return;

    const file = relative(process.cwd(), test.location.file).split(sep).join('/');
    const details = result.errors.map(error => error.message || error.stack || error.value || 'Unknown test error');
    const message = `${test.titlePath().join(' › ')}\n${details.join('\n\n') || result.status}`.slice(0, 6000);
    const title = escapeProperty(`Playwright ${result.status}`);
    console.log(`::error file=${escapeProperty(file)},line=${test.location.line},title=${title}::${escapeData(message)}`);
  }
}
