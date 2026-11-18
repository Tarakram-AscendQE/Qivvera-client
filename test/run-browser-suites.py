"""Run native local-HTTP browser journeys with explicit, non-skippable results."""
from pathlib import Path
import json
import os
import signal
import subprocess
import sys
from playwright.sync_api import sync_playwright

work = Path(__file__).resolve().parents[1]
out = Path(os.environ.get('QIVVERA_TEST_OUTPUT', str(work / 'review-test-results'))).resolve()
out.mkdir(parents=True, exist_ok=True)
env = {**os.environ, 'QIVVERA_TEST_OUTPUT': str(out)}
if not env.get('CHROMIUM_EXECUTABLE'):
    with sync_playwright() as playwright:
        bundled = Path(playwright.chromium.executable_path)
    env['CHROMIUM_EXECUTABLE'] = str(bundled if bundled.is_file() else Path('/usr/bin/chromium'))

suites = ['browser-workflow.py', 'browser-assurance.py', 'browser-resolution.py', 'first-release-browser.py']
report = {
    'passed': False,
    'method': 'Native Chromium navigation against real local HTTP and disposable SQLite fixtures.',
    'hostedAcceptance': 'not-performed',
    'tlsAcceptance': 'not-performed',
    'suites': [],
}
for name in suites:
    print(f'Running native browser journey: {name}', flush=True)
    log_path = out / (Path(name).stem + '-runner.log')
    with log_path.open('w') as log:
        proc = subprocess.Popen([sys.executable, str(work / 'test' / name)], cwd=work,
                                env=env, stdout=log, stderr=subprocess.STDOUT,
                                start_new_session=True)
        try:
            status = proc.wait(timeout=240)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGTERM)
            try:
                proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
            status = 124
    report['suites'].append({'name': name, 'exitCode': status, 'passed': status == 0})
    print(log_path.read_text(errors='replace')[-18000:], flush=True)
    # Every suite reports independently. A blocked or failed suite still fails the entire gate;
    # it never gets replaced by rendered/stubbed components or prevents other journeys from running.

report['passed'] = len(report['suites']) == len(suites) and all(x['passed'] for x in report['suites'])
(out / 'browser-suites-report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
raise SystemExit(0 if report['passed'] else 1)
