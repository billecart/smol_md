type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const tests: TestCase[] = [];

export function test(name: string, run: TestCase["run"]) {
  tests.push({ name, run });
}

export async function run() {
  let failures = 0;

  for (const [index, testCase] of tests.entries()) {
    try {
      await testCase.run();
      console.log(`ok ${index + 1} - ${testCase.name}`);
    } catch (error) {
      failures += 1;
      console.error(`not ok ${index + 1} - ${testCase.name}`);
      console.error(error);
    }
  }

  console.log("");
  console.log(`${tests.length - failures}/${tests.length} tests passed`);

  if (failures > 0) {
    process.exitCode = 1;
  }
}
