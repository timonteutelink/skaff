/**
 * Jest test setup file.
 *
 * Marks the hardened environment as initialized for testing purposes.
 * We can't use the full SES lockdown() in Jest because it conflicts with
 * Jest's mocking system which uses Node.js domains.
 */
import { markHardenedEnvironmentForTesting } from "../src/core/infra/hardened-sandbox";

process.env.SKAFF_TEST_MODE = "true";
markHardenedEnvironmentForTesting();
