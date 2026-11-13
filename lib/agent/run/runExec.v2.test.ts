/** @jest-environment node */
/**
 * Phase 3.5b: the whole runExec suite again, with every run started as a v2 run (engineFor → true, so the Phase 3
 * engine in engineBridge decides each tick). The same plans must give the same results, stops, approvals, resumes and
 * refunds as a v1 run: the engine only changes who decides, never what a step costs or delivers.
 */
process.env.RUN_EXEC_SUITE_V2 = '1';
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./runExec.test');
